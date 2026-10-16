import { getPrismaClient } from "@/lib/db";
import { TenantContext, assertTenantOwnership } from "@/lib/auth/tenant";
import { assertValidTransition } from "@/lib/workflow/state-machine";
import {
  renderAppointmentSummaryTemplate,
  TEMPLATE_VERSION,
} from "@/lib/templates/appointment-summary";
import { generateDocxDraft } from "@/lib/docx/generator";
import { saveDraftDocx, getDraftDocx } from "@/lib/storage";
import {
  ExtractedLegalFields,
  ExtractedLegalFieldsSchema,
} from "@/lib/ai/schema";

export class DraftGenerationError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "DraftGenerationError";
  }
}

export interface GeneratedDraftRecord {
  id: string;
  organizationId: string;
  caseId: string;
  documentId: string | null;
  templateVersion: string;
  title: string;
  content: string;
  approvedDataSnapshot: ExtractedLegalFields | null;
  version: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Generates a deterministic document draft strictly from approved extraction data.
 * Refuses generation if the document has not undergone human review and approval.
 */
export async function generateDraft(
  tenant: TenantContext,
  documentId: string
): Promise<GeneratedDraftRecord> {
  const prisma = getPrismaClient();
  if (!prisma) throw new Error("Datenbankverbindung nicht verfügbar.");

  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: {
      case: true,
      extractionResult: true,
    },
  });

  if (!doc) {
    throw new DraftGenerationError(`Dokument '${documentId}' nicht gefunden.`);
  }

  assertTenantOwnership(tenant, doc.organizationId);

  // Requirement: Draft generation from approved data only
  const allowedStatuses = ["APPROVED", "DRAFT_READY", "GENERATION_FAILED"];
  if (!allowedStatuses.includes(doc.workflowStatus)) {
    throw new DraftGenerationError(
      `Entwurfsgenerierung verweigert: Dokument befindet sich im Status '${doc.workflowStatus}'. Eine Generierung ist ausschließlich aus dem Status 'APPROVED' nach menschlicher Freigabe zulässig.`
    );
  }

  assertValidTransition(doc.workflowStatus, "GENERATING");
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.document.updateMany({
      where: { id: documentId, organizationId: tenant.organizationId, workflowStatus: doc.workflowStatus, updatedAt: doc.updatedAt },
      data: { workflowStatus: "GENERATING" },
    });
    if (claimed.count !== 1) throw new DraftGenerationError("Für dieses Dokument läuft bereits eine Bearbeitung. Bitte aktualisieren Sie die Ansicht.");
    await tx.extractionResult.update({
      where: { documentId, organizationId: tenant.organizationId },
      data: { workflowStatus: "GENERATING" },
    });
  });

  try {
    // Calculate next version number for this document/case
    const latestDraft = await prisma.generatedDraft.findFirst({
      where: {
        organizationId: tenant.organizationId,
        caseId: doc.caseId,
        documentId: doc.id,
      },
      orderBy: { version: "desc" },
    });
    const nextVersion = (latestDraft?.version ?? 0) + 1;

    const approvedRaw = doc.extractionResult?.approvedData;
    if (!approvedRaw) {
      throw new Error(
        "Keine freigegebenen Daten (approvedData) gefunden. Bitte geben Sie die Extraktionsdaten vor der Generierung explizit frei."
      );
    }

    const approvedData = ExtractedLegalFieldsSchema.parse(approvedRaw);

    // 1. Generate professional German DOCX binary buffer
    const docxBuffer = await generateDocxDraft(approvedData, {
      caseNumber: doc.case.caseNumber,
      caseTitle: doc.case.title,
      notaryName: doc.case.notaryName,
      assignedClerk: doc.case.assignedClerk,
      reviewNotes: doc.extractionResult?.reviewNotes,
      version: nextVersion,
    });

    // 2. Generate text version for instant monospace in-browser preview
    const renderedContent = renderAppointmentSummaryTemplate(approvedData, {
      caseNumber: doc.case.caseNumber,
      caseTitle: doc.case.title,
      notaryName: doc.case.notaryName,
      assignedClerk: doc.case.assignedClerk,
    });

    const draftTitle = `Vorbereitungsvermerk_${doc.case.caseNumber}_v${nextVersion}.docx`;

    // 3. Persist immutable draft record in PostgreSQL
    const createdDraft = await prisma.generatedDraft.create({
      data: {
        organizationId: tenant.organizationId,
        caseId: doc.caseId,
        documentId: doc.id,
        templateVersion: TEMPLATE_VERSION,
        title: draftTitle,
        content: renderedContent,
        approvedDataSnapshot: {
          ...approvedData,
          _generationContext: {
            caseNumber: doc.case.caseNumber, caseTitle: doc.case.title,
            notaryName: doc.case.notaryName, assignedClerk: doc.case.assignedClerk,
            reviewNotes: doc.extractionResult?.reviewNotes, version: nextVersion,
          },
        } as unknown as object,
        version: nextVersion,
        status: "DRAFT",
      },
    });

    // 4. Persist DOCX binary to organization-scoped storage
    await saveDraftDocx(
      tenant.organizationId,
      createdDraft.id,
      nextVersion,
      docxBuffer
    );

    // 5. Transition document to DRAFT_READY only after persistence succeeded
    assertValidTransition("GENERATING", "DRAFT_READY");

    await prisma.$transaction([
      prisma.document.update({
        where: { id: documentId },
        data: { workflowStatus: "DRAFT_READY" },
      }),
      prisma.extractionResult.update({
        where: { documentId },
        data: { workflowStatus: "DRAFT_READY" },
      }),
    ]);

    // 6. Audit log
    try {
      await prisma.auditEvent.create({
        data: {
          organizationId: tenant.organizationId,
          userId: tenant.userId,
          action: "DRAFT_GENERATED",
          entityType: "GeneratedDraft",
          entityId: createdDraft.id,
          metadata: {
            caseId: doc.caseId,
            documentId: doc.id,
            version: nextVersion,
            templateVersion: TEMPLATE_VERSION,
            docxBytes: docxBuffer.length,
            charactersCount: renderedContent.length,
          },
        },
      });
    } catch (auditErr) {
      console.warn("Audit-Log für Draft-Generierung fehlgeschlagen:", auditErr);
    }

    return {
      id: createdDraft.id,
      organizationId: createdDraft.organizationId,
      caseId: createdDraft.caseId,
      documentId: createdDraft.documentId,
      templateVersion: createdDraft.templateVersion,
      title: createdDraft.title,
      content: createdDraft.content,
      approvedDataSnapshot: createdDraft.approvedDataSnapshot as ExtractedLegalFields | null,
      version: createdDraft.version,
      status: createdDraft.status,
      createdAt: createdDraft.createdAt.toISOString(),
      updatedAt: createdDraft.updatedAt.toISOString(),
    };
  } catch (err: unknown) {
    const message = (err as Error).message || "Fehler bei der Entwurfserstellung.";

    await prisma.$transaction([
      prisma.document.update({
        where: { id: documentId },
        data: { workflowStatus: "GENERATION_FAILED" },
      }),
      prisma.extractionResult.update({
        where: { documentId },
        data: { workflowStatus: "GENERATION_FAILED" },
      }),
    ]);

    throw new DraftGenerationError(`Entwurfsgenerierung fehlgeschlagen: ${message}`, err);
  }
}

