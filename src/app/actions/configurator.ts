"use server";

import { revalidatePath } from "next/cache";
import { getTenantContext } from "@/lib/auth/tenant";
import {
  createConfiguration,
  prefillConfigurationFromApprovedCase,
  saveConfiguration,
  generateConfiguredDraft,
  getConfigurationById,
  ConfigurationValidationError,
} from "@/lib/configurator/configurator-service";
import { DocumentConfigurationData } from "@/lib/configurator/types";

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  issues?: string[];
}

/**
 * Server action to create a new configuration for a case.
 */
export async function createConfigurationAction(caseId: string): Promise<ActionResult> {
  try {
    const tenant = await getTenantContext();
    const config = await createConfiguration(tenant, caseId);
    revalidatePath(`/cases/${caseId}`);
    return { success: true, data: config };
  } catch (err: unknown) {
    return {
      success: false,
      error: (err as Error).message || "Fehler beim Anlegen der Konfiguration.",
    };
  }
}

/**
 * Server action to prefill a configuration from approved case extraction data.
 */
export async function prefillConfigurationAction(
  caseId: string,
  documentId?: string
): Promise<ActionResult> {
  try {
    const tenant = await getTenantContext();
    const config = await prefillConfigurationFromApprovedCase(tenant, caseId, documentId);
    revalidatePath(`/cases/${caseId}`);
    return { success: true, data: config };
  } catch (err: unknown) {
    return {
      success: false,
      error: (err as Error).message || "Fehler bei der Datenübernahme in den Konfigurator.",
    };
  }
}

/**
 * Server action to autosave configuration step data with optimistic locking.
 */
export async function saveConfigurationAction(
  configId: string,
  stepData: Partial<DocumentConfigurationData>,
  currentStep?: number,
  expectedVersion?: number
): Promise<ActionResult> {
  try {
    const tenant = await getTenantContext();
    const result = await saveConfiguration(tenant, configId, stepData, currentStep, expectedVersion);
    return { success: true, data: result };
  } catch (err: unknown) {
    return {
      success: false,
      error: (err as Error).message || "Speichern fehlgeschlagen.",
    };
  }
}

/**
 * Server action to generate deterministic draft and DOCX from configuration.
 */
export async function generateConfiguredDraftAction(configId: string): Promise<ActionResult> {
  try {
    const tenant = await getTenantContext();
    const result = await generateConfiguredDraft(tenant, configId);
    return {
      success: true,
      data: {
        versionId: result.generatedVersion.id,
        version: result.generatedVersion.version,
        title: result.generatedVersion.title,
        draftId: result.generatedDraft.id,
      },
    };
  } catch (err: unknown) {
    if (err instanceof ConfigurationValidationError) {
      return {
        success: false,
        error: err.message,
        issues: err.issues,
      };
    }
    return {
      success: false,
      error: (err as Error).message || "Entwurfsgenerierung fehlgeschlagen.",
    };
  }
}

/**
 * Server action to fetch configuration by ID.
 */
export async function getConfigurationAction(configId: string): Promise<ActionResult> {
  try {
    const tenant = await getTenantContext();
    const config = await getConfigurationById(tenant, configId);
    return { success: true, data: config };
  } catch (err: unknown) {
    return {
      success: false,
      error: (err as Error).message || "Konfiguration nicht gefunden.",
    };
  }
}
