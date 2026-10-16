
import { describe, it, expect } from "vitest";
import { DEMO_NOTARIAT_CONTEXT, TenantContext } from "@/lib/auth/tenant";
import { createCase, deleteCase, updateCase, CaseItem } from "@/lib/services/case-service";
import { validateCaseForXnpExport } from "./validator";
import {
  generateXnpExportPackage,
  getCaseExports,
  getExportById,
  deleteCaseExport,
  XnpValidationError,
} from "./export-service";
import { createDeterministicZip } from "./zip-writer";
import { getExportPackage } from "@/lib/storage";

describe("KanzleiFlow — BNotK XNP / XNotar Integration", () => {
  const foreignTenant: TenantContext = {
    organizationId: "org-foreign-notariat-999",
    organizationSlug: "notariat-dr-fremd",
    organizationName: "Notariat Dr. Fremd",
    jurisdiction: "DE-NW",
    userId: "usr-foreign-999",
    userName: "Dr. Fremd (Notar)",
    userRole: "NOTARY",
    userEmail: "fremd@notariat-koeln.de",
  };

  it("validates required fields and reports missing properties accurately", () => {
    // 1. Incomplete case data (missing Gemarkung, Grundbuchblatt, Kaufpreis)
    const incompleteCase = {
      id: "case-inc-1",
      caseNumber: "2026-UR-INC",
      title: "Unvollständige Testurkunde",
      matterType: "REAL_ESTATE",
      status: "DRAFT",
      notaryName: "Dr. Johannes Weiss",
      parties: [
        { role: "Verkäufer", name: "Alois Huber", address: "" },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const gbReport = validateCaseForXnpExport(incompleteCase as unknown as CaseItem, "XNOTAR_GRUNDBUCH_XML");
    expect(gbReport.isValid).toBe(false);
    expect(gbReport.missingRequiredFields).toContain("Gemarkung (landRegistryDistrict)");
    expect(gbReport.missingRequiredFields).toContain("Grundbuchblatt (sheetNumber)");

    const enovaReport = validateCaseForXnpExport(incompleteCase as unknown as CaseItem, "ENOVA_XML");
    expect(enovaReport.isValid).toBe(false);
    expect(enovaReport.missingRequiredFields).toContain("Kaufpreis (dealValue)");

    // 2. Complete and valid case data
    const completeCase = {
      id: "case-comp-1",
      caseNumber: "2026-UR-0142",
      title: "Kaufvertrag Grundstück Flur 14",
      matterType: "REAL_ESTATE",
      status: "READY_FOR_NOTARIZATION",
      notaryName: "Dr. Johannes Weiss",
      parties: [
        { role: "Verkäuferin", name: "Dr. Barbara Lindner", address: "Königinstr. 12, München" },
        { role: "Käufer", name: "Stefan Lindner", address: "Leopoldstr. 45, München" },
      ],
      propertyDetails: {
        landRegistryDistrict: "Schwabing",
        sheetNumber: "4521",
        parcelNumber: "14/2",
        areaSqm: 850,
      },
      financials: {
        dealValue: 1850000,
        currency: "EUR",
        paymentDueDate: "2026-11-15",
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const completeGbReport = validateCaseForXnpExport(completeCase as unknown as CaseItem, "XNOTAR_GRUNDBUCH_XML");
    expect(completeGbReport.isValid).toBe(true);
    expect(completeGbReport.issues.filter((i) => i.severity === "ERROR").length).toBe(0);
    expect(completeGbReport.isAuthoritative).toBe(true);
  });

  it("produces deterministic ZIP archives with standard PKZIP structure", () => {
    const entry1 = { path: "test.txt", data: Buffer.from("Deterministic Content 1", "utf-8") };
    const entry2 = { path: "attachments/doc.pdf", data: Buffer.from("PDF Fake Bytes 2", "utf-8") };

    const zip1 = createDeterministicZip([entry1, entry2]);
    const zip2 = createDeterministicZip([entry1, entry2]);

    expect(zip1.length).toBeGreaterThan(0);
    expect(zip1.equals(zip2)).toBe(true); // Exact byte-for-byte equality

    // Verify PKZIP Magic Bytes (PK\x03\x04)
    expect(zip1[0]).toBe(0x50);
    expect(zip1[1]).toBe(0x4b);
    expect(zip1[2]).toBe(0x03);
    expect(zip1[3]).toBe(0x04);
  });

  it("generates an end-to-end XNotar Grundbuch package and preserves immutable snapshot", async () => {
    const uniqueCaseNumber = `2026-UR-XNP-${Date.now()}`;
    const testCase = await createCase(DEMO_NOTARIAT_CONTEXT, {
      caseNumber: uniqueCaseNumber,
      title: "XNotar Vollzug Kaufvertrag Bogenhausen",
      matterType: "REAL_ESTATE",
      status: "READY_FOR_NOTARIZATION",
      notaryName: "Dr. Johannes Weiss",
      assignedClerk: "Stefanie Bauer",
      parties: [
        {
          role: "Verkäufer",
          name: "Hans Meier",
          address: "Prinzregentenstr. 1, 81675 München",
          taxId: "11 222 333 444",
        },
        {
          role: "Käufer",
          name: "Anna Schmidt",
          address: "Maximilianstr. 20, 80539 München",
          taxId: "55 666 777 888",
        },
      ],
      propertyDetails: {
        landRegistryDistrict: "Bogenhausen",
        sheetNumber: "9988",
        parcelNumber: "12/4",
        areaSqm: 620,
        economicUse: "Wohnbaufläche",
      },
      financials: {
        dealValue: 1250000,
        currency: "EUR",
        paymentDueDate: "2026-12-01",
      },
    });

    try {
      // 1. Generate XNotar package
      const exportRecord = await generateXnpExportPackage(DEMO_NOTARIAT_CONTEXT, {
        caseId: testCase.id,
        exportType: "XNOTAR_GRUNDBUCH_XML",
        includeAttachments: false,
      });

      expect(exportRecord.id).toBeDefined();
      expect(exportRecord.exportType).toBe("XNOTAR_GRUNDBUCH_XML");
      expect(exportRecord.fileSize).toBeGreaterThan(0);
      expect(exportRecord.storagePath).toBeDefined();
      expect(exportRecord.isAuthoritative).toBe(true);

      // Verify physical package exists on disk
      const zipBuffer = await getExportPackage(exportRecord.storagePath);
      expect(zipBuffer).not.toBeNull();
      expect(zipBuffer?.length).toBe(exportRecord.fileSize);

      // Verify immutable snapshot captured Hans Meier and 1.250.000 EUR
      const snapshot = exportRecord.sourceSnapshot;
      const propDetails = snapshot.propertyDetails as Record<string, unknown>;
      const finDetails = snapshot.financials as Record<string, unknown>;
      expect(propDetails.landRegistryDistrict).toBe("Bogenhausen");
      expect(finDetails.dealValue).toBe(1250000);

      // 2. Modify the live case in the database
      await updateCase(DEMO_NOTARIAT_CONTEXT, testCase.id, {
        title: "GEÄNDERTER TITEL NACH EXPORT",
        financials: {
          dealValue: 9999999, // Altered
          currency: "EUR",
        },
      });

      // 3. Verify the previous export snapshot remains strictly immutable
      const retrieved = await getExportById(DEMO_NOTARIAT_CONTEXT, exportRecord.id);
      expect(retrieved).not.toBeNull();
      const retrievedFin = retrieved?.sourceSnapshot.financials as Record<string, unknown>;
      expect(retrievedFin.dealValue).toBe(1250000);
      expect(retrieved?.sourceSnapshot.title).toBe("XNotar Vollzug Kaufvertrag Bogenhausen");

      // 4. Clean up export
      await deleteCaseExport(DEMO_NOTARIAT_CONTEXT, exportRecord.id);
    } finally {
      await deleteCase(DEMO_NOTARIAT_CONTEXT, testCase.id);
    }
  });

  it("strictly enforces tenant isolation: Tenant B cannot list, retrieve or download Tenant A's export", async () => {
    const uniqueCaseNumber = `2026-UR-ISOL-XNP-${Date.now()}`;
    const tenantACase = await createCase(DEMO_NOTARIAT_CONTEXT, {
      caseNumber: uniqueCaseNumber,
      title: "Streng Vertrauliche Akte Notariat Weiss",
      matterType: "REAL_ESTATE",
      status: "READY_FOR_NOTARIZATION",
      notaryName: "Dr. Johannes Weiss",
      parties: [
        { role: "Verkäufer", name: "Vertraulicher Verkäufer", address: "München" },
        { role: "Käufer", name: "Vertraulicher Käufer", address: "München" },
      ],
      propertyDetails: {
        landRegistryDistrict: "Altstadt",
        sheetNumber: "123",
      },
      financials: {
        dealValue: 5000000,
        currency: "EUR",
      },
    });

    try {
      const exportRecord = await generateXnpExportPackage(DEMO_NOTARIAT_CONTEXT, {
        caseId: tenantACase.id,
        exportType: "UVZ_XML",
        includeAttachments: false,
      });

      // 1. Tenant B tries to list Tenant A's exports
      const foreignList = await getCaseExports(foreignTenant, tenantACase.id);
      expect(foreignList.length).toBe(0);

      // 2. Tenant B tries to retrieve Tenant A's export by ID
      const foreignExport = await getExportById(foreignTenant, exportRecord.id);
      expect(foreignExport).toBeNull();

      // 3. Tenant B tries to delete Tenant A's export
      const deleteResult = await deleteCaseExport(foreignTenant, exportRecord.id);
      expect(deleteResult).toBe(false);

      // Verify export was not deleted
      const stillExists = await getExportById(DEMO_NOTARIAT_CONTEXT, exportRecord.id);
      expect(stillExists).not.toBeNull();

      // Clean up
      await deleteCaseExport(DEMO_NOTARIAT_CONTEXT, exportRecord.id);
    } finally {
      await deleteCase(DEMO_NOTARIAT_CONTEXT, tenantACase.id);
    }
  });

  it("rejects incomplete exports unless allowPartialDraft is explicitly enabled", async () => {
    const uniqueCaseNumber = `2026-UR-INCOMPL-${Date.now()}`;
    const incompleteCase = await createCase(DEMO_NOTARIAT_CONTEXT, {
      caseNumber: uniqueCaseNumber,
      title: "Entwurfsakte mit fehlenden Pflichtdaten",
      matterType: "REAL_ESTATE",
      status: "DRAFT",
      notaryName: "Dr. Johannes Weiss",
      parties: [], // No parties!
    });

    try {
      // Must reject without allowPartialDraft
      await expect(
        generateXnpExportPackage(DEMO_NOTARIAT_CONTEXT, {
          caseId: incompleteCase.id,
          exportType: "XNOTAR_GRUNDBUCH_XML",
          allowPartialDraft: false,
        })
      ).rejects.toThrow(XnpValidationError);

      // Must succeed when allowPartialDraft is true
      const draftPackage = await generateXnpExportPackage(DEMO_NOTARIAT_CONTEXT, {
        caseId: incompleteCase.id,
        exportType: "XNOTAR_GRUNDBUCH_XML",
        allowPartialDraft: true,
      });

      expect(draftPackage.id).toBeDefined();
      expect(draftPackage.isAuthoritative).toBe(false);

      await deleteCaseExport(DEMO_NOTARIAT_CONTEXT, draftPackage.id);
    } finally {
      await deleteCase(DEMO_NOTARIAT_CONTEXT, incompleteCase.id);
    }
  });
});
