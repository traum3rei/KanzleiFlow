import { config } from "dotenv";
config({ path: ".env.local" });
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DEMO_NOTARIAT_CONTEXT, TenantContext } from "@/lib/auth/tenant";
import { createCase } from "./case-service";
import {
  ingestDocument,
  getDocumentById,
  deleteDocument,
  DocumentNotFoundError,
} from "./document-service";
import {
  triggerExtraction,
  saveCorrections,
  approveExtraction,
} from "./extraction-service";
import {
  generateDraft,
  DraftGenerationError,
  getDraftById,
} from "./draft-service";
import { TEMPLATE_VERSION } from "@/lib/templates/appointment-summary";

describe("Document Workflow Full Vertical Slice (End-to-End)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, LLM_PROVIDER: "mock" };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("executes the full vertical slice: Ingestion → AI Extraction → Correction → Approval → Draft Generation", async () => {
    // 1. Create a parent case
    const testCase = await createCase(DEMO_NOTARIAT_CONTEXT, {
      caseNumber: `2026-UR-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
      title: "Kaufvertrag Grundstück München-Schwabing Testlauf",
      matterType: "REAL_ESTATE",
      status: "DRAFT",
      description: "Testfall für vollständigen vertikalen Workflow-Schnitt",
      parties: [{ role: "Käufer", name: "Maximilian Huber" }],
    });

    expect(testCase.id).toBeDefined();

    // 2. Ingest synthetic document
    const rawSampleText = `
      KAUFVERTRAG ENTWURF (SYNTHETISCH)
      Gemarkung Schwabing, Flur 14, Flurstück 88/2.
      Verkäufer: Dr. Barbara Lindner, Königinstr. 12, München.
      Käufer: Maximilian Huber, Leopoldstr. 45, München.
      Kaufpreis: 1.850.000 EUR. Gläubigerin: Bayerische Landesbank.
    `;

    const doc = await ingestDocument(DEMO_NOTARIAT_CONTEXT, {
      caseId: testCase.id,
      fileName: "kaufvertrag_schwabing_test.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(rawSampleText, "utf-8"),
    });

    expect(doc.id).toBeDefined();
    expect(doc.workflowStatus).toBe("UPLOADED");
    expect(doc.extractionResult?.workflowStatus).toBe("UPLOADED");

    // 3. Security: Cross-tenant isolation check on document
    const foreignTenant: TenantContext = {
      organizationId: "org_foreign_other_notary",
      organizationSlug: "foreign-notary",
      organizationName: "Anderes Notariat",
      jurisdiction: "DE-NW",
      userId: "usr_foreign",
      userEmail: "foreign@notary.de",
      userName: "Dr. Fremder Notar",
      userRole: "NOTARY",
    };

    await expect(getDocumentById(foreignTenant, doc.id)).rejects.toThrow(
      /Tenant Isolation Violation/
    );

    // 4. Trigger AI Extraction (Mock provider enabled)
    const extractionResult = await triggerExtraction(DEMO_NOTARIAT_CONTEXT, doc.id);
    expect(extractionResult.workflowStatus).toBe("NEEDS_REVIEW");
    expect(extractionResult.extractedData.parties.length).toBeGreaterThanOrEqual(2);
    expect(extractionResult.extractedData.financials?.purchasePrice).toBe(1850000);

    // Verify persisted document status
    const docAfterExtraction = await getDocumentById(DEMO_NOTARIAT_CONTEXT, doc.id);
    expect(docAfterExtraction.workflowStatus).toBe("NEEDS_REVIEW");

    // 5. Human review: Attempt draft generation BEFORE approval (must be rejected!)
    await expect(generateDraft(DEMO_NOTARIAT_CONTEXT, doc.id)).rejects.toThrow(
      DraftGenerationError
    );

    // 6. Human review & correction: User modifies/supplements fields
    const updatedData = {
      ...extractionResult.extractedData,
      reviewNotes: "Alle Grundbuchangaben geprüft.",
    };
    const savedCorrections = await saveCorrections(
      DEMO_NOTARIAT_CONTEXT,
      doc.id,
      updatedData,
      "Notariatsangestellter hat Personalausweis vorgelegt."
    );
    expect(savedCorrections.parties.length).toBeGreaterThanOrEqual(2);

    // 7. Human review: Explicit Approval
    const approvedResult = await approveExtraction(
      DEMO_NOTARIAT_CONTEXT,
      doc.id,
      "Freigabe zur Terminsvorbereitung erteilt."
    );
    expect(approvedResult.isSyntheticSample).toBe(true);

    const docAfterApproval = await getDocumentById(DEMO_NOTARIAT_CONTEXT, doc.id);
    expect(docAfterApproval.workflowStatus).toBe("APPROVED");
    expect(docAfterApproval.extractionResult?.approvedData).toBeDefined();

    // 8. Deterministic Draft Generation strictly from approved data
    const draft = await generateDraft(DEMO_NOTARIAT_CONTEXT, doc.id);
    expect(draft.id).toBeDefined();
    expect(draft.templateVersion).toBe(TEMPLATE_VERSION);
    expect(draft.content).toContain(`VERSION ${TEMPLATE_VERSION}`);
    expect(draft.content).toContain("Dr. Barbara Lindner");
    expect(draft.content).toContain("Maximilian Huber");
    expect(draft.content).toContain("1.850.000,00");
    expect(draft.content).toContain("SYNTHETISCHER DEMO-DATENSATZ");

    // Verify document workflow status is DRAFT_READY
    const docAfterDraft = await getDocumentById(DEMO_NOTARIAT_CONTEXT, doc.id);
    expect(docAfterDraft.workflowStatus).toBe("DRAFT_READY");

    // 9. Draft lookup and tenant isolation
    const retrievedDraft = await getDraftById(DEMO_NOTARIAT_CONTEXT, draft.id);
    expect(retrievedDraft?.id).toBe(draft.id);

    await expect(getDraftById(foreignTenant, draft.id)).rejects.toThrow(
      /Tenant Isolation Violation/
    );
  });

  it("handles provider failure gracefully and transitions to EXTRACTION_FAILED with retry capability", async () => {
    // Create test case
    const testCase = await createCase(DEMO_NOTARIAT_CONTEXT, {
      caseNumber: `2026-UR-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
      title: "Testfall Fehlerbehandlung & Retry",
      matterType: "REAL_ESTATE",
      status: "DRAFT",
      parties: [],
    });

    const doc = await ingestDocument(DEMO_NOTARIAT_CONTEXT, {
      caseId: testCase.id,
      fileName: "fehlerhafter_entwurf.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Dieser Entwurf wird einen Providerfehler simulieren.", "utf-8"),
    });

    // Configure an invalid provider that throws
    process.env.LLM_PROVIDER = "openai";
    delete process.env.OPENAI_API_KEY; // Missing API key will cause LLMConfigurationError

    await expect(
      triggerExtraction(DEMO_NOTARIAT_CONTEXT, doc.id)
    ).rejects.toThrow();

    // Verify document transitioned to EXTRACTION_FAILED
    const docAfterFail = await getDocumentById(DEMO_NOTARIAT_CONTEXT, doc.id);
    expect(docAfterFail.workflowStatus).toBe("EXTRACTION_FAILED");
    expect(docAfterFail.extractionResult?.errorMessage).toBeDefined();

    // Now restore working provider and retry
    process.env.LLM_PROVIDER = "mock";
    const retryResult = await triggerExtraction(DEMO_NOTARIAT_CONTEXT, doc.id);
    expect(retryResult.workflowStatus).toBe("NEEDS_REVIEW");

    const docAfterRetry = await getDocumentById(DEMO_NOTARIAT_CONTEXT, doc.id);
    expect(docAfterRetry.workflowStatus).toBe("NEEDS_REVIEW");
  });

  it("allows user to delete an uploaded document along with physical storage and extraction data", async () => {
    // 1. Create a test case
    const testCase = await createCase(DEMO_NOTARIAT_CONTEXT, {
      caseNumber: `2026-UR-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
      title: "Testfall Dokumentenlöschung",
      matterType: "REAL_ESTATE",
      status: "DRAFT",
      parties: [],
    });

    // 2. Ingest document
    const doc = await ingestDocument(DEMO_NOTARIAT_CONTEXT, {
      caseId: testCase.id,
      fileName: "loeschbares_dokument.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Zu löschender Dokumentinhalt für Notariatstest.", "utf-8"),
    });

    expect(doc.id).toBeDefined();

    // Verify document can be found
    const fetched = await getDocumentById(DEMO_NOTARIAT_CONTEXT, doc.id);
    expect(fetched.id).toBe(doc.id);

    // 3. Delete document
    await deleteDocument(DEMO_NOTARIAT_CONTEXT, doc.id);

    // 4. Verify document is gone
    await expect(getDocumentById(DEMO_NOTARIAT_CONTEXT, doc.id)).rejects.toThrow(
      DocumentNotFoundError
    );
  });
});
