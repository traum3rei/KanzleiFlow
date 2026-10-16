import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { DEMO_NOTARIAT_CONTEXT as tenant } from "@/lib/auth/tenant";
import { createCase, getCaseById } from "@/lib/services/case-service";
import { ingestDocument } from "@/lib/services/document-service";
import { triggerExtraction, saveCorrections, approveExtraction, revertToReview } from "@/lib/services/extraction-service";
import { createConfiguration, generateConfiguredDraft } from "@/lib/configurator/configurator-service";
import { getDefaultConfigurationData } from "@/lib/configurator/rules-engine";
import { getExportPackage } from "@/lib/storage";
import { getCaseDataForXnpExport } from "./export-data";
import { generateXnpExportPackage } from "./export-service";
import { validateCaseForXnpExport } from "./validator";

async function createTarget() {
  return createCase(tenant, { caseNumber: `XNP-SOURCE-${crypto.randomUUID()}`, title: "XNP Datenquellenregression", matterType: "REAL_ESTATE", status: "DRAFT", notaryName: "Testnotarin", parties: [] });
}
async function prepareDocument(caseId: string) {
  const doc = await ingestDocument(tenant, { caseId, fileName: "vertrag.txt", mimeType: "text/plain", buffer: Buffer.from("Synthetischer Kaufvertrag mit Verkäufer und Käufer über ein Grundstück.") });
  const result = await triggerExtraction(tenant, doc.id);
  const data = result.extractedData;
  data.parties = [
    { role: "Verkäuferin", name: "Freigegebene Verkäuferin", address: "Testweg 1, 12345 Teststadt", birthDate: null, taxId: null },
    { role: "Käufer", name: "Freigegebener Käufer", address: "Testweg 2, 12345 Teststadt", birthDate: null, taxId: null },
  ];
  data.propertyDetails = { landRegistryDistrict: "Testgemarkung", sheetNumber: "42", parcelNumber: "1/2", areaSqm: 500, economicUse: "Wohnen" };
  data.financials = { purchasePrice: 321000, currency: "EUR", paymentDueDate: null, existingEncumbrances: [] };
  await saveCorrections(tenant, doc.id, data);
  return doc;
}
describe("XNP reviewed contract data sources", () => {
  it("uses approved parties, property and price for validation AND the exported XML", async () => {
    const target = await createTarget();
    const doc = await prepareDocument(target.id);
    await approveExtraction(tenant, doc.id);
    const resolved = await getCaseDataForXnpExport(tenant, target.id);
    expect(resolved!.parties.map((party) => party.name)).toEqual(["Freigegebene Verkäuferin", "Freigegebener Käufer"]);
    expect(validateCaseForXnpExport(resolved!, "XNOTAR_GRUNDBUCH_XML").isValid).toBe(true);
    expect(validateCaseForXnpExport(resolved!, "ENOVA_XML").isValid).toBe(true);
    const exported = await generateXnpExportPackage(tenant, { caseId: target.id, exportType: "XNOTAR_GRUNDBUCH_XML", includeAttachments: false });
    const zip = await JSZip.loadAsync((await getExportPackage(exported.storagePath))!);
    const xml = await zip.file("xnotar-grundbuch-transfer.xml")!.async("text");
    expect(xml).toContain("Freigegebene Verkäuferin");
    expect(xml).toContain("Freigegebener Käufer");
    expect((await getCaseById(tenant, target.id))!.parties).toEqual([]);
    await expect(getCaseDataForXnpExport({ ...tenant, organizationId: "org_e2e_b" }, target.id)).rejects.toThrow();
  });
  it("does not use unapproved extraction or unreviewed sample configurations", async () => {
    const target = await createTarget();
    await prepareDocument(target.id);
    await createConfiguration(tenant, target.id);
    expect((await getCaseDataForXnpExport(tenant, target.id))!.parties).toEqual([]);
  });
  it("uses the immutable generated configuration instead of subsequent unsaved contract data", async () => {
    const target = await createTarget();
    const data = getDefaultConfigurationData(target.caseNumber);
    data.parties[0].name = "Konfigurierte Verkäuferin";
    const config = await createConfiguration(tenant, target.id, data);
    await generateConfiguredDraft(tenant, config.id);
    const resolved = await getCaseDataForXnpExport(tenant, target.id);
    expect(resolved!.parties[0].name).toBe("Konfigurierte Verkäuferin");
    expect(resolved!.parties[0].address).toContain(data.parties[0].postalCode);
    expect(resolved!.financials!.dealValue).toBe(data.purchasePrice.amount);
  });
  it("stops using approvals that have been reopened for review", async () => {
    const target = await createTarget();
    const doc = await prepareDocument(target.id);
    await approveExtraction(tenant, doc.id);
    await revertToReview(tenant, doc.id);
    expect((await getCaseDataForXnpExport(tenant, target.id))!.parties).toEqual([]);
  });
  it("does not erase reviewed partners when a later document contains no parties", async () => {
    const target = await createTarget();
    const contract = await prepareDocument(target.id);
    await approveExtraction(tenant, contract.id);
    const registry = await prepareDocument(target.id);
    // Read the current canonical data without changing the approved first document.
    const { getPrismaClient } = await import("@/lib/db");
    const result = await getPrismaClient()!.extractionResult.findFirst({ where: { documentId: registry.id, organizationId: tenant.organizationId } });
    const { ExtractedLegalFieldsSchema } = await import("@/lib/ai/schema");
    const data = ExtractedLegalFieldsSchema.parse(result!.extractedData);
    data.parties = [];
    data.propertyDetails = { landRegistryDistrict: "Aktualisierte Gemarkung", sheetNumber: "99", parcelNumber: null, areaSqm: null, economicUse: null };
    data.financials = { purchasePrice: null, currency: "EUR", paymentDueDate: null, existingEncumbrances: [] };
    await saveCorrections(tenant, registry.id, data);
    await approveExtraction(tenant, registry.id);
    const resolved = await getCaseDataForXnpExport(tenant, target.id);
    expect(resolved!.parties[0].name).toBe("Freigegebene Verkäuferin");
    expect(resolved!.propertyDetails!.sheetNumber).toBe("99");
    expect(resolved!.financials!.dealValue).toBe(321000);
  });

});
