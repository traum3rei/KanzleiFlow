import { getPrismaClient } from "@/lib/db";
import { TenantContext, assertTenantOwnership } from "@/lib/auth/tenant";
import {
  EnqueueJobOptions,
  BackgroundJobRecord,
  QueueMetrics,
  JobStatus,
} from "./types";

export class JobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`Hintergrundauftrag mit ID '${jobId}' nicht gefunden.`);
    this.name = "JobNotFoundError";
  }
}

/**
 * Enqueue a new durable background job with idempotency deduplication.
 */
export async function enqueueJob(
  tenant: TenantContext,
  options: EnqueueJobOptions
): Promise<BackgroundJobRecord> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error("Datenbankverbindung nicht verfügbar.");
  }

  // Idempotency deduplication check
  if (options.idempotencyKey) {
    const existingJob = await prisma.backgroundJob.findUnique({
      where: { idempotencyKey: options.idempotencyKey },
    });

    if (existingJob) {
      assertTenantOwnership(tenant, existingJob.organizationId);

      // If existing job is still queued or processing, return it directly
      if (existingJob.status === "QUEUED" || existingJob.status === "PROCESSING") {
        return existingJob as BackgroundJobRecord;
      }
    }
  }

  const createdJob = await prisma.backgroundJob.create({
    data: {
      organizationId: tenant.organizationId,
      jobType: options.jobType,
      status: "QUEUED",
      payload: options.payload as object,
      priority: options.priority ?? 0,
      idempotencyKey: options.idempotencyKey || null,
      runAt: options.runAt ?? new Date(),
      maxAttempts: options.maxAttempts ?? 3,
    },
  });

  return createdJob as BackgroundJobRecord;
}

/**
 * Retrieve a background job by ID with strict tenant isolation.
 */
export async function getJobById(
  tenant: TenantContext,
  jobId: string
): Promise<BackgroundJobRecord> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error("Datenbankverbindung nicht verfügbar.");
  }

  const job = await prisma.backgroundJob.findUnique({
    where: { id: jobId },
  });

  if (!job) {
    throw new JobNotFoundError(jobId);
  }

  assertTenantOwnership(tenant, job.organizationId);
  return job as BackgroundJobRecord;
}

/**
 * Cancel a pending job.
 */
export async function cancelJob(
  tenant: TenantContext,
  jobId: string
): Promise<BackgroundJobRecord> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error("Datenbankverbindung nicht verfügbar.");
  }

  const job = await prisma.backgroundJob.findUnique({
    where: { id: jobId },
  });

  if (!job) {
    throw new JobNotFoundError(jobId);
  }

  assertTenantOwnership(tenant, job.organizationId);

  if (job.status !== "QUEUED") {
    throw new Error(`Auftrag im Status '${job.status}' kann nicht storniert werden.`);
  }

  const cancelled = await prisma.backgroundJob.update({
    where: { id: jobId },
    data: { status: "CANCELLED" },
  });

  return cancelled as BackgroundJobRecord;
}

/**
 * List jobs for a tenant with bounded pagination.
 */
export async function listJobs(
  tenant: TenantContext,
  options?: { status?: JobStatus; take?: number; skip?: number }
): Promise<BackgroundJobRecord[]> {
  const prisma = getPrismaClient();
  if (!prisma) return [];

  const take = Math.min(options?.take || 25, 100);
  const skip = options?.skip || 0;

  const jobs = await prisma.backgroundJob.findMany({
    where: {
      organizationId: tenant.organizationId,
      ...(options?.status ? { status: options.status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
    skip,
  });

  return jobs as BackgroundJobRecord[];
}

/**
 * Retrieve queue metrics across the system or scoped to a tenant.
 */
export async function getQueueMetrics(tenant?: TenantContext): Promise<QueueMetrics> {
  const prisma = getPrismaClient();
  const metrics: QueueMetrics = {
    queued: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    total: 0,
  };

  if (!prisma) return metrics;

  try {
    const grouped = await prisma.backgroundJob.groupBy({
      by: ["status"],
      where: tenant ? { organizationId: tenant.organizationId } : undefined,
      _count: { _all: true },
    });

    let total = 0;
    for (const g of grouped) {
      const count = g._count._all;
      total += count;
      switch (g.status) {
        case "QUEUED":
          metrics.queued = count;
          break;
        case "PROCESSING":
          metrics.processing = count;
          break;
        case "COMPLETED":
          metrics.completed = count;
          break;
        case "FAILED":
          metrics.failed = count;
          break;
        case "CANCELLED":
          metrics.cancelled = count;
          break;
      }
    }
    metrics.total = total;
  } catch (err) {
    console.warn("Could not retrieve queue metrics:", err);
  }

  return metrics;
}
