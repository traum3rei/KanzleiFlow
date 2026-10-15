"use server";

import fs from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import { getTenantContext } from "@/lib/auth/tenant";
import {
  ingestDocument,
  deleteDocument,
  DocumentValidationError,
  DocumentNotFoundError,
} from "@/lib/services/document-service";
import {
  triggerExtraction,
  saveCorrections,
  approveExtraction,
  ExtractionServiceError,
} from "@/lib/services/extraction-service";
import { generateDraft, DraftGenerationError } from "@/lib/services/draft-service";

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Server action to upload and ingest a document.
 */
export async function uploadDocumentAction(formData: FormData): Promise<ActionResult> {
  try {
    const tenant = await getTenantContext();
    const caseId = formData.get("caseId") as string;
    const file = formData.get("file") as File | null;

    if (!caseId) {
      return { success: false, error: "Akten-ID fehlt." };
    }
    if (!file || !(file instanceof File) || file.size === 0) {
      return { success: false, error: "Bitte wählen Sie eine gültige Datei aus." };
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const doc = await ingestDocument(tenant, {
      caseId,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      buffer,
    });

    revalidatePath(`/cases/${caseId}`);
    return { success: true, data: doc };
  } catch (err: unknown) {
    if (err instanceof DocumentValidationError) {
      return { success: false, error: err.message };
    }
    return {
      success: false,
      error: (err as Error).message || "Dokument-Upload fehlgeschlagen.",
    };
  }
}

/**
 * Server action to load one of the prepared synthetic sample documents with one click.
 */
export async function loadSampleDocumentAction(
  caseId: string,
  sampleType: "complete" | "with_gaps" | "pdf"
): Promise<ActionResult> {
  try {
    const tenant = await getTenantContext();
    const isPdf = sampleType === "pdf";
    const fileName =
      sampleType === "pdf"
        ? "muster_kaufvertrag_schwabing.pdf"
        : sampleType === "complete"
        ? "muster_kaufvertrag_schwabing.txt"
        : "muster_kaufvertrag_mit_luecken.txt";

    const mimeType = isPdf ? "application/pdf" : "text/plain";
    const filePath = path.join(process.cwd(), "public", "sample-documents", fileName);
    const buffer = await fs.readFile(filePath);

    const doc = await ingestDocument(tenant, {
      caseId,
      fileName: `[Demo] ${fileName}`,
      mimeType,
      buffer,
    });

    revalidatePath(`/cases/${caseId}`);
    return { success: true, data: doc };
  } catch (err: unknown) {
    return {
      success: false,
      error: (err as Error).message || "Laden der Beispieldatei fehlgeschlagen.",
    };
  }
}

/**
 * Server action to trigger AI extraction.
 */
export async function triggerExtractionAction(
  documentId: string,
  caseId: string
): Promise<ActionResult> {
  try {
    const tenant = await getTenantContext();
    const result = await triggerExtraction(tenant, documentId);

    revalidatePath(`/cases/${caseId}`);
    return { success: true, data: result };
  } catch (err: unknown) {
    if (err instanceof ExtractionServiceError) {
      return { success: false, error: err.message };
    }
    return {
      success: false,
      error: (err as Error).message || "KI-Extraktion fehlgeschlagen.",
    };
  }
}

/**
 * Server action to save human corrections before approval.
 */
export async function saveCorrectionsAction(
  documentId: string,
  caseId: string,
  correctedFields: unknown,
  reviewNotes?: string
): Promise<ActionResult> {
  try {
    const tenant = await getTenantContext();
    const result = await saveCorrections(
      tenant,
      documentId,
      correctedFields,
      reviewNotes
    );

    revalidatePath(`/cases/${caseId}`);
    return { success: true, data: result };
  } catch (err: unknown) {
    return {
      success: false,
      error: (err as Error).message || "Speichern der Korrekturen fehlgeschlagen.",
    };
  }
}

/**
 * Server action to explicitly approve the extracted & corrected fields.
 */
export async function approveExtractionAction(
  documentId: string,
  caseId: string,
  reviewNotes?: string
): Promise<ActionResult> {
  try {
    const tenant = await getTenantContext();
    const result = await approveExtraction(tenant, documentId, reviewNotes);

    revalidatePath(`/cases/${caseId}`);
    return { success: true, data: result };
  } catch (err: unknown) {
    return {
      success: false,
      error: (err as Error).message || "Freigabe fehlgeschlagen.",
    };
  }
}

/**
 * Server action to generate a deterministic draft from approved data.
 */
export async function generateDraftAction(
  documentId: string,
  caseId: string
): Promise<ActionResult> {
  try {
    const tenant = await getTenantContext();
    const draft = await generateDraft(tenant, documentId);

    revalidatePath(`/cases/${caseId}`);
    return { success: true, data: draft };
  } catch (err: unknown) {
    if (err instanceof DraftGenerationError) {
      return { success: false, error: err.message };
    }
    return {
      success: false,
      error: (err as Error).message || "Entwurfsgenerierung fehlgeschlagen.",
    };
  }
}

/**
 * Server action to delete an uploaded document and its stored file.
 */
export async function deleteDocumentAction(
  documentId: string,
  caseId: string
): Promise<ActionResult> {
  try {
    const tenant = await getTenantContext();
    if (!documentId) {
      return { success: false, error: "Dokument-ID fehlt." };
    }

    await deleteDocument(tenant, documentId);

    revalidatePath(`/cases/${caseId}`);
    return { success: true };
  } catch (err: unknown) {
    if (err instanceof DocumentNotFoundError) {
      return { success: false, error: "Dokument existiert nicht mehr." };
    }
    return {
      success: false,
      error: (err as Error).message || "Löschen des Dokuments fehlgeschlagen.",
    };
  }
}

