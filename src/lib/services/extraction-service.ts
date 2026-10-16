import { getPrismaClient } from "@/lib/db";
import { TenantContext, assertTenantOwnership } from "@/lib/auth/tenant";
import { assertValidTransition } from "@/lib/workflow/state-machine";
import { getLLMProvider } from "@/lib/ai/provider";
import {
  ExtractedLegalFields,
  ExtractedLegalFieldsSchema,
} from "@/lib/ai/schema";
import { DocumentWorkflowStatus } from "@/generated/prisma/enums";

export class ExtractionServiceError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "ExtractionServiceError";
  }
}

/**
 * Triggers LLM extraction for an uploaded document.
 * Follows validated workflow state transitions: UPLOADED -> EXTRACTING -> NEEDS_REVIEW (or EXTRACTION_FAILED).
 */
export async function triggerExtraction(
  tenant: TenantContext,
  documentId: string
): Promise<{
  documentId: string;
  workflowStatus: DocumentWorkflowStatus;
  extractedData: ExtractedLegalFields;
  missingFields: string[];
  discrepancies: string[];
}> {
  const prisma = getPrismaClient();
  if (!prisma) throw new Error("Datenbankverbindung nicht verfügbar.");

  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: { extractionResult: true },
  });

  if (!doc) {
    throw new ExtractionServiceError(`Dokument '${documentId}' nicht gefunden.`);
  }

  assertTenantOwnership(tenant, doc.organizationId);

  // Validate state transition UPLOADED -> EXTRACTING (or retry from EXTRACTION_FAILED / NEEDS_REVIEW)
  assertValidTransition(doc.workflowStatus, "EXTRACTING");

  // Mark as EXTRACTING
  await prisma.$transaction([
    prisma.document.update({
      where: { id: documentId },
      data: { workflowStatus: "EXTRACTING" },
    }),
    prisma.extractionResult.update({
      where: { documentId },
      data: {
        workflowStatus: "EXTRACTING",
        status: "PROCESSING",
        errorMessage: null,
      },
    }),
  ]);

  try {
    const rawText = doc.extractionResult?.rawText;
    if (!rawText || rawText.trim().length === 0) {
      throw new ExtractionServiceError("Kein Rohtext im Dokument vorhanden.");
    }

    const provider = getLLMProvider();
    const extractedData = await provider.extractLegalFields(rawText);

    // Transition to NEEDS_REVIEW
    assertValidTransition("EXTRACTING", "NEEDS_REVIEW");

    await prisma.$transaction([
      prisma.document.update({
        where: { id: documentId },
        data: { workflowStatus: "NEEDS_REVIEW" },
      }),
      prisma.extractionResult.update({
        where: { documentId },
        data: {
          workflowStatus: "NEEDS_REVIEW",
          status: "COMPLETED",
          extractedData: extractedData as unknown as object,
          missingFields: extractedData.missingFields,
          discrepancies: extractedData.discrepancies,
          confidence: extractedData.confidence,
          modelUsed: provider.name,
          errorMessage: null,
        },
      }),
    ]);

    // Audit log
    try {
      await prisma.auditEvent.create({
        data: {
          organizationId: tenant.organizationId,
          userId: tenant.userId,
          action: "EXTRACTION_COMPLETED",
          entityType: "Document",
          entityId: documentId,
          metadata: {
            modelUsed: provider.name,
            partiesCount: extractedData.parties.length,
            missingFieldsCount: extractedData.missingFields.length,
            confidence: extractedData.confidence,
          },
        },
      });
    } catch (auditErr) {
      console.warn("Audit-Log fehlgeschlagen:", auditErr);
    }

    return {
      documentId,
      workflowStatus: "NEEDS_REVIEW",
      extractedData,
      missingFields: extractedData.missingFields,
      discrepancies: extractedData.discrepancies,
    };
  } catch (err: unknown) {
    const message = (err as Error).message || "Unbekannter Fehler bei der Extraktion.";

    // Transition to EXTRACTION_FAILED
    await prisma.$transaction([
      prisma.document.update({
        where: { id: documentId },
        data: { workflowStatus: "EXTRACTION_FAILED" },
      }),
      prisma.extractionResult.update({
        where: { documentId },
        data: {
          workflowStatus: "EXTRACTION_FAILED",
          status: "FAILED",
          errorMessage: message,
        },
      }),
    ]);

    // Audit failure
    try {
      await prisma.auditEvent.create({
        data: {
          organizationId: tenant.organizationId,
          userId: tenant.userId,
          action: "EXTRACTION_FAILED",
          entityType: "Document",
          entityId: documentId,
          metadata: { errorMessage: message },
        },
      });
    } catch (auditErr) {
      console.warn("Audit-Log fehlgeschlagen:", auditErr);
    }

    throw new ExtractionServiceError(`KI-Extraktion fehlgeschlagen: ${message}`, err);
  }
}

