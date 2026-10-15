import { config } from "dotenv";
config({ path: ".env.local" });
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import JSZip from "jszip";
import {
  DEMO_NOTARIAT_CONTEXT,
  TenantContext,
  TenantIsolationError,
} from "@/lib/auth/tenant";
import { createCase } from "./case-service";
import { ingestDocument } from "./document-service";
import {
  triggerExtraction,
  saveCorrections,
  approveExtraction,
} from "./extraction-service";
import {
  generateDraft,
  getDraftById,
  getDraftsForCase,
  getDraftDocxBuffer,
  DraftGenerationError,
} from "./draft-service";
import { TEMPLATE_VERSION } from "@/lib/templates/appointment-summary";
import { ExtractedLegalFields } from "@/lib/ai/schema";
import { getPrismaClient } from "@/lib/db";

const TENANT_FOREIGN: TenantContext = {
  organizationId: "org_notariat_schmidt_02",
  organizationSlug: "notariat-schmidt-nuernberg",
  organizationName: "Notariat Dr. Schmidt (Nürnberg)",
  jurisdiction: "DE-BY",
  userId: "usr_notary_schmidt_02",
  userEmail: "schmidt@notariat-schmidt.de",
  userName: "Dr. Friedrich Schmidt",
  userRole: "NOTARY",
};