/**
 * Retrieve a generated DOCX buffer for downloading.
 * If the DOCX is not yet cached in storage, regenerates it deterministically from approvedDataSnapshot.
 */
export async function getDraftDocxBuffer(
  tenant: TenantContext,
  draftId: string
): Promise<{ buffer: Buffer; filename: string }> {
  const prisma = getPrismaClient();
  if (!prisma) throw new Error("Datenbankverbindung nicht verfügbar.");

  const draft = await prisma.generatedDraft.findUnique({
    where: { id: draftId },
    include: { case: true },
  });

  if (!draft) {
    throw new DraftGenerationError(`Entwurf '${draftId}' nicht gefunden.`);
  }

  assertTenantOwnership(tenant, draft.organizationId);

  // Check storage first
  const cached = await getDraftDocx(
    `${draft.organizationId}_draft_${draft.id}_v${draft.version}.docx`
  );
  if (cached) {
    const filename = draft.title.endsWith(".docx")
      ? draft.title
      : `${draft.title.replace(/\.[^/.]+$/, "")}.docx`;
    return { buffer: cached, filename };
  }

  // If not in storage, regenerate deterministically from immutable approvedDataSnapshot
  if (!draft.approvedDataSnapshot) {
    throw new DraftGenerationError(
      "Kein genehmigter Datenschnappschuss für diesen Entwurf vorhanden."
    );
  }

  const approvedData = ExtractedLegalFieldsSchema.parse(draft.approvedDataSnapshot);
  const snapshot = draft.approvedDataSnapshot as Record<string, unknown>;
  const context = snapshot._generationContext as import("@/lib/docx/generator").DocxTemplateContext | undefined;
  if (!context?.caseNumber || !context.caseTitle) {
    throw new DraftGenerationError("Die Originaldatei dieser historischen Version fehlt. Eine unveränderte Wiederherstellung ist ohne gespeicherte Erstellungsdaten nicht möglich.");
  }
  const buffer = await generateDocxDraft(approvedData, context);

  // Cache back to storage
  await saveDraftDocx(draft.organizationId, draft.id, draft.version, buffer);

  const filename = draft.title.endsWith(".docx")
    ? draft.title
    : `${draft.title.replace(/\.[^/.]+$/, "")}.docx`;

  return { buffer, filename };
}

