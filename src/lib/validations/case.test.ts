import { describe, it, expect } from "vitest";
import { createCaseSchema } from "./case";

describe("createCaseSchema validation", () => {
  it("accepts valid German notary case inputs", () => {
    const validData = {
      caseNumber: "2026-UR-0981",
      title: "Grundstückskaufvertrag Gemarkung Nymphenburg",
      matterType: "REAL_ESTATE" as const,
      status: "DRAFT" as const,
      description: "Verkauf eines Flurstücks mit Vorverkaufsrecht.",
      notaryName: "Dr. Johannes Weiss",
      assignedClerk: "Stefanie Bauer",
      parties: [
        { role: "Verkäufer", name: "Dr. Klaus Müller", address: "München" },
        { role: "Käufer", name: "Anna Schmidt", address: "Augsburg" },
      ],
    };

    const result = createCaseSchema.safeParse(validData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.caseNumber).toBe("2026-UR-0981");
      expect(result.data.parties).toHaveLength(2);
    }
  });

  it("rejects invalid case number with special symbols", () => {
    const invalidData = {
      caseNumber: "2026-UR#<invalid>",
      title: "Gültiger Titel für die Akte",
      matterType: "REAL_ESTATE" as const,
    };

    const result = createCaseSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain("caseNumber");
    }
  });

  it("rejects overly short title", () => {
    const invalidData = {
      caseNumber: "2026-UR-01",
      title: "Abc",
    };

    const result = createCaseSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "title")).toBe(true);
    }
  });

  it("validates target date format", () => {
    const invalidData = {
      caseNumber: "2026-UR-002",
      title: "Testurkunde Gültig",
      targetDate: "invalid-date-string",
    };

    const result = createCaseSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "targetDate")).toBe(true);
    }
  });

  it("accepts comprehensive real estate deed data with land registry, financials, and extended party fields", () => {
    const fullData = {
      caseNumber: "2026-UR-0999",
      title: "Grundstückskaufvertrag Flur 14, Gemarkung Schwabing",
      matterType: "REAL_ESTATE" as const,
      status: "DRAFT" as const,
      description: "Verkauf eines Baugrundstücks nebst Grundschuldbestellung.",
      notaryName: "Dr. Johannes Weiss",
      assignedClerk: "Stefanie Bauer",
      parties: [
        {
          role: "Verkäufer",
          name: "Dr. Klaus Müller",
          address: "Leopoldstr. 10, 80802 München",
          taxId: "12 345 678 901",
          birthDate: "1975-04-12",
          maritalStatus: "verheiratet im gesetzlichen Güterstand",
          nationality: "deutsch",
          email: "klaus.mueller@example.com",
          phone: "+49 89 123456",
        },
      ],
      propertyDetails: {
        landRegistryDistrict: "Schwabing",
        sheetNumber: "1234",
        parcelNumber: "Flur 14, Flurstück 56/7",
        areaSqm: 750,
        economicUse: "Wohnbaufläche",
      },
      financials: {
        dealValue: 1200000,
        currency: "EUR",
        paymentDueDate: "2026-11-30",
        existingEncumbrances: "Abt. III Nr. 1 Grundschuld über 400.000 EUR zu löschen",
      },
      specialDetails: {
        commercialRegister: "HRB 12345",
        registerCourt: "Amtsgericht München",
        shareCapital: 25000,
      },
    };

    const result = createCaseSchema.safeParse(fullData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.parties[0].taxId).toBe("12 345 678 901");
      expect(result.data.propertyDetails?.landRegistryDistrict).toBe("Schwabing");
      expect(result.data.financials?.dealValue).toBe(1200000);
      expect(result.data.specialDetails?.registerCourt).toBe("Amtsgericht München");
    }
  });
});
