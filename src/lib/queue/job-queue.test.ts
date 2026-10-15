import { describe, it, expect, beforeEach } from "vitest";
import { config } from "dotenv";
config({ path: ".env.local" });

import { getPrismaClient } from "@/lib/db";
import { enqueueJob, getJobById, cancelJob, getQueueMetrics } from "./job-queue";
import { claimNextJob, markJobCompleted, handleJobFailure } from "./job-worker";
import { TenantContext } from "@/lib/auth/tenant";

const TENANT_A: TenantContext = {
  organizationId: "org_notariat_queue_a",
  organizationSlug: "notariat-queue-a",
  organizationName: "Notariat Queue A",
  jurisdiction: "DE-BY",
  userId: "user_queue_a",
  userName: "Notar Queue A",
  userRole: "NOTARY",
  userEmail: "a@notariat-queue.de",
};

const TENANT_B: TenantContext = {
  organizationId: "org_notariat_queue_b",
  organizationSlug: "notariat-queue-b",
  organizationName: "Notariat Queue B",
  jurisdiction: "DE-BY",
  userId: "user_queue_b",
  userName: "Notar Queue B",
  userRole: "NOTARY",
  userEmail: "b@notariat-queue.de",
};

describe("Reliable Background Job Queue & Worker", () => {
  const prisma = getPrismaClient();

  beforeEach(async () => {
    if (prisma) {
      // Ensure test organizations exist
      await prisma.organization.upsert({
        where: { id: TENANT_A.organizationId },
        update: {},
        create: {
          id: TENANT_A.organizationId,
          name: TENANT_A.organizationName,
          slug: "notariat-queue-a",
        },
      });
      await prisma.organization.upsert({
        where: { id: TENANT_B.organizationId },
        update: {},
        create: {
          id: TENANT_B.organizationId,
          name: TENANT_B.organizationName,
          slug: "notariat-queue-b",
        },
      });

      // Clear previous test jobs
      await prisma.backgroundJob.deleteMany({
        where: {
          organizationId: { in: [TENANT_A.organizationId, TENANT_B.organizationId] },
        },
      });
    }
  });

  it("enqueues a job with tenant scoping and retrieves it", async () => {
    const job = await enqueueJob(TENANT_A, {
      jobType: "DOCUMENT_EXTRACTION",
      payload: { documentId: "doc_123", caseId: "case_123" },
      priority: 5,
    });

    expect(job.id).toBeDefined();
    expect(job.organizationId).toBe(TENANT_A.organizationId);
    expect(job.status).toBe("QUEUED");
    expect(job.priority).toBe(5);

    const fetched = await getJobById(TENANT_A, job.id);
    expect(fetched.id).toBe(job.id);
  });

  it("enforces tenant isolation: Tenant B cannot access Tenant A's jobs", async () => {
    const job = await enqueueJob(TENANT_A, {
      jobType: "DRAFT_GENERATION",
      payload: { documentId: "doc_123", caseId: "case_123" },
    });

    await expect(getJobById(TENANT_B, job.id)).rejects.toThrow(
      /Tenant Isolation Violation|Mandanten-Isolation/
    );
  });

  it("deduplicates jobs using idempotencyKey (no duplicate jobs on retry)", async () => {
    const idempotencyKey = `idemp_${Date.now()}`;

    const job1 = await enqueueJob(TENANT_A, {
      jobType: "EXPORT_GENERATION",
      payload: { caseId: "case_456", exportFormat: "JSON" },
      idempotencyKey,
    });

    const job2 = await enqueueJob(TENANT_A, {
      jobType: "EXPORT_GENERATION",
      payload: { caseId: "case_456", exportFormat: "JSON" },
      idempotencyKey,
    });

    expect(job1.id).toBe(job2.id); // Same job returned, not duplicated!
  });

  it("claims next job using SKIP LOCKED concurrency semantics and updates attempts", async () => {
    const job = await enqueueJob(TENANT_A, {
      jobType: "EXPORT_GENERATION",
      payload: { caseId: "case_789", exportFormat: "JSON" },
      priority: 10,
    });

    const claimed = await claimNextJob("worker_unit_1");
    expect(claimed).not.toBeNull();
    expect(claimed?.id).toBe(job.id);
    expect(claimed?.status).toBe("PROCESSING");
    expect(claimed?.lockedBy).toBe("worker_unit_1");
    expect(claimed?.attempts).toBe(1);

    // Second worker cannot claim the same job (SKIP LOCKED)
    const claimedAgain = await claimNextJob("worker_unit_2");
    expect(claimedAgain).toBeNull();

    // Mark completed
    await markJobCompleted(claimed!.id, { success: true });
    const finalJob = await getJobById(TENANT_A, job.id);
    expect(finalJob.status).toBe("COMPLETED");
  });

  it("implements exponential backoff on retry and terminal dead-letter on maxAttempts", async () => {
    const job = await enqueueJob(TENANT_A, {
      jobType: "EXPORT_GENERATION",
      payload: { caseId: "case_retry" },
      maxAttempts: 2,
    });

    const claimed = await claimNextJob("worker_retry");
    expect(claimed).not.toBeNull();

    // Attempt 1 failure -> should be RETRYING with exponential backoff runAt in future
    const outcome1 = await handleJobFailure(claimed!, new Error("Temporary provider 429"));
    expect(outcome1).toBe("RETRYING");

    const retryingJob = await getJobById(TENANT_A, job.id);
    expect(retryingJob.status).toBe("QUEUED");
    expect(retryingJob.runAt.getTime()).toBeGreaterThan(Date.now());
    expect(retryingJob.errorMessage).toContain("Versuch 1/2 fehlgeschlagen");

    // Manually reset runAt to now for attempt 2
    await prisma?.backgroundJob.update({
      where: { id: job.id },
      data: { runAt: new Date(Date.now() - 1000) },
    });

    const claimed2 = await claimNextJob("worker_retry_2");
    expect(claimed2?.attempts).toBe(2);

    // Attempt 2 failure -> should reach terminal FAILED
    const outcome2 = await handleJobFailure(claimed2!, new Error("Permanent fatal error"));
    expect(outcome2).toBe("FAILED");

    const terminalJob = await getJobById(TENANT_A, job.id);
    expect(terminalJob.status).toBe("FAILED");
    expect(terminalJob.completedAt).not.toBeNull();
    expect(terminalJob.errorMessage).toContain("Terminal fehlgeschlagen nach 2 Versuchen");
  });

  it("recovers stale leases from crashed workers (lease timeout recovery)", async () => {
    const job = await enqueueJob(TENANT_A, {
      jobType: "EXPORT_GENERATION",
      payload: { caseId: "case_crash" },
    });

    // Simulate worker that claimed the job and died 5 minutes ago
    const staleTime = new Date(Date.now() - 5 * 60 * 1000);
    await prisma?.backgroundJob.update({
      where: { id: job.id },
      data: {
        status: "PROCESSING",
        lockedAt: staleTime,
        heartbeatAt: staleTime,
        lockedBy: "dead_worker_pid_9999",
      },
    });

    // New active worker polls -> must reclaim the stale job!
    const reclaimed = await claimNextJob("live_worker_pid_1000");
    expect(reclaimed).not.toBeNull();
    expect(reclaimed?.id).toBe(job.id);
    expect(reclaimed?.lockedBy).toBe("live_worker_pid_1000");
  });

  it("cancels a queued job and reports queue metrics", async () => {
    const job = await enqueueJob(TENANT_A, {
      jobType: "EXPORT_GENERATION",
      payload: { caseId: "case_cancel" },
    });

    const cancelled = await cancelJob(TENANT_A, job.id);
    expect(cancelled.status).toBe("CANCELLED");

    const metrics = await getQueueMetrics(TENANT_A);
    expect(metrics.cancelled).toBeGreaterThanOrEqual(1);
  });
});