/**
 * Retrieve a generated draft by ID with tenant check.
 */
export async function getDraftById(
  tenant: TenantContext,
  draftId: string
): Promise<GeneratedDraftRecord | null> {
  const prisma = getPrismaClient();
  if (!prisma) return null;

  const draft = await prisma.generatedDraft.findUnique({
    where: { id: draftId },
  });

  if (!draft) return null;
  assertTenantOwnership(tenant, draft.organizationId);

  return {
    id: draft.id,
    organizationId: draft.organizationId,
    caseId: draft.caseId,
    documentId: draft.documentId,
    templateVersion: draft.templateVersion,
    title: draft.title,
    content: draft.content,
    approvedDataSnapshot: draft.approvedDataSnapshot as ExtractedLegalFields | null,
    version: draft.version,
    status: draft.status,
    createdAt: draft.createdAt.toISOString(),
    updatedAt: draft.updatedAt.toISOString(),
  };
}

/**
 * Retrieve drafts for a case with tenant check.
 */
export async function getDraftsForCase(
  tenant: TenantContext,
  caseId: string
): Promise<GeneratedDraftRecord[]> {
  const prisma = getPrismaClient();
  if (!prisma) return [];

  const c = await prisma.case.findUnique({
    where: { id: caseId },
    select: { organizationId: true },
  });

  if (!c) return [];
  assertTenantOwnership(tenant, c.organizationId);

  const drafts = await prisma.generatedDraft.findMany({
    where: {
      caseId,
      organizationId: tenant.organizationId,
    },
    orderBy: { createdAt: "desc" },
  });

  return drafts.map((d) => ({
    id: d.id,
    organizationId: d.organizationId,
    caseId: d.caseId,
    documentId: d.documentId,
    templateVersion: d.templateVersion,
    title: d.title,
    content: d.content,
    approvedDataSnapshot: d.approvedDataSnapshot as ExtractedLegalFields | null,
    version: d.version,
    status: d.status,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  }));
}
