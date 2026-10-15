import { getPrismaClient } from "@/lib/db";
import { TenantContext, assertTenantOwnership } from "@/lib/auth/tenant";
import { saveFile, deleteFile } from "@/lib/storage";
import { DocumentWorkflowStatus } from "@/generated/prisma/enums";
import { extractPdfText, PdfParseError } from "@/lib/pdf/extractor";

export class DocumentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentValidationError";
  }
}

export class DocumentNotFoundError extends Error {
  constructor(documentId: string) {
    super(`Dokument mit ID '${documentId}' wurde nicht gefunden.`);
    this.name = "DocumentNotFoundError";
  }
}

export interface IngestDocumentInput {
  caseId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}

export interface DocumentWithExtraction {
  id: string;
  organizationId: string;
  caseId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  workflowStatus: DocumentWorkflowStatus;
  createdAt: string;
  updatedAt: string;
  extractionResult?: {
    id: string;
    workflowStatus: DocumentWorkflowStatus;
    rawText: string | null;
    extractedData: unknown;
    approvedData: unknown;
    missingFields: string[];
    discrepancies: string[];
    reviewNotes: string | null;
    confidence: number | null;
    modelUsed: string | null;
    errorMessage: string | null;
    reviewedAt: string | null;
  } | null;
  draftsCount?: number;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MIN_TEXT_LENGTH = 15;
const MAX_TEXT_LENGTH = 300_000;

/**
 * Validates and extracts text from an uploaded buffer.
 */
export async function extractRawTextFromBuffer(
  fileName: string,
  mimeType: string,
  buffer: Buffer
): Promise<string> {
  const isPdf =
    mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
  const isTxt =
    mimeType === "text/plain" ||
    fileName.toLowerCase().endsWith(".txt") ||
    fileName.toLowerCase().endsWith(".md");

  if (!isPdf && !isTxt) {
    throw new DocumentValidationError(
      `Nicht unterstützter Dateityp '${mimeType}'. Es werden ausschließlich PDF- und Textdateien (.pdf, .txt) unterstützt.`
    );
  }

  let text = "";

  if (isTxt) {
    text = buffer.toString("utf-8");
  } else if (isPdf) {
    try {
      text = await extractPdfText(buffer, fileName);
    } catch (pdfErr) {
      if (pdfErr instanceof PdfParseError) {
        throw new DocumentValidationError(pdfErr.message);
      }
      throw new DocumentValidationError(
        `PDF-Datei '${fileName}' konnte nicht gelesen werden: ${(pdfErr as Error).message}`
      );
    }
  }

  const trimmed = text.trim();
  if (trimmed.length < MIN_TEXT_LENGTH) {
    throw new DocumentValidationError(
      `Aus der Datei '${fileName}' konnte kein ausreichender Text extrahiert werden (nur ${trimmed.length} Zeichen gefunden). Bitte stellen Sie sicher, dass es sich um ein lesbares Textdokument handelt.`
    );
  }

  if (trimmed.length > MAX_TEXT_LENGTH) {
    throw new DocumentValidationError(
      `Der Dokumententext überschreitet das zulässige Limit von ${MAX_TEXT_LENGTH} Zeichen (gefunden: ${trimmed.length} Zeichen).`
    );
  }

  return trimmed;
}

/**
 * Ingests a synthetic or real document for a specific case:
 * 1. Checks file size and mime type
 * 2. Extracts raw text
 * 3. Persists file to secure storage
 * 4. Creates Document & ExtractionResult records in PostgreSQL
 * 5. Records audit event
 */
export async function ingestDocument(
  tenant: TenantContext,
  input: IngestDocumentInput
): Promise<DocumentWithExtraction> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error("Datenbankverbindung nicht verfügbar.");
  }

  // 1. Validate file size
  if (input.buffer.length > MAX_FILE_SIZE) {
    throw new DocumentValidationError(
      `Die Datei '${input.fileName}' ist zu groß (${(input.buffer.length / 1024 / 1024).toFixed(1)} MB). Maximale Dateigröße: 10 MB.`
    );
  }

  if (input.buffer.length === 0) {
    throw new DocumentValidationError(`Die hochgeladene Datei '${input.fileName}' ist leer.`);
  }

  // 2. Validate tenant ownership of target case
  const targetCase = await prisma.case.findUnique({
    where: { id: input.caseId },
  });

  if (!targetCase) {
    throw new Error(`Akte mit ID '${input.caseId}' nicht gefunden.`);
  }

  assertTenantOwnership(tenant, targetCase.organizationId);
 
  // 3. Save file to storage first using an independent buffer copy
  const storageBuffer = Buffer.from(input.buffer);
  const { storagePath } = await saveFile(
    tenant.organizationId,
    input.fileName,
    storageBuffer
  );

  // 4. Extract text using an independent buffer copy
  const rawText = await extractRawTextFromBuffer(
    input.fileName,
    input.mimeType,
    Buffer.from(input.buffer)
  );

  // 5. Database transaction: create Document & ExtractionResult
  const createdDoc = await prisma.document.create({
    data: {
      organizationId: tenant.organizationId,
      caseId: input.caseId,
      fileName: input.fileName,
      fileSize: input.buffer.length,
      mimeType: input.mimeType || "application/octet-stream",
      storagePath,
      workflowStatus: "UPLOADED",
      uploadedById: tenant.userId,
      extractionResult: {
        create: {
          organizationId: tenant.organizationId,
          status: "PENDING",
          workflowStatus: "UPLOADED",
          rawText,
          missingFields: [],
          discrepancies: [],
        },
      },
    },
    include: {
      extractionResult: true,
    },
  });

  // 6. Audit event
  try {
    await prisma.auditEvent.create({
      data: {
        organizationId: tenant.organizationId,
        userId: tenant.userId,
        action: "DOCUMENT_UPLOADED",
        entityType: "Document",
        entityId: createdDoc.id,
        metadata: {
          fileName: createdDoc.fileName,
          fileSize: createdDoc.fileSize,
          caseId: input.caseId,
        },
      },
    });
  } catch (auditErr) {
    console.warn("Audit-Event für Document-Upload fehlgeschlagen:", auditErr);
  }

  return mapDocumentRecord(createdDoc);
}

