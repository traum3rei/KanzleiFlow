import { describe, it, expect } from "vitest";
import {

  getCases,
  updateCase,
  getCaseById,
  createCase,
  deleteCase,
  CaseNotFoundError,
  getDashboardStats,
} from "./case-service";
import { DEMO_NOTARIAT_CONTEXT, TenantContext } from "@/lib/auth/tenant";
import { ingestDocument } from "./document-service";
import { getFile } from "@/lib/storage";
import { getPrismaClient } from "@/lib/db";

describe("Case Service", () => {
  it("retrieves cases scoped to tenant", async () => {
    const cases = await getCases(DEMO_NOTARIAT_CONTEXT);
    expect(cases.length).toBeGreaterThan(0);
    for (const c of cases) {
      expect(c.organizationId).toBe(DEMO_NOTARIAT_CONTEXT.organizationId);
    }
  });

  it("filters cases by status", async () => {
    const readyCases = await getCases(DEMO_NOTARIAT_CONTEXT, {
      status: "READY_FOR_NOTARIZATION",
    });
    for (const c of readyCases) {
      expect(c.status).toBe("READY_FOR_NOTARIZATION");
    }
  });

  it("creates a new case and persists it to tenant scope", async () => {
    const uniqueNumber = `2026-UR-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const newCase = await createCase(DEMO_NOTARIAT_CONTEXT, {
      caseNumber: uniqueNumber,
      title: "Testurkunde Flurstück 99",
      matterType: "REAL_ESTATE",
      status: "DRAFT",
      description: "Testbeschreibung für automatisierten Service-Test",
      parties: [{ role: "Käufer", name: "Test Käufer" }],
    });

    expect(newCase.id).toBeDefined();
    expect(newCase.caseNumber).toBe(uniqueNumber);
    expect(newCase.organizationId).toBe(DEMO_NOTARIAT_CONTEXT.organizationId);

    // Verify lookup by ID
    const retrieved = await getCaseById(DEMO_NOTARIAT_CONTEXT, newCase.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe(newCase.id);
  });

  it("persists and unpacks extended property, financial, and special metadata", async () => {
    const uniqueNumber = `2026-UR-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const newCase = await createCase(DEMO_NOTARIAT_CONTEXT, {
      caseNumber: uniqueNumber,
      title: "Umfassender Kaufvertrag Flur 8, Gemarkung Pasing",
      matterType: "REAL_ESTATE",
      status: "DRAFT",
      description: "Vollständiger Kaufvertrag mit Grundbuch und Fälligkeit",
      parties: [
        {
          role: "Verkäufer",
          name: "Hans Schmidt",
          address: "Gleichmannstr. 4, 81241 München",
          taxId: "11 223 344 556",
          birthDate: "1968-07-21",
        },
      ],
      propertyDetails: {
        landRegistryDistrict: "Pasing",
        sheetNumber: "8899",
        parcelNumber: "Flur 8, Flurstück 101/4",
        areaSqm: 620,
        economicUse: "Wohn- und Geschäftshaus",
      },
      financials: {
        dealValue: 950000,
        currency: "EUR",
        paymentDueDate: "2026-12-01",
        existingEncumbrances: "Lastenfreier Erwerb in Abt. II und III",
      },
      specialDetails: {
        commercialRegister: "HRB 998877",
      },
    });

    const retrieved = await getCaseById(DEMO_NOTARIAT_CONTEXT, newCase.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.propertyDetails?.landRegistryDistrict).toBe("Pasing");
    expect(retrieved?.propertyDetails?.sheetNumber).toBe("8899");
    expect(retrieved?.financials?.dealValue).toBe(950000);
    expect(retrieved?.financials?.existingEncumbrances).toContain("Lastenfreier Erwerb");
    expect(retrieved?.parties[0].taxId).toBe("11 223 344 556");
  });

  it("blocks cross-tenant access when looking up a foreign case", async () => {
    const foreignTenant: TenantContext = {
      organizationId: "org_foreign_other_notary",
      organizationSlug: "other-notary",
      organizationName: "Anderes Notariat",
      jurisdiction: "DE-NW",
      userId: "usr_foreign",
      userEmail: "other@notariat.de",
      userName: "Dr. Anderer Notar",
      userRole: "NOTARY",
    };

    // Looking up our case with foreign tenant credentials must reject access
    await expect(
      getCaseById(foreignTenant, "case_demo_01")
    ).rejects.toThrow(/Tenant Isolation Violation/);
  });

  it("calculates dashboard stats accurately", async () => {
    const stats = await getDashboardStats(DEMO_NOTARIAT_CONTEXT);
    expect(stats.totalCases).toBeGreaterThan(0);
    expect(stats.recentCases.length).toBeLessThanOrEqual(5);
  });

  it("deletes a case along with its documents and storage files, recording an audit event", async () => {
    const prisma = getPrismaClient();
    const uniqueNumber = `2026-UR-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    // 1. Create a case
    const testCase = await createCase(DEMO_NOTARIAT_CONTEXT, {
      caseNumber: uniqueNumber,
      title: "Zu löschender Testfall",
      matterType: "REAL_ESTATE",
      status: "DRAFT",
      parties: [{ role: "Käufer", name: "Lösch-Kandidat" }],
    });

    expect(testCase.id).toBeDefined();

    // 2. Ingest a document for this case
    const doc = await ingestDocument(DEMO_NOTARIAT_CONTEXT, {
      caseId: testCase.id,
      fileName: "akte_loeschung_test.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Dateiinhalt der mit der Akte gelöscht werden muss.", "utf-8"),
    });

    expect(doc.id).toBeDefined();

    // Look up db record to get physical storagePath
    let storagePath: string | undefined;
    if (prisma) {
      const dbDoc = await prisma.document.findUnique({
        where: { id: doc.id },
      });
      storagePath = dbDoc?.storagePath;
    }

    if (storagePath) {
      // Verify file exists on disk
      const fileBuffer = await getFile(storagePath);
      expect(fileBuffer.length).toBeGreaterThan(0);
    }

    // 3. Delete the case
    await deleteCase(DEMO_NOTARIAT_CONTEXT, testCase.id);

    // 4. Verify case no longer exists
    const retrievedCase = await getCaseById(DEMO_NOTARIAT_CONTEXT, testCase.id);
    expect(retrievedCase).toBeNull();

    // 5. Verify document was cascaded in DB
    if (prisma) {
      const docInDb = await prisma.document.findUnique({
        where: { id: doc.id },
      });
      expect(docInDb).toBeNull();

      // Verify audit log exists
      const auditLog = await prisma.auditEvent.findFirst({
        where: {
          organizationId: DEMO_NOTARIAT_CONTEXT.organizationId,
          action: "CASE_DELETED",
          entityId: testCase.id,
        },
      });
      expect(auditLog).not.toBeNull();
      expect(auditLog?.metadata).toMatchObject({
        caseNumber: uniqueNumber,
      });
    }

    // 6. Verify physical document file was removed from storage
    if (storagePath) {
      await expect(getFile(storagePath)).rejects.toThrow();
    }
  });

  it("rejects unauthorized cross-tenant deletion with TenantIsolationError", async () => {
    const foreignTenant: TenantContext = {
      organizationId: "org_foreign_attacker",
      organizationSlug: "foreign-attacker",
      organizationName: "Fremdes Notariat",
      jurisdiction: "DE-NW",
      userId: "usr_attacker",
      userEmail: "attacker@notariat.de",
      userName: "Dr. Fremd",
      userRole: "NOTARY",
    };

    const uniqueNumber = `2026-UR-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const testCase = await createCase(DEMO_NOTARIAT_CONTEXT, {
      caseNumber: uniqueNumber,
      title: "Geschützter Mandantenfall",
      matterType: "REAL_ESTATE",
      status: "DRAFT",
      parties: [],
    });

    // Foreign tenant tries to delete our case
    await expect(
      deleteCase(foreignTenant, testCase.id)
    ).rejects.toThrow(/Tenant Isolation Violation/);

    // Verify case was NOT deleted
    const stillExists = await getCaseById(DEMO_NOTARIAT_CONTEXT, testCase.id);
    expect(stillExists).not.toBeNull();

    // Clean up
    await deleteCase(DEMO_NOTARIAT_CONTEXT, testCase.id);
  });

  it("throws CaseNotFoundError when attempting to delete a non-existent case", async () => {
    await expect(
      deleteCase(DEMO_NOTARIAT_CONTEXT, "non-existent-case-uuid-999")
    ).rejects.toThrow(CaseNotFoundError);
  });

  it("filters cases by matterType (Rechtsgebiet) and counts accurately", async () => {
    const { countCases } = await import("./case-service");
    const realEstateCases = await getCases(DEMO_NOTARIAT_CONTEXT, {
      matterType: "REAL_ESTATE",
    });
    for (const c of realEstateCases) {
      expect(c.matterType).toBe("REAL_ESTATE");
    }

    const totalRealEstate = await countCases(DEMO_NOTARIAT_CONTEXT, {
      matterType: "REAL_ESTATE",
    });
    expect(totalRealEstate).toBeGreaterThanOrEqual(realEstateCases.length);
  });

  it("filters cases by responsibility (Zuständigkeit) and supports pagination offset", async () => {
    const { countCases, getAvailableAssignees } = await import("./case-service");
    const assignees = await getAvailableAssignees(DEMO_NOTARIAT_CONTEXT);
    expect(assignees.length).toBeGreaterThan(0);

    // Test with the first assignee
    const testAssignee = assignees[0];
    const filteredCases = await getCases(DEMO_NOTARIAT_CONTEXT, {
      responsibility: testAssignee,
    });
    const countWithAssignee = await countCases(DEMO_NOTARIAT_CONTEXT, {
      responsibility: testAssignee,
    });
    expect(countWithAssignee).toBeGreaterThanOrEqual(filteredCases.length);

    for (const c of filteredCases) {
      const match =
        (c.assignedClerk && c.assignedClerk.toLowerCase().includes(testAssignee.toLowerCase())) ||
        (c.notaryName && c.notaryName.toLowerCase().includes(testAssignee.toLowerCase()));
      expect(match).toBe(true);
    }

    // Test pagination skip and take
    const page1 = await getCases(DEMO_NOTARIAT_CONTEXT, { take: 2, skip: 0 });
    const page2 = await getCases(DEMO_NOTARIAT_CONTEXT, { take: 2, skip: 2 });
    if (page1.length === 2 && page2.length > 0) {
      expect(page1[0].id).not.toBe(page2[0].id);
    }
  });
  it("edits a case while preserving metadata and refuses foreign tenant writes", async () => {
    const target = await createCase(DEMO_NOTARIAT_CONTEXT, { caseNumber: `EDIT-${Date.now()}`, title: "Originaler Testtitel", matterType: "REAL_ESTATE", status: "DRAFT", parties: [{ role: "Käufer", name: "Testperson" }] });
    const changed = await updateCase(DEMO_NOTARIAT_CONTEXT, target.id, { title: "Geänderter Testtitel", status: "IN_REVIEW" });
    expect(changed.parties[0].name).toBe("Testperson");
    expect((await getCaseById(DEMO_NOTARIAT_CONTEXT, target.id))?.title).toBe("Geänderter Testtitel");
    await expect(updateCase({ ...DEMO_NOTARIAT_CONTEXT, organizationId: "org_e2e_b" }, target.id, { title: "Fremde Änderung" })).rejects.toThrow();
    expect((await getCaseById(DEMO_NOTARIAT_CONTEXT, target.id))?.title).toBe("Geänderter Testtitel");
  });

});