/**
 * Persists user corrections to extracted fields before final approval.
 */
export async function saveCorrections(
  tenant: TenantContext,
  documentId: string,
  updatedFields: unknown,
  reviewNotes?: string
): Promise<ExtractedLegalFields> {
  const prisma = getPrismaClient();
  if (!prisma) throw new Error("Datenbankverbindung nicht verfügbar.");

  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: { extractionResult: true },
  });

  if (!doc) throw new ExtractionServiceError(`Dokument '${documentId}' nicht gefunden.`);
  assertTenantOwnership(tenant, doc.organizationId);

  // Validate that user-submitted data conforms to the schema
  const parsed = ExtractedLegalFieldsSchema.safeParse(updatedFields);
  if (!parsed.success) {
    const errorDetails = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new ExtractionServiceError(`Ungültige Korrekturdaten: ${errorDetails}`);
  }

  // Dynamically update missingFields list if user filled them in, while preserving existing entries
  const missingFields: string[] = [...(parsed.data.missingFields ?? [])];
  if (!parsed.data.propertyDetails?.parcelNumber && !missingFields.some((m) => m.toLowerCase().includes("flurstück"))) {
    missingFields.push("Flurstücksnummer nicht abschließend bezeichnet");
  }
  if (!parsed.data.propertyDetails?.sheetNumber && !missingFields.some((m) => m.toLowerCase().includes("grundbuchblatt"))) {
    missingFields.push("Grundbuchblatt-Nummer fehlt (Abt. I)");
  }
  if (!parsed.data.financials?.purchasePrice && !missingFields.some((m) => m.toLowerCase().includes("kaufpreis"))) {
    missingFields.push("Kaufpreis nicht beziffert");
  }

  const cleanedData: ExtractedLegalFields = {
    ...parsed.data,
    missingFields,
  };

  await prisma.extractionResult.update({
    where: { documentId },
    data: {
      extractedData: cleanedData as unknown as object,
      missingFields: cleanedData.missingFields,
      reviewNotes: reviewNotes || doc.extractionResult?.reviewNotes || null,
      reviewedById: tenant.userId,
    },
  });

  try {
    await prisma.auditEvent.create({
      data: {
        organizationId: tenant.organizationId,
        userId: tenant.userId,
        action: "EXTRACTION_CORRECTED",
        entityType: "Document",
        entityId: documentId,
        metadata: {
          remainingMissingFields: cleanedData.missingFields.length,
          hasReviewNotes: Boolean(reviewNotes),
        },
      },
    });
  } catch (auditErr) {
    console.warn("Audit-Log fehlgeschlagen:", auditErr);
  }

  return cleanedData;
}

/**
 * Explicit Human-in-the-Loop approval of extracted/corrected fields.
 * Transitions workflow state from NEEDS_REVIEW to APPROVED.
 * The approved data is strictly frozen into `approvedData` column.
 */