/**
 * Retrieve a document by ID with strict tenant isolation.
 */
export async function getDocumentById(
  tenant: TenantContext,
  documentId: string
): Promise<DocumentWithExtraction> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error("Datenbankverbindung nicht verfügbar.");
  }

  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: {
      extractionResult: true,
      drafts: { select: { id: true } },
    },
  });

  if (!doc) {
    throw new DocumentNotFoundError(documentId);
  }

  assertTenantOwnership(tenant, doc.organizationId);

  return mapDocumentRecord(doc, doc.drafts?.length ?? 0);
}

/**
 * Retrieve all documents belonging to a specific case.
 */
export async function getDocumentsForCase(
  tenant: TenantContext,
  caseId: string
): Promise<DocumentWithExtraction[]> {
  const prisma = getPrismaClient();
  if (!prisma) return [];

  // Verify case access first
  const c = await prisma.case.findUnique({
    where: { id: caseId },
    select: { organizationId: true },
  });

  if (!c) return [];
  assertTenantOwnership(tenant, c.organizationId);

  const docs = await prisma.document.findMany({
    where: {
      caseId,
      organizationId: tenant.organizationId,
    },
    include: {
      extractionResult: true,
      drafts: { select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return docs.map((d) => mapDocumentRecord(d, d.drafts?.length ?? 0));
}

/**
 * Delete a document and its stored file with tenant check.
 */
export async function deleteDocument(
  tenant: TenantContext,
  documentId: string
): Promise<void> {
  const prisma = getPrismaClient();
  if (!prisma) throw new Error("Datenbankverbindung nicht verfügbar.");

  const doc = await prisma.document.findUnique({
    where: { id: documentId },
  });

  if (!doc) {
    throw new DocumentNotFoundError(documentId);
  }
  assertTenantOwnership(tenant, doc.organizationId);

  await deleteFile(doc.storagePath);
  await prisma.document.delete({
    where: { id: documentId },
  });

  try {
    await prisma.auditEvent.create({
      data: {
        organizationId: tenant.organizationId,
        userId: tenant.userId,
        action: "DOCUMENT_DELETED",
        entityType: "Document",
        entityId: documentId,
        metadata: { fileName: doc.fileName },
      },
    });
  } catch (err) {
    console.warn("Audit-Event für Document-Delete fehlgeschlagen:", err);
  }
}

function mapDocumentRecord(
  doc: {
    id: string;
    organizationId: string;
    caseId: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    workflowStatus: DocumentWorkflowStatus;
    createdAt: Date;
    updatedAt: Date;
    extractionResult?: {
      id: string;
      workflowStatus: DocumentWorkflowStatus;
      rawText: string | null;
      extractedData: unknown;
      approvedData: unknown;
      missingFields: unknown;
      discrepancies: unknown;
      reviewNotes: string | null;
      confidence: number | null;
      modelUsed: string | null;
      errorMessage: string | null;
      reviewedAt: Date | null;
    } | null;
  },
  draftsCount = 0
): DocumentWithExtraction {
  return {
    id: doc.id,
    organizationId: doc.organizationId,
    caseId: doc.caseId,
    fileName: doc.fileName,
    fileSize: doc.fileSize,
    mimeType: doc.mimeType,
    workflowStatus: doc.workflowStatus,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    draftsCount,
    extractionResult: doc.extractionResult
      ? {
          id: doc.extractionResult.id,
          workflowStatus: doc.extractionResult.workflowStatus,
          rawText: doc.extractionResult.rawText,
          extractedData: doc.extractionResult.extractedData,
          approvedData: doc.extractionResult.approvedData,
          missingFields: Array.isArray(doc.extractionResult.missingFields)
            ? (doc.extractionResult.missingFields as string[])
            : [],
          discrepancies: Array.isArray(doc.extractionResult.discrepancies)
            ? (doc.extractionResult.discrepancies as string[])
            : [],
          reviewNotes: doc.extractionResult.reviewNotes,
          confidence: doc.extractionResult.confidence,
          modelUsed: doc.extractionResult.modelUsed,
          errorMessage: doc.extractionResult.errorMessage,
          reviewedAt: doc.extractionResult.reviewedAt
            ? doc.extractionResult.reviewedAt.toISOString()
            : null,
        }
      : null,
  };
}
