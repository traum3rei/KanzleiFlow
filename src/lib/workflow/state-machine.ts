import { DocumentWorkflowStatus } from "@/generated/prisma/enums";

export class WorkflowTransitionError extends Error {
  constructor(public from: DocumentWorkflowStatus, public to: DocumentWorkflowStatus) {
    super(
      `Ungültiger Workflow-Übergang: Der Wechsel von Zustand '${from}' nach '${to}' ist nicht gestattet.`
    );
    this.name = "WorkflowTransitionError";
  }
}

/**
 * Validated explicit transition map for document processing.
 *
 * UPLOADED → EXTRACTING → NEEDS_REVIEW → APPROVED → GENERATING → DRAFT_READY
 * Failure states: EXTRACTION_FAILED, GENERATION_FAILED
 */
export const ALLOWED_TRANSITIONS: Record<DocumentWorkflowStatus, DocumentWorkflowStatus[]> = {
  UPLOADED: ["EXTRACTING", "EXTRACTION_FAILED"],
  EXTRACTING: ["NEEDS_REVIEW", "EXTRACTION_FAILED"],
  NEEDS_REVIEW: ["APPROVED", "EXTRACTING"],
  APPROVED: ["GENERATING", "NEEDS_REVIEW"],
  GENERATING: ["DRAFT_READY", "GENERATION_FAILED"],
  DRAFT_READY: ["GENERATING", "NEEDS_REVIEW"],
  EXTRACTION_FAILED: ["EXTRACTING", "UPLOADED"],
  GENERATION_FAILED: ["GENERATING", "APPROVED"],
};

export function canTransition(
  from: DocumentWorkflowStatus,
  to: DocumentWorkflowStatus
): boolean {
  if (from === to) return true; // Idempotent no-op allowed
  const allowed = ALLOWED_TRANSITIONS[from];
  return Boolean(allowed && allowed.includes(to));
}

export function assertValidTransition(
  from: DocumentWorkflowStatus,
  to: DocumentWorkflowStatus
): void {
  if (!canTransition(from, to)) {
    throw new WorkflowTransitionError(from, to);
  }
}

export const workflowStatusLabels: Record<DocumentWorkflowStatus, string> = {
  UPLOADED: "Hochgeladen (Bereit zur Extraktion)",
  EXTRACTING: "KI-Extraktion läuft...",
  NEEDS_REVIEW: "Prüfung erforderlich (Human-in-the-Loop)",
  APPROVED: "Geprüft & Freigegeben",
  GENERATING: "Dokumentenentwurf wird generiert...",
  DRAFT_READY: "Entwurf fertiggestellt",
  EXTRACTION_FAILED: "Extraktion fehlgeschlagen",
  GENERATION_FAILED: "Entwurfsgenerierung fehlgeschlagen",
};

export const workflowStepNumbers: Record<DocumentWorkflowStatus, number> = {
  UPLOADED: 1,
  EXTRACTING: 2,
  NEEDS_REVIEW: 3,
  APPROVED: 4,
  GENERATING: 5,
  DRAFT_READY: 6,
  EXTRACTION_FAILED: 2,
  GENERATION_FAILED: 5,
};
