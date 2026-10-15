/**
 * Background Job Queue Type Definitions
 */

export type JobType = "DOCUMENT_EXTRACTION" | "DRAFT_GENERATION" | "EXPORT_GENERATION";
export type JobStatus = "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface DocumentExtractionPayload {
  documentId: string;
  caseId: string;
}

export interface DraftGenerationPayload {
  documentId: string;
  caseId: string;
}

export interface ExportGenerationPayload {
  caseId: string;
  exportFormat: "JSON" | "ARCHIVE";
}

export type JobPayload =
  | DocumentExtractionPayload
  | DraftGenerationPayload
  | ExportGenerationPayload
  | Record<string, unknown>;

export interface EnqueueJobOptions {
  jobType: JobType;
  payload: JobPayload;
  priority?: number; // Higher number = higher priority (default 0)
  idempotencyKey?: string;
  runAt?: Date;
  maxAttempts?: number;
}

export interface BackgroundJobRecord {
  id: string;
  organizationId: string;
  jobType: JobType;
  status: JobStatus;
  payload: unknown;
  result: unknown | null;
  errorMessage: string | null;
  attempts: number;
  maxAttempts: number;
  priority: number;
  runAt: Date;
  lockedAt: Date | null;
  lockedBy: string | null;
  heartbeatAt: Date | null;
  completedAt: Date | null;
  idempotencyKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface QueueMetrics {
  queued: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled: number;
  total: number;
}
