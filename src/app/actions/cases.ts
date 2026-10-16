"use server";

import { revalidatePath } from "next/cache";
import { getTenantContext } from "@/lib/auth/tenant";
import { createCaseSchema, MatterType, CaseStatus } from "@/lib/validations/case";
import { createCase, deleteCase, updateCase } from "@/lib/services/case-service";

export interface CreateCaseActionState {
  success: boolean;
  caseId?: string;
  updatedAt?: string;
  errors?: Record<string, string>;
  message?: string;
}

export async function createCaseAction(
  _prevState: CreateCaseActionState,
  formData: FormData
): Promise<CreateCaseActionState> {
  return saveCaseForm(formData);
}

export async function updateCaseAction(
  caseId: string,
  _previous: CreateCaseActionState,
  formData: FormData
): Promise<CreateCaseActionState> {
  return saveCaseForm(formData, caseId);
}

async function saveCaseForm(formData: FormData, caseId?: string): Promise<CreateCaseActionState> {
  try {
    // 1. Resolve server-verified tenant context.
    // SECURITY: We NEVER accept an organization ID from formData.
    const tenant = await getTenantContext();
    if (tenant.userRole === "VIEWER") return { success: false, message: "Mit Lesezugriff können Sie keine Akten speichern." };

    // 2. Extract inputs from formData
    const caseNumber = formData.get("caseNumber")?.toString().trim() || "";
    const title = formData.get("title")?.toString().trim() || "";
    const matterType = formData.get("matterType")?.toString() as MatterType;
    const status = (formData.get("status")?.toString() as CaseStatus) || "DRAFT";
    const description = formData.get("description")?.toString().trim() || (caseId ? "" : undefined);
    const notaryName = formData.get("notaryName")?.toString().trim() || (caseId ? "" : undefined);
    const assignedClerk = formData.get("assignedClerk")?.toString().trim() || (caseId ? "" : undefined);
    const targetDate = formData.get("targetDate")?.toString().trim() || (caseId ? "" : undefined);

    // Parse parties if provided
    const partyRoles = formData.getAll("partyRole").map(String);
    const partyNames = formData.getAll("partyName").map(String);
    const partyAddresses = formData.getAll("partyAddress").map(String);
    const partyBirthDates = formData.getAll("partyBirthDate").map(String);
    const partyTaxIds = formData.getAll("partyTaxId").map(String);
    const partyEmails = formData.getAll("partyEmail").map(String);
    const partyPhones = formData.getAll("partyPhone").map(String);
    const partyNationalities = formData.getAll("partyNationality").map(String);
    const partyMaritalStatuses = formData.getAll("partyMaritalStatus").map(String);

    const parties = [];
    for (let i = 0; i < partyNames.length; i++) {
      if (caseId || partyNames[i]?.trim()) {
        parties.push({
          role: partyRoles[i]?.trim() || "Beteiligte/r",
          name: partyNames[i].trim(),
          address: partyAddresses[i]?.trim() || undefined,
          birthDate: partyBirthDates[i]?.trim() || undefined,
          taxId: partyTaxIds[i]?.trim() || undefined,
          email: partyEmails[i]?.trim() || undefined,
          phone: partyPhones[i]?.trim() || undefined,
          maritalStatus: partyMaritalStatuses[i]?.trim() || undefined,
          nationality: partyNationalities[i]?.trim() || undefined,
        });
      }
    }

    // Property details (Immobilienrecht / Grundbuch)
    const propertyLandRegistryDistrict = formData.get("propertyLandRegistryDistrict")?.toString().trim();
    const propertySheetNumber = formData.get("propertySheetNumber")?.toString().trim();
    const propertyParcelNumber = formData.get("propertyParcelNumber")?.toString().trim();
    const propertyAreaSqmStr = formData.get("propertyAreaSqm")?.toString().trim();
    const propertyAreaSqm = propertyAreaSqmStr ? parseFloat(propertyAreaSqmStr) : undefined;
    const propertyEconomicUse = formData.get("propertyEconomicUse")?.toString().trim();

    const hasPropertyDetails = Boolean(
      propertyLandRegistryDistrict ||
        propertySheetNumber ||
        propertyParcelNumber ||
        propertyAreaSqmStr ||
        propertyEconomicUse
    );

    const propertyDetails = hasPropertyDetails
      ? {
          landRegistryDistrict: propertyLandRegistryDistrict || undefined,
          sheetNumber: propertySheetNumber || undefined,
          parcelNumber: propertyParcelNumber || undefined,
          areaSqm: isNaN(Number(propertyAreaSqm)) ? undefined : propertyAreaSqm,
          economicUse: propertyEconomicUse || undefined,
        }
      : undefined;

    // Financial details (Kaufpreis / Gegenleistung)
    const financialDealValueStr = formData.get("financialDealValue")?.toString().trim();
    const financialDealValue = financialDealValueStr ? parseFloat(financialDealValueStr) : undefined;
    const financialCurrency = formData.get("financialCurrency")?.toString().trim() || "EUR";
    const financialPaymentDueDate = formData.get("financialPaymentDueDate")?.toString().trim();
    const financialExistingEncumbrances = formData.get("financialExistingEncumbrances")?.toString().trim();

    const hasFinancials = Boolean(
      financialDealValueStr || financialPaymentDueDate || financialExistingEncumbrances || financialCurrency !== "EUR"
    );

    const financials = hasFinancials
      ? {
          dealValue: isNaN(Number(financialDealValue)) ? undefined : financialDealValue,
          currency: financialCurrency,
          paymentDueDate: financialPaymentDueDate || undefined,
          existingEncumbrances: financialExistingEncumbrances || undefined,
        }
      : undefined;

    // Special details (Gesellschaftsrecht / Erbrecht)
    const specialCommercialRegister = formData.get("specialCommercialRegister")?.toString().trim();
    const specialRegisterCourt = formData.get("specialRegisterCourt")?.toString().trim();
    const specialShareCapitalStr = formData.get("specialShareCapital")?.toString().trim();
    const specialShareCapital = specialShareCapitalStr ? parseFloat(specialShareCapitalStr) : undefined;
    const specialDeceasedDate = formData.get("specialDeceasedDate")?.toString().trim();

    const hasSpecial = Boolean(
      specialCommercialRegister || specialRegisterCourt || specialShareCapitalStr || specialDeceasedDate
    );

    const specialDetails = hasSpecial
      ? {
          commercialRegister: specialCommercialRegister || undefined,
          registerCourt: specialRegisterCourt || undefined,
          shareCapital: isNaN(Number(specialShareCapital)) ? undefined : specialShareCapital,
          deceasedDate: specialDeceasedDate || undefined,
        }
      : undefined;

    // 3. Server-side validation via Zod
    const validationResult = createCaseSchema.safeParse({
      caseNumber,
      title,
      matterType,
      status,
      description,
      notaryName,
      assignedClerk,
      targetDate,
      parties,
      propertyDetails,
      financials,
      specialDetails,
    });

    if (!validationResult.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of validationResult.error.issues) {
        const fieldName = issue.path[0]?.toString() || "form";
        if (!fieldErrors[fieldName]) {
          fieldErrors[fieldName] = issue.message;
        }
      }

      return {
        success: false,
        errors: fieldErrors,
        message: "Bitte überprüfen Sie die Eingaben im Formular.",
      };
    }

    // 4. Persistence
    const expectedUpdatedAt = formData.get("expectedUpdatedAt")?.toString();
    if (caseId && (!expectedUpdatedAt || isNaN(Date.parse(expectedUpdatedAt)))) {
      return { success: false, message: "Der Bearbeitungsstand fehlt. Bitte öffnen Sie die Akte erneut." };
    }
    const input = validationResult.data;
    // Empty detail forms explicitly clear old values instead of restoring them.
    if (caseId) {
      input.propertyDetails ??= {};
      input.financials ??= { currency: "EUR" };
      input.specialDetails ??= {};
    }
    const createdCase = caseId
      ? await updateCase(tenant, caseId, input, expectedUpdatedAt)
      : await createCase(tenant, input);

    // 5. Revalidate cache
    try {
      revalidatePath("/");
      revalidatePath("/cases");
      revalidatePath(`/cases/${createdCase.id}`);
      revalidatePath(`/cases/${createdCase.id}/edit`);
    } catch {
      // Ignore when running outside Next.js request context (e.g. tests)
    }

    return {
      success: true,
      caseId: createdCase.id,
      updatedAt: createdCase.updatedAt,
      message: `Akte ${createdCase.caseNumber} erfolgreich ${caseId ? "gespeichert" : "angelegt"}.`,
    };
  } catch (error: unknown) {
    console.error("Error creating case:", error);
    return {
      success: false,
      message: error && typeof error === "object" && "code" in error && error.code === "P2002"
        ? "Dieses Aktenzeichen ist bereits vergeben. Bitte wählen Sie ein anderes."
        : error instanceof Error ? error.message : "Speichern fehlgeschlagen. Ihre Eingaben bleiben erhalten. Bitte erneut versuchen.",
    };
  }
}

export interface DeleteCaseActionState {
  success: boolean;
  message?: string;
  error?: string;
}

export async function deleteCaseAction(
  caseId: string
): Promise<DeleteCaseActionState> {
  try {
    const tenant = await getTenantContext();
    await deleteCase(tenant, caseId);

    try {
      revalidatePath("/");
      revalidatePath("/cases");
    } catch {
      // Ignore when running outside Next.js request context (e.g. tests)
    }

    return {
      success: true,
      message: "Akte und alle zugehörigen Daten wurden erfolgreich gelöscht.",
    };
  } catch (error: unknown) {
    console.error("Error deleting case:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Fehler beim Löschen der Akte.",
    };
  }
}
