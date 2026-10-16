import { getPrismaClient } from "@/lib/db";
import { TenantContext } from "@/lib/auth/tenant";
import { BackgroundJobRecord, JobType } from "./types";
import { triggerExtraction } from "@/lib/services/extraction-service";
import { generateDraft } from "@/lib/services/draft-service";
import { generateXnpExportPackage } from "@/lib/integrations/xnp/export-service";
import { XnpExportType } from "@/lib/integrations/xnp/types";

export interface WorkerProcessResult {
  processed: boolean;
  jobId?: string;
  jobType?: JobType;
  status?: "COMPLETED" | "FAILED" | "RETRYING";
  error?: string;
}

/**
 * Claim the next available job using PostgreSQL SKIP LOCKED concurrency control.
 * Automatically claims stale leases from crashed workers (lease timeout: 3 minutes).
 */
export async function claimNextJob(workerId: string): Promise<BackgroundJobRecord | null> {
  const prisma = getPrismaClient();
  if (!prisma) return null;

  try {
    const claimedRows = await prisma.$queryRawUnsafe<BackgroundJobRecord[]>(
      `WITH claimable AS (
        SELECT id FROM background_jobs
        WHERE (status = 'QUEUED' AND run_at <= NOW())
           OR (status = 'PROCESSING' AND (
                locked_at < NOW() - INTERVAL '3 minutes' 
                OR heartbeat_at < NOW() - INTERVAL '3 minutes'
              ))
        ORDER BY priority DESC, run_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE background_jobs
      SET status = 'PROCESSING',
          locked_at = NOW(),
          locked_by = $1,
          heartbeat_at = NOW(),
          attempts = attempts + 1,
          updated_at = NOW()
      WHERE id IN (SELECT id FROM claimable)
      RETURNING 
        id, organization_id as "organizationId", job_type as "jobType",
        status, payload, result, error_message as "errorMessage",
        attempts, max_attempts as "maxAttempts", priority, run_at as "runAt",
        locked_at as "lockedAt", locked_by as "lockedBy", heartbeat_at as "heartbeatAt",
        completed_at as "completedAt", idempotency_key as "idempotencyKey",
        created_at as "createdAt", updated_at as "updatedAt";`,
      workerId
    );

    if (claimedRows.length === 0) {
      return null;
    }

    return claimedRows[0] as BackgroundJobRecord;
  } catch (err) {
    console.error("claimNextJob query failed:", err);
    return null;
  }
}

/**
 * Update heartbeat timestamp for a running job.
 */
export async function updateJobHeartbeat(jobId: string): Promise<void> {
  const prisma = getPrismaClient();
  if (!prisma) return;

  try {
    await prisma.backgroundJob.update({
      where: { id: jobId },
      data: { heartbeatAt: new Date() },
    });
  } catch (err) {
    console.warn(`Heartbeat update failed for job ${jobId}:`, err);
  }
}

/**
 * Mark a job as successfully completed.
 */
export async function markJobCompleted(
  jobId: string,
  result: unknown
): Promise<void> {
  const prisma = getPrismaClient();
  if (!prisma) return;

  await prisma.backgroundJob.update({
    where: { id: jobId },
    data: {
      status: "COMPLETED",
      result: (result as object) || {},
      completedAt: new Date(),
      errorMessage: null,
    },
  });
}

/**
 * Mark a job as failed, triggering exponential backoff retry if attempts < maxAttempts.
 */
export async function handleJobFailure(
  job: BackgroundJobRecord,
  error: Error
): Promise<"FAILED" | "RETRYING"> {
  const prisma = getPrismaClient();
  if (!prisma) return "FAILED";

  const errorMessage = error.message || "Unbekannter Fehler bei der Auftragsausführung.";

  if (job.attempts < job.maxAttempts) {
    // Exponential backoff: 2s, 8s, 32s (capped at 5 minutes)
    const backoffSeconds = Math.min(300, Math.pow(2, job.attempts) * 2);
    const nextRunAt = new Date(Date.now() + backoffSeconds * 1000);

    await prisma.backgroundJob.update({
      where: { id: job.id },
      data: {
        status: "QUEUED",
        runAt: nextRunAt,
        lockedAt: null,
        lockedBy: null,
        heartbeatAt: null,
        errorMessage: `Versuch ${job.attempts}/${job.maxAttempts} fehlgeschlagen: ${errorMessage}`,
      },
    });

    return "RETRYING";
  } else {
    // Terminal failure (Dead-letter state)
    await prisma.backgroundJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        errorMessage: `Terminal fehlgeschlagen nach ${job.attempts} Versuchen: ${errorMessage}`,
      },
    });

    return "FAILED";
  }
}

/**
 * Execute the domain logic for a specific job payload.
 */
export async function executeJobPayload(
  job: BackgroundJobRecord
): Promise<unknown> {
  const tenant: TenantContext = {
    organizationId: job.organizationId,
    organizationSlug: `org-${job.organizationId}`,
    organizationName: "Kanzlei Background Worker",
    jurisdiction: "DE-BY",
    userId: "system_worker",
    userName: "System Worker",
    userRole: "ADMIN",
    userEmail: "worker@kanzleiflow.internal",
  };

  const payload = job.payload as Record<string, unknown>;

  switch (job.jobType) {
    case "DOCUMENT_EXTRACTION": {
      const documentId = String(payload.documentId);
      if (!documentId) throw new Error("Fehlende documentId im Auftrags-Payload.");
      return await triggerExtraction(tenant, documentId);
    }

    case "DRAFT_GENERATION": {
      const documentId = String(payload.documentId);
      if (!documentId) throw new Error("Fehlende documentId im Auftrags-Payload.");
      return await generateDraft(tenant, documentId);
    }

    case "EXPORT_GENERATION": {
      const caseId = String(payload.caseId);
      if (!caseId) throw new Error("Fehlende caseId im Auftrags-Payload.");
      const exportType = (payload.exportType as XnpExportType) || "XNOTAR_GRUNDBUCH_XML";
      return await generateXnpExportPackage(tenant, {
        caseId,
        exportType,
        includeAttachments: payload.includeAttachments !== false,
        allowPartialDraft: payload.allowPartialDraft === true,
      });
    }

    default:
      throw new Error(`Unbekannter Auftragstyp: ${job.jobType}`);
  }
}

/**
 * Execute a single iteration of the worker: claim one job, execute with timeout, update status.
 */
export async function runWorkerIteration(
  workerId: string = `worker_${process.pid}_${Math.random().toString(36).slice(2, 7)}`
): Promise<WorkerProcessResult> {
  const job = await claimNextJob(workerId);
  if (!job) {
    return { processed: false };
  }

  // Periodic heartbeat during execution
  const heartbeatTimer = setInterval(() => {
    updateJobHeartbeat(job.id);
  }, 15000);

  try {
    const result = await executeJobPayload(job);
    clearInterval(heartbeatTimer);
    await markJobCompleted(job.id, result);

    return {
      processed: true,
      jobId: job.id,
      jobType: job.jobType,
      status: "COMPLETED",
    };
  } catch (err: unknown) {
    clearInterval(heartbeatTimer);
    const error = err as Error;
    const finalStatus = await handleJobFailure(job, error);

    return {
      processed: true,
      jobId: job.id,
      jobType: job.jobType,
      status: finalStatus,
      error: error.message,
    };
  }
}
