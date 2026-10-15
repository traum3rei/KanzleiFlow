import { describe, it, expect } from "vitest";
import {
  evaluateConfiguration,
  getDefaultConfigurationData,
} from "./rules-engine";

describe("Document Configurator — Deterministic Rules Engine", () => {
  it("validates a fully filled default configuration as valid and draft-eligible", () => {
    const config = getDefaultConfigurationData("2026-UR-0142");
    const result = evaluateConfiguration(config);

    expect(result.isValid).toBe(true);
    expect(result.canGenerateDraft).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.missingRequiredFields).toHaveLength(0);
    expect(result.incompatibleClausePairs).toHaveLength(0);
    expect(result.unsatisfiedDependencies).toHaveLength(0);
  });

  describe("Step 1: Parties Validation", () => {
    it("rejects configuration when sellers are missing", () => {
      const config = getDefaultConfigurationData();
      config.parties = config.parties.filter((p) => p.role !== "Verkäufer");

      const result = evaluateConfiguration(config);
      expect(result.isValid).toBe(false);
      expect(result.canGenerateDraft).toBe(false);
      expect(result.errors.some((e) => e.field === "parties.sellers")).toBe(true);
    });

    it("rejects configuration when buyers are missing", () => {
      const config = getDefaultConfigurationData();
      config.parties = config.parties.filter((p) => p.role !== "Käufer");

      const result = evaluateConfiguration(config);
      expect(result.isValid).toBe(false);
      expect(result.canGenerateDraft).toBe(false);
      expect(result.errors.some((e) => e.field === "parties.buyers")).toBe(true);
    });

    it("requires party address and name", () => {
      const config = getDefaultConfigurationData();
      config.parties[0].name = "";
      config.parties[1].address = "  ";

      const result = evaluateConfiguration(config);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.field?.includes("name"))).toBe(true);
      expect(result.errors.some((e) => e.field?.includes("address"))).toBe(true);
    });

    it("requires representative name when actingForSelf is false", () => {
      const config = getDefaultConfigurationData();
      config.parties[0].actingForSelf = false;
      config.parties[0].representativeName = "";

      const result = evaluateConfiguration(config);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.field?.includes("representativeName"))).toBe(true);
    });
  });

  describe("Step 2: Property Validation", () => {
    it("flags missing land registry details as errors", () => {
      const config = getDefaultConfigurationData();
      config.property.landRegistryDistrict = "";
      config.property.sheetNumber = "";
      config.property.parcelNumber = "";
      config.property.streetAddress = "";

      const result = evaluateConfiguration(config);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.field === "property.landRegistryDistrict")).toBe(true);
      expect(result.errors.some((e) => e.field === "property.sheetNumber")).toBe(true);
      expect(result.errors.some((e) => e.field === "property.parcelNumber")).toBe(true);
      expect(result.errors.some((e) => e.field === "property.streetAddress")).toBe(true);
    });
  });

  describe("Step 3: Purchase Price & Conditional Validation", () => {
    it("rejects zero or negative purchase prices", () => {
      const config = getDefaultConfigurationData();
      config.purchasePrice.amount = 0;

      const result = evaluateConfiguration(config);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.field === "purchasePrice.amount")).toBe(true);
    });

    it("requires escrow reason when useEscrowAccount is true", () => {
      const config = getDefaultConfigurationData();
      config.purchasePrice.useEscrowAccount = true;
      config.purchasePrice.escrowReason = "";

      const result = evaluateConfiguration(config);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.field === "purchasePrice.escrowReason")).toBe(true);
    });
  });

  describe("Step 4: Clause Dependencies & Incompatibilities", () => {
    it("detects unsatisfied clause dependency", () => {
      const config = getDefaultConfigurationData();
      // CLAUSE_POSSESSION depends on CLAUSE_PRICE_DUE
      // Remove CLAUSE_PRICE_DUE from selected clauses
      const clausesWithoutPrice = config.selectedClauseCodes.filter((c) => c !== "CLAUSE_PRICE_DUE");

      const result = evaluateConfiguration(config, clausesWithoutPrice);
      expect(result.isValid).toBe(false);
      expect(result.unsatisfiedDependencies.length).toBeGreaterThan(0);
      expect(
        result.unsatisfiedDependencies.some(
          (d) => d.clauseCode === "CLAUSE_POSSESSION" && d.missingDependency === "CLAUSE_PRICE_DUE"
        )
      ).toBe(true);
    });

    it("detects incompatible clauses: defect exclusion vs new build warranty", () => {
      const config = getDefaultConfigurationData();
      // Add CLAUSE_NEW_BUILD_WARRANTY while CLAUSE_DEFECT_EXCLUSION is active
      const incompatibleClauses = [
        ...config.selectedClauseCodes,
        "CLAUSE_NEW_BUILD_WARRANTY",
      ];

      const result = evaluateConfiguration(config, incompatibleClauses);
      expect(result.isValid).toBe(false);
      expect(result.incompatibleClausePairs.length).toBe(1);
      const pair = result.incompatibleClausePairs[0];
      expect(
        (pair.clauseA === "CLAUSE_DEFECT_EXCLUSION" && pair.clauseB === "CLAUSE_NEW_BUILD_WARRANTY") ||
        (pair.clauseA === "CLAUSE_NEW_BUILD_WARRANTY" && pair.clauseB === "CLAUSE_DEFECT_EXCLUSION")
      ).toBe(true);
    });

    it("requires tenancy details if CLAUSE_TENANCY is selected", () => {
      const config = getDefaultConfigurationData();
      config.selectedClauseCodes.push("CLAUSE_TENANCY");
      config.terms.tenancyStatus = "rented";
      config.terms.tenancyDetails = ""; // missing!

      const result = evaluateConfiguration(config);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.clauseCode === "CLAUSE_TENANCY")).toBe(true);
    });

    it("rejects CLAUSE_TENANCY if object is marked as free/unrented", () => {
      const config = getDefaultConfigurationData();
      config.selectedClauseCodes.push("CLAUSE_TENANCY");
      config.terms.tenancyStatus = "free";
      config.terms.tenancyDetails = "Test Details";

      const result = evaluateConfiguration(config);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.clauseCode === "CLAUSE_TENANCY")).toBe(true);
    });

    it("requires financing amount when CLAUSE_FINANCING_CONTINGENCY is selected", () => {
      const config = getDefaultConfigurationData();
      config.selectedClauseCodes.push("CLAUSE_FINANCING_CONTINGENCY");
      config.purchasePrice.financingRequired = false;
      config.purchasePrice.financingAmount = 0;

      const result = evaluateConfiguration(config);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.clauseCode === "CLAUSE_FINANCING_CONTINGENCY")).toBe(true);
    });
  });
});