export async function approveExtraction(
  tenant: TenantContext,
  documentId: string,
  reviewNotes?: string,
  reviewedData?: ExtractedLegalFields
): Promise<ExtractedLegalFields> {
  const prisma = getPrismaClient();
  if (!prisma) throw new Error("Datenbankverbindung nicht verfügbar.");

  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: { extractionResult: true },
  });

  if (!doc) throw new ExtractionServiceError(`Dokument '${documentId}' nicht gefunden.`);
  assertTenantOwnership(tenant, doc.organizationId);

  // Validate state transition
  assertValidTransition(doc.workflowStatus, "APPROVED");

  const currentData = reviewedData ?? doc.extractionResult?.extractedData;
  if (!currentData) {
    throw new ExtractionServiceError(
      "Es liegen keine extrahierten Daten zur Freigabe vor. Bitte führen Sie zuerst die Extraktion durch."
    );
  }

  const validatedData = ExtractedLegalFieldsSchema.parse(currentData);

  const now = new Date();

  await prisma.$transaction([
    prisma.document.update({
      where: { id: documentId },
      data: { workflowStatus: "APPROVED" },
    }),
    prisma.extractionResult.update({
      where: { documentId },
      data: {
        workflowStatus: "APPROVED",
        extractedData: validatedData as unknown as object,
        approvedData: validatedData as unknown as object,
        reviewedById: tenant.userId,
        reviewedAt: now,
        reviewNotes: reviewNotes ?? doc.extractionResult?.reviewNotes ?? "Vom Notariatsmitarbeiter geprüft und freigegeben.",
      },
    }),
  ]);

  try {
    await prisma.auditEvent.create({
      data: {
        organizationId: tenant.organizationId,
        userId: tenant.userId,
        action: "EXTRACTION_APPROVED",
        entityType: "Document",
        entityId: documentId,
        metadata: {
          partiesCount: validatedData.parties.length,
          purchasePrice: validatedData.financials?.purchasePrice ?? null,
          approvedAt: now.toISOString(),
        },
      },
    });
  } catch (auditErr) {
    console.warn("Audit-Log fehlgeschlagen:", auditErr);
  }

  return validatedData;
}

/**
 * Unlocks an approved or drafted document back to NEEDS_REVIEW so clerks
 * can modify party data, tax IDs, cadastral values or notes.
 * Valid transitions: APPROVED -> NEEDS_REVIEW, DRAFT_READY -> NEEDS_REVIEW.
 */
export async function revertToReview(
  tenant: TenantContext,
  documentId: string
): Promise<{ success: boolean; workflowStatus: string }> {
  const prisma = getPrismaClient();
  if (!prisma) throw new Error("Datenbankverbindung nicht verfügbar.");

  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: { extractionResult: true },
  });

  if (!doc) throw new ExtractionServiceError(`Dokument '${documentId}' nicht gefunden.`);
  assertTenantOwnership(tenant, doc.organizationId);

  // Validate state transition (APPROVED -> NEEDS_REVIEW or DRAFT_READY -> NEEDS_REVIEW)
  assertValidTransition(doc.workflowStatus, "NEEDS_REVIEW");

  await prisma.$transaction([
    prisma.document.update({
      where: { id: documentId },
      data: { workflowStatus: "NEEDS_REVIEW" },
    }),
    prisma.extractionResult.update({
      where: { documentId },
      data: { workflowStatus: "NEEDS_REVIEW" },
    }),
  ]);

  try {
    await prisma.auditEvent.create({
      data: {
        organizationId: tenant.organizationId,
        userId: tenant.userId,
        action: "EXTRACTION_REVERTED_TO_REVIEW",
        entityType: "Document",
        entityId: documentId,
        metadata: {
          previousStatus: doc.workflowStatus,
          revertedAt: new Date().toISOString(),
        },
      },
    });
  } catch (auditErr) {
    console.warn("Audit-Log fehlgeschlagen:", auditErr);
  }

  return { success: true, workflowStatus: "NEEDS_REVIEW" };
}
