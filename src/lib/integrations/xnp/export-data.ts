import { getPrismaClient } from "@/lib/db";
import { TenantContext } from "@/lib/auth/tenant";
import { getCaseById, CaseItem } from "@/lib/services/case-service";
import { ExtractedLegalFieldsSchema } from "@/lib/ai/schema";
import type { DocumentConfigurationData } from "@/lib/configurator/types";

/** Resolve the latest reviewed contract data once for both validation and XML. */
export async function getCaseDataForXnpExport(tenant: TenantContext, caseId: string): Promise<CaseItem | null> {
  const caseData = await getCaseById(tenant, caseId);
  if (!caseData) return null;
  const prisma = getPrismaClient();
  if (!prisma) return caseData;
  const [approvals, generated] = await Promise.all([
    prisma.extractionResult.findMany({
      where: {
        organizationId: tenant.organizationId,
        document: { caseId, organizationId: tenant.organizationId, workflowStatus: { in: ["APPROVED", "DRAFT_READY", "GENERATING", "GENERATION_FAILED"] } },
        reviewedAt: { not: null },
      },
      orderBy: [{ reviewedAt: "desc" }, { id: "desc" }],
    }),
    prisma.generatedDocumentVersion.findFirst({
      where: { organizationId: tenant.organizationId, caseId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
  ]);
  const sources: { at: Date; data: CaseItem; generated: boolean }[] = [];
  // Never consume a saved-but-unreviewed configuration (it may contain sample defaults).
  if (generated) {
    const snapshot = generated.configurationSnapshot as unknown as { formData?: DocumentConfigurationData };
    const data = snapshot.formData;
    if (!data || !Array.isArray(data.parties) || !data.property || !data.purchasePrice) {
      throw new Error("Die gespeicherte Vertragsversion enthält keine lesbaren Exportdaten.");
    }
    sources.push({ at: generated.createdAt, generated: true, data: {
      ...caseData,
      parties: data.parties.map((party) => ({
        role: party.role, name: party.name,
        address: [party.address, [party.postalCode, party.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
        birthDate: party.birthDate ?? undefined, taxId: party.taxId ?? undefined,
      })),
      propertyDetails: {
        landRegistryDistrict: data.property.landRegistryDistrict, sheetNumber: data.property.sheetNumber,
        parcelNumber: data.property.parcelNumber, areaSqm: data.property.plotAreaSqm,
        economicUse: data.property.economicUse ?? undefined,
      },
      financials: {
        dealValue: data.purchasePrice.amount, currency: data.purchasePrice.currency,
        paymentDueDate: data.purchasePrice.paymentDueDate ?? undefined,
        existingEncumbrances: [...(data.property.existingEncumbrancesAbt2 ?? []), ...(data.property.existingEncumbrancesAbt3 ?? [])].join("; "),
      },
    } });
  }
  for (const approved of [...approvals].reverse()) {
    const parsed = ExtractedLegalFieldsSchema.safeParse(approved.approvedData);
    if (!parsed.success) throw new Error("Die freigegebenen Dokumentdaten sind unvollständig gespeichert. Bitte prüfen und erneut freigeben.");
    const data = parsed.data;
    sources.push({ at: approved.reviewedAt!, generated: false, data: {
      ...caseData,
      parties: data.parties.map((party) => ({
        role: party.role, name: party.name, address: party.address ?? undefined,
        birthDate: party.birthDate ?? undefined, taxId: party.taxId ?? undefined,
      })),
      propertyDetails: data.propertyDetails ? {
        landRegistryDistrict: data.propertyDetails.landRegistryDistrict ?? undefined,
        sheetNumber: data.propertyDetails.sheetNumber ?? undefined,
        parcelNumber: data.propertyDetails.parcelNumber ?? undefined, areaSqm: data.propertyDetails.areaSqm,
        economicUse: data.propertyDetails.economicUse == null ? undefined : String(data.propertyDetails.economicUse),
      } : null,
      financials: data.financials ? {
        dealValue: data.financials.purchasePrice, currency: data.financials.currency,
        paymentDueDate: data.financials.paymentDueDate ?? undefined,
        existingEncumbrances: data.financials.existingEncumbrances.join("; "),
      } : null,
    } });
  }
  // A later land-registry document without parties must not erase a reviewed contract.
  sources.sort((left, right) => left.at.getTime() - right.at.getTime() || Number(left.generated) - Number(right.generated));
  return sources.reduce((resolved, source) => ({
    ...resolved,
    parties: source.data.parties.length ? source.data.parties : resolved.parties,
    propertyDetails: { ...resolved.propertyDetails, ...presentFields(source.data.propertyDetails) },
    financials: resolved.financials || source.data.financials ? {
      currency: "EUR", ...resolved.financials, ...presentFields(source.data.financials),
    } : null,
  }), caseData);
}

function presentFields<T extends object>(data: T | null | undefined): Partial<T> {
  return Object.fromEntries(Object.entries(data ?? {}).filter(([, value]) =>
    value !== null && value !== undefined && (typeof value !== "string" || value.trim() !== "")
  )) as Partial<T>;
}