describe("Milestone: DOCX Generation and Document Lifecycle", () => {
  const originalEnv = process.env;
  const prisma = getPrismaClient();
  const randomCaseNumber = () =>
    `2026-UR-${Date.now()}-${Math.floor(10000 + Math.random() * 90000)}`;

  beforeEach(() => {
    process.env = { ...originalEnv, LLM_PROVIDER: "mock" };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const syntheticSampleData: ExtractedLegalFields = {
    documentType: "Grundstückskaufvertrag",
    deedDate: "2026-03-15",
    notaryOffice: "Notariat Dr. Johannes Weiss & Partner, München",
    parties: [
      {
        role: "Verkäufer",
        name: "Dr. Barbara Lindner",
        address: "Königinstr. 12, 80539 München",
        birthDate: "1968-07-22",
        taxId: "45 123 789 012",
      },
      {
        role: "Käufer",
        name: "Maximilian Huber",
        address: "Leopoldstr. 45, 80802 München",
        birthDate: "1985-11-04",
        taxId: "78 456 123 789",
      },
    ],
    propertyDetails: {
      landRegistryDistrict: "Schwabing",
      sheetNumber: "4512",
      parcelNumber: "88/2",
      areaSqm: 640,
      economicUse: "Wohnbaufläche mit Mehrfamilienhaus",
    },
    financials: {
      purchasePrice: 1850000,
      currency: "EUR",
      paymentDueDate: "2026-05-01",
      existingEncumbrances: ["Grundschuld über 450.000 EUR zu Gunsten Bayerische Landesbank"],
    },
    missingFields: [],
    discrepancies: [],
    confidence: 0.98,
    isSyntheticSample: true,
    disclaimer:
      "SYNTHETISCHER DEMO-DATENSATZ. Keine rechtliche Verbindlichkeit oder Gewähr nach § 17 BeurkG.",
  };

  /**
   * Helper: Ingests a document, runs extraction, and approves it through the valid state machine.
   */
  async function prepareApprovedDocument(
    caseId: string,
    customData?: ExtractedLegalFields,
    reviewNotes = "Sachbearbeitervermerk: Daten verifiziert."
  ) {
    const rawText = `
      KAUFVERTRAG ENTWURF (SYNTHETISCH)
      Gemarkung Schwabing, Flur 14, Flurstück 88/2.
      Verkäufer: Dr. Barbara Lindner, Königinstr. 12, München.
      Käufer: Maximilian Huber, Leopoldstr. 45, München.
      Kaufpreis: 1.850.000 EUR. Gläubigerin: Bayerische Landesbank.
    `;

    const doc = await ingestDocument(DEMO_NOTARIAT_CONTEXT, {
      caseId,
      fileName: `kaufvertrag_${Math.floor(Math.random() * 100000)}.txt`,
      mimeType: "text/plain",
      buffer: Buffer.from(rawText, "utf-8"),
    });

    // 1. Transition: UPLOADED -> EXTRACTING -> NEEDS_REVIEW
    await triggerExtraction(DEMO_NOTARIAT_CONTEXT, doc.id);

    // Save custom data if provided before explicit human approval
    if (customData) {
      await saveCorrections(DEMO_NOTARIAT_CONTEXT, doc.id, customData, reviewNotes);
    }

    // 2. Transition: NEEDS_REVIEW -> APPROVED
    await approveExtraction(
      DEMO_NOTARIAT_CONTEXT,
      doc.id,
      reviewNotes
    );

    return doc;
  }

  // 1. DOCX generation from approved data
  it("generates a professional DOCX document from approved data with valid OpenXML structure", async () => {
    const testCase = await createCase(DEMO_NOTARIAT_CONTEXT, {
      caseNumber: randomCaseNumber(),
      title: "Kaufvertrag Leopoldstraße 45",
      matterType: "REAL_ESTATE",
      status: "DRAFT",
      parties: [],
    });

    const doc = await prepareApprovedDocument(testCase.id);

    // Generate draft
    const draft = await generateDraft(DEMO_NOTARIAT_CONTEXT, doc.id);
    expect(draft.id).toBeDefined();
    expect(draft.version).toBe(1);
    expect(draft.title).toMatch(/\.docx$/);

    // Fetch the binary buffer
    const { buffer, filename } = await getDraftDocxBuffer(DEMO_NOTARIAT_CONTEXT, draft.id);
    expect(filename).toBe(draft.title);
    expect(buffer.length).toBeGreaterThan(5000);

    // Verify ZIP magic bytes (PK\x03\x04)
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
    expect(buffer[2]).toBe(0x03);
    expect(buffer[3]).toBe(0x04);

    // Verify inner OpenXML structure via JSZip
    const zip = await JSZip.loadAsync(buffer);
    const docXml = await zip.file("word/document.xml")?.async("text");
    expect(docXml).toBeDefined();
    expect(docXml).toContain("VORBEREITUNGSVERMERK");
    expect(docXml).toContain(testCase.caseNumber);
    expect(docXml).toContain("Barbara Lindner");
    expect(docXml).toContain("Maximilian Huber");
    expect(docXml).toContain("Schwabing");
    expect(docXml).toContain("1.850.000,00");
  });

  // 2. Rejection of unapproved data
  it("rejects draft generation when document extraction has not been explicitly approved", async () => {
    const testCase = await createCase(DEMO_NOTARIAT_CONTEXT, {
      caseNumber: randomCaseNumber(),
      title: "Ungeprüfte Urkunde",
      matterType: "REAL_ESTATE",
      status: "DRAFT",
      parties: [],
    });

    const doc = await ingestDocument(DEMO_NOTARIAT_CONTEXT, {
      caseId: testCase.id,
      fileName: "ungepruefter_entwurf.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Rohdaten ohne Freigabe mit ausreichender Textlänge.", "utf-8"),
    });

    // Document is in UPLOADED status, NOT approved
    await expect(generateDraft(DEMO_NOTARIAT_CONTEXT, doc.id)).rejects.toThrow(
      DraftGenerationError
    );
    await expect(generateDraft(DEMO_NOTARIAT_CONTEXT, doc.id)).rejects.toThrow(
      /ausschließlich aus dem Status 'APPROVED'/
    );
  });

  // 3. Correct template-version metadata
  it("includes correct template name and version metadata in both database record and DOCX", async () => {
    const testCase = await createCase(DEMO_NOTARIAT_CONTEXT, {
      caseNumber: randomCaseNumber(),
      title: "Template Metadaten Test",
      matterType: "REAL_ESTATE",
      status: "DRAFT",
      parties: [],
    });

    const doc = await prepareApprovedDocument(testCase.id);
    const draft = await generateDraft(DEMO_NOTARIAT_CONTEXT, doc.id);

    expect(draft.templateVersion).toBe(TEMPLATE_VERSION);

    const { buffer } = await getDraftDocxBuffer(DEMO_NOTARIAT_CONTEXT, draft.id);
    const zip = await JSZip.loadAsync(buffer);
    const docXml = await zip.file("word/document.xml")?.async("text");
    expect(docXml).toContain(`v${TEMPLATE_VERSION}`);
  });

  // 4. Snapshot immutability
  it("preserves an immutable approvedDataSnapshot that cannot be altered by subsequent case changes", async () => {
    const testCase = await createCase(DEMO_NOTARIAT_CONTEXT, {
      caseNumber: randomCaseNumber(),
      title: "Originaler Aktenname",
      matterType: "REAL_ESTATE",
      status: "DRAFT",
      parties: [],
    });

    const doc = await prepareApprovedDocument(testCase.id);
    const draft = await generateDraft(DEMO_NOTARIAT_CONTEXT, doc.id);

    const originalSnapshotPrice = draft.approvedDataSnapshot?.financials?.purchasePrice;
    expect(originalSnapshotPrice).toBe(1850000);

    // Later: Attempt to tamper with case or extraction result in database
    if (prisma) {
      await prisma.case.update({
        where: { id: testCase.id },
        data: { title: "Veränderter Aktenname nach Entwurfserstellung" },
      });
      await prisma.extractionResult.update({
        where: { documentId: doc.id },
        data: { approvedData: { ...syntheticSampleData, financials: { purchasePrice: 9999999, currency: "EUR", existingEncumbrances: [] } } },
      });
    }

    // Verify previously generated draft record retains its exact immutable snapshot
    const fetchedDraft = await getDraftById(DEMO_NOTARIAT_CONTEXT, draft.id);
    expect(fetchedDraft?.approvedDataSnapshot?.financials?.purchasePrice).toBe(1850000);
    expect(fetchedDraft?.content).toContain("1.850.000,00");
  });

  // 5. Multiple draft versions
  it("creates incrementing version records (v1, v2, v3) upon regeneration without overwriting previous drafts", async () => {
    const testCase = await createCase(DEMO_NOTARIAT_CONTEXT, {
      caseNumber: randomCaseNumber(),
      title: "Multi-Version Test",
      matterType: "REAL_ESTATE",
      status: "DRAFT",
      parties: [],
    });

    const doc = await prepareApprovedDocument(testCase.id);

    // Generation 1 -> Version 1
    const draftV1 = await generateDraft(DEMO_NOTARIAT_CONTEXT, doc.id);
    expect(draftV1.version).toBe(1);
    expect(draftV1.title).toContain("v1.docx");

    // Generation 2 -> Version 2 (Regeneration)
    const draftV2 = await generateDraft(DEMO_NOTARIAT_CONTEXT, doc.id);
    expect(draftV2.version).toBe(2);
    expect(draftV2.title).toContain("v2.docx");
    expect(draftV2.id).not.toBe(draftV1.id);

    // Generation 3 -> Version 3
    const draftV3 = await generateDraft(DEMO_NOTARIAT_CONTEXT, doc.id);
    expect(draftV3.version).toBe(3);

    // Verify all versions coexist in case history
    const allDrafts = await getDraftsForCase(DEMO_NOTARIAT_CONTEXT, testCase.id);
    expect(allDrafts.length).toBeGreaterThanOrEqual(3);
    const versions = allDrafts.map((d) => d.version);
    expect(versions).toContain(1);
    expect(versions).toContain(2);
    expect(versions).toContain(3);
  });

  // 6. Unauthorized downloads rejected
  it("rejects unauthorized cross-tenant downloads with TenantIsolationError", async () => {
    const testCase = await createCase(DEMO_NOTARIAT_CONTEXT, {
      caseNumber: randomCaseNumber(),
      title: "Auth Security Test",
      matterType: "REAL_ESTATE",
      status: "DRAFT",
      parties: [],
    });

    const doc = await prepareApprovedDocument(testCase.id);
    const draft = await generateDraft(DEMO_NOTARIAT_CONTEXT, doc.id);

    // Foreign tenant tries to download DOCX buffer
    await expect(getDraftDocxBuffer(TENANT_FOREIGN, draft.id)).rejects.toThrow(
      TenantIsolationError
    );
    await expect(getDraftDocxBuffer(TENANT_FOREIGN, draft.id)).rejects.toThrow(
      /Tenant Isolation Violation/
    );
  });

  // 7. Missing fields and disclaimer inclusion
  it("clearly marks missing fields and includes statutory disclaimer in generated DOCX", async () => {
    const dataWithGaps: ExtractedLegalFields = {
      ...syntheticSampleData,
      propertyDetails: {
        landRegistryDistrict: "Schwabing",
        sheetNumber: null, // Missing Grundbuchblatt
        parcelNumber: null, // Missing Flurstück
        areaSqm: null,
        economicUse: "Unbebautes Grundstück",
      },
      missingFields: [
        "Grundbuchblattnummer fehlt",
        "Flurstück / Flurnummer nicht bestimmbar",
        "Steuer-ID des Verkäufers",
      ],
      discrepancies: ["Kaufpreis weicht im Entwurf ab"],
    };

    const testCase = await createCase(DEMO_NOTARIAT_CONTEXT, {
      caseNumber: randomCaseNumber(),
      title: "Lücken- und Hinweistest",
      matterType: "REAL_ESTATE",
      status: "DRAFT",
      parties: [],
    });

    const doc = await prepareApprovedDocument(testCase.id, dataWithGaps);
    const draft = await generateDraft(DEMO_NOTARIAT_CONTEXT, doc.id);

    const { buffer } = await getDraftDocxBuffer(DEMO_NOTARIAT_CONTEXT, draft.id);
    const zip = await JSZip.loadAsync(buffer);
    const docXml = await zip.file("word/document.xml")?.async("text");

    // Verify statutory disclaimer
    expect(docXml).toContain("WICHTIGER HINWEIS / COMPLIANCE-DISCLAIMER");
    expect(docXml).toContain("§ 17 BeurkG");

    // Verify missing field alerts in the DOCX
    expect(docXml).toContain("KLÄRUNGSBEDARF");
    expect(docXml).toContain("Grundbuchblattnummer fehlt");
    expect(docXml).toContain("Flurstück / Flurnummer nicht bestimmbar");
    expect(docXml).toContain("fehlt");
  });

  // 8. Generation failure and retry behavior
  it("transitions to GENERATION_FAILED on failure and recovers upon successful retry", async () => {
    const testCase = await createCase(DEMO_NOTARIAT_CONTEXT, {
      caseNumber: randomCaseNumber(),
      title: "Failure & Retry Test",
      matterType: "REAL_ESTATE",
      status: "DRAFT",
      parties: [],
    });

    const doc = await prepareApprovedDocument(testCase.id);

    // Provide malformed data snapshot to force generation failure
    if (prisma) {
      await prisma.extractionResult.update({
        where: { documentId: doc.id },
        data: { approvedData: { isSyntheticSample: "invalid_not_a_boolean" } },
      });
    }

    // Attempt generation -> should fail and transition to GENERATION_FAILED
    await expect(generateDraft(DEMO_NOTARIAT_CONTEXT, doc.id)).rejects.toThrow(
      DraftGenerationError
    );

    const docFailed = await prisma?.document.findUnique({ where: { id: doc.id } });
    expect(docFailed?.workflowStatus).toBe("GENERATION_FAILED");

    // Fix the data (approvedData) and retry
    if (prisma) {
      await prisma.extractionResult.update({
        where: { documentId: doc.id },
        data: { approvedData: syntheticSampleData as unknown as object },
      });
    }

    // Retry should succeed from GENERATION_FAILED
    const recoveredDraft = await generateDraft(DEMO_NOTARIAT_CONTEXT, doc.id);
    expect(recoveredDraft.id).toBeDefined();

    const docRecovered = await prisma?.document.findUnique({ where: { id: doc.id } });
    expect(docRecovered?.workflowStatus).toBe("DRAFT_READY");
  });
});