describe("case editing concurrency and permissions", () => {
  it("allows only one concurrent save from the same case revision", async () => {
    const record = await createCase(DEMO_NOTARIAT_CONTEXT, { caseNumber: `EDIT-${Date.now()}`, title: "Parallele Bearbeitung", matterType: "REAL_ESTATE", status: "DRAFT", parties: [] });
    const results = await Promise.allSettled([
      updateCase(DEMO_NOTARIAT_CONTEXT, record.id, { title: "Erste Änderung" }, record.updatedAt),
      updateCase(DEMO_NOTARIAT_CONTEXT, record.id, { title: "Zweite Änderung" }, record.updatedAt),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await getPrismaClient()!.auditEvent.count({ where: { organizationId: DEMO_NOTARIAT_CONTEXT.organizationId, entityId: record.id, action: "CASE_UPDATED" } })).toBe(1);
    await deleteCase(DEMO_NOTARIAT_CONTEXT, record.id);
  });

  it("clears optional data without permitting viewers or foreign tenants to write", async () => {
    const record = await createCase(DEMO_NOTARIAT_CONTEXT, { caseNumber: `CLEAR-${Date.now()}`, title: "Optionale Angaben löschen", matterType: "REAL_ESTATE", status: "DRAFT", description: "Notiz", notaryName: "Testnotarin", targetDate: "2027-05-01T08:00:00Z", parties: [{ name: "Test Person", role: "Käufer", nationality: "DE" }], propertyDetails: { sheetNumber: "123" } });
    await expect(updateCase({ ...DEMO_NOTARIAT_CONTEXT, userRole: "VIEWER" }, record.id, { title: "Unerlaubter Titel" }, record.updatedAt)).rejects.toThrow(/Lesezugriff/);
    await expect(updateCase({ ...DEMO_NOTARIAT_CONTEXT, organizationId: "org_e2e_b" }, record.id, { title: "Fremder Titel" }, record.updatedAt)).rejects.toThrow(CaseNotFoundError);
    const cleared = await updateCase(DEMO_NOTARIAT_CONTEXT, record.id, { description: "", notaryName: "", targetDate: "", parties: [], propertyDetails: {} }, record.updatedAt);
    expect(cleared.description).toBe(""); expect(cleared.notaryName).toBe(""); expect(cleared.targetDate).toBeNull();
    expect(cleared.parties).toEqual([]); expect(cleared.propertyDetails).toEqual({});
    await deleteCase(DEMO_NOTARIAT_CONTEXT, record.id);
  });
});
