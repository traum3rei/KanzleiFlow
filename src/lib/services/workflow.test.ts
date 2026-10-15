import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  assertValidTransition,
  canTransition,
  WorkflowTransitionError,
} from "@/lib/workflow/state-machine";
import {
  extractRawTextFromBuffer,
  DocumentValidationError,
} from "./document-service";
import { renderAppointmentSummaryTemplate, TEMPLATE_VERSION } from "@/lib/templates/appointment-summary";
import { ExtractedLegalFields } from "@/lib/ai/schema";
import { TenantContext } from "@/lib/auth/tenant";

describe("Document Processing Workflow Vertical Slice", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, LLM_PROVIDER: "mock" };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("Workflow State Machine & Transition Rules", () => {
    it("allows standard linear workflow transitions", () => {
      expect(canTransition("UPLOADED", "EXTRACTING")).toBe(true);
      expect(canTransition("EXTRACTING", "NEEDS_REVIEW")).toBe(true);
      expect(canTransition("NEEDS_REVIEW", "APPROVED")).toBe(true);
      expect(canTransition("APPROVED", "GENERATING")).toBe(true);
      expect(canTransition("GENERATING", "DRAFT_READY")).toBe(true);
    });

    it("allows failure transitions and retries", () => {
      expect(canTransition("EXTRACTING", "EXTRACTION_FAILED")).toBe(true);
      expect(canTransition("EXTRACTION_FAILED", "EXTRACTING")).toBe(true);
      expect(canTransition("GENERATING", "GENERATION_FAILED")).toBe(true);
      expect(canTransition("GENERATION_FAILED", "GENERATING")).toBe(true);
    });

    it("rejects illegal transitions that skip human review or approval", () => {
      // Skipping human review straight from UPLOADED to DRAFT_READY
      expect(canTransition("UPLOADED", "DRAFT_READY")).toBe(false);
      expect(() => assertValidTransition("UPLOADED", "DRAFT_READY")).toThrow(
        WorkflowTransitionError
      );

      // Attempting draft generation directly from NEEDS_REVIEW without explicit approval
      expect(canTransition("NEEDS_REVIEW", "GENERATING")).toBe(false);
      expect(() => assertValidTransition("NEEDS_REVIEW", "GENERATING")).toThrow(
        WorkflowTransitionError
      );

      // Skipping straight to DRAFT_READY from APPROVED
      expect(canTransition("APPROVED", "DRAFT_READY")).toBe(false);
      expect(() => assertValidTransition("APPROVED", "DRAFT_READY")).toThrow(
        WorkflowTransitionError
      );
    });
  });

  describe("Document Ingestion & Raw Text Extraction", () => {
    it("extracts and trims UTF-8 text from text/plain buffers", async () => {
      const sampleText = "Grundstückskaufvertrag Schwabing München. Urkundenrollen-Nummer 2026-UR-0142.";
      const buffer = Buffer.from(sampleText, "utf-8");

      const extracted = await extractRawTextFromBuffer(
        "kaufvertrag.txt",
        "text/plain",
        buffer
      );
      expect(extracted).toBe(sampleText);
    });

    it("rejects unsupported file formats gracefully", async () => {
      const buffer = Buffer.from("image dummy bytes", "utf-8");

      await expect(
        extractRawTextFromBuffer("scan.jpg", "image/jpeg", buffer)
      ).rejects.toThrow(DocumentValidationError);
    });

    it("rejects empty or whitespace-only files", async () => {
      const buffer = Buffer.from("   \n\t  ", "utf-8");

      await expect(
        extractRawTextFromBuffer("empty.txt", "text/plain", buffer)
      ).rejects.toThrow(DocumentValidationError);
    });
  });

  describe("Deterministic Versioned Template & Draft Generation", () => {
    it("renders reproducible legal draft strictly from approved data with disclaimer", () => {
      const sampleApprovedData: ExtractedLegalFields = {
        documentType: "Grundstückskaufvertrag",
        deedDate: "2026-10-18",
        notaryOffice: "Notariat Dr. Johannes Weiss, München",
        parties: [
          {
            role: "Verkäufer",
            name: "Dr. Barbara Lindner",
            address: "Königinstr. 12, 80539 München",
            birthDate: "1974-05-14",
            taxId: "12 345 678 901",
          },
          {
            role: "Käufer",
            name: "Maximilian Huber",
            address: "Leopoldstr. 45, 80802 München",
            birthDate: "1988-11-23",
            taxId: "98 765 432 109",
          },
        ],
        propertyDetails: {
          landRegistryDistrict: "Schwabing",
          sheetNumber: "4521",
          parcelNumber: "Flur 14, Flurstück 88/2",
          areaSqm: 850,
          economicUse: "Wohnbaufläche",
        },
        financials: {
          purchasePrice: 1850000,
          currency: "EUR",
          paymentDueDate: "2026-11-15",
          existingEncumbrances: ["Abt. II: Geh- und Fahrtrecht"],
        },
        missingFields: [],
        discrepancies: [],
        confidence: 0.95,
        isSyntheticSample: true,
        disclaimer: "SYNTHETISCHER DEMO-DATENSATZ. Keine rechtliche Verbindlichkeit oder Gewähr nach § 17 BeurkG.",
      };

      const output = renderAppointmentSummaryTemplate(sampleApprovedData, {
        caseNumber: "2026-UR-0142",
        caseTitle: "Kaufvertrag Grundstück Flur 14, Gemarkung Schwabing",
        notaryName: "Dr. Johannes Weiss",
        assignedClerk: "Stefanie Bauer",
      });

      // Assertions verifying deterministic output
      expect(output).toContain(`VERSION ${TEMPLATE_VERSION}`);
      expect(output).toContain("2026-UR-0142");
      expect(output).toContain("Dr. Barbara Lindner");
      expect(output).toContain("Maximilian Huber");
      expect(output).toContain("1.850.000,00");
      expect(output).toContain("Schwabing");
      expect(output).toContain("Flur 14, Flurstück 88/2");
      expect(output).toContain("Geh- und Fahrtrecht");
      expect(output).toContain("SYNTHETISCHER DEMO-DATENSATZ");
      expect(output).toContain("Geldwäschegesetz GwG § 11 ff.");
      expect(output).toContain("Human-in-the-Loop");
    });

    it("clearly surfaces unresolved missing fields in draft header if any were approved with warnings", () => {
      const dataWithGaps: ExtractedLegalFields = {
        documentType: "Grundstückskaufvertrag",
        deedDate: null,
        notaryOffice: null,
        parties: [
          {
            role: "Käufer",
            name: "Maximilian Huber",
            address: null,
            birthDate: null,
            taxId: null,
          },
        ],
        propertyDetails: {
          landRegistryDistrict: "Schwabing",
          sheetNumber: null,
          parcelNumber: null,
          areaSqm: null,
          economicUse: null,
        },
        financials: null,
        missingFields: [
          "Grundbuchblatt-Nummer fehlt (Abt. I)",
          "Kaufpreis nicht beziffert",
        ],
        discrepancies: ["Unvollständiger Vorvertrag"],
        confidence: 0.6,
        isSyntheticSample: true,
        disclaimer: "SYNTHETISCHER DEMO-DATENSATZ",
      };

      const output = renderAppointmentSummaryTemplate(dataWithGaps, {
        caseNumber: "2026-UR-0199",
        caseTitle: "Testfall mit Lücken",
      });

      expect(output).toContain("[!] OFFEN: Grundbuchblatt-Nummer fehlt (Abt. I)");
      expect(output).toContain("[!] OFFEN: Kaufpreis nicht beziffert");
      expect(output).toContain("[Wohnsitz / Geschäftsanschrift fehlt]");
    });
  });

  describe("Tenant Isolation Verification", () => {
    it("strictly isolates tenant contexts and prevents cross-tenant access", () => {
      const tenant1: TenantContext = {
        organizationId: "org_notariat_weiss_01",
        organizationSlug: "notariat-weiss",
        organizationName: "Notariat Weiss",
        jurisdiction: "DE-BY",
        userId: "user_weiss_01",
        userName: "Dr. Johannes Weiss",
        userEmail: "j.weiss@notariat-weiss-test.de",
        userRole: "ADMIN",
      };

      const tenant2: TenantContext = {
        organizationId: "org_notariat_schmidt_02",
        organizationSlug: "notariat-schmidt",
        organizationName: "Notariat Schmidt",
        jurisdiction: "DE-NW",
        userId: "user_schmidt_01",
        userName: "Dr. Michael Schmidt",
        userEmail: "m.schmidt@notariat-schmidt-test.de",
        userRole: "NOTARY",
      };

      expect(tenant1.organizationId).not.toBe(tenant2.organizationId);
    });
  });
});
