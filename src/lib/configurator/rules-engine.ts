/**
 * Deterministic Rules Engine for Document Configurator
 * Pure TypeScript business logic evaluating validation errors, clause dependencies,
 * incompatibilities, and draft generation eligibility without any React or LLM dependencies.
 */

import {
  DocumentConfigurationData,
  RulesEvaluationResult,
  ValidationIssue,
  IncompatiblePair,
  UnsatisfiedDependency,
} from "./types";
import { REAL_ESTATE_CLAUSES } from "./clauses";

const CLAUSE_MAP = new Map(REAL_ESTATE_CLAUSES.map((c) => [c.code, c]));

/**
 * Evaluates a complete or partial document configuration against German notarial drafting rules.
 */
export function evaluateConfiguration(
  data: DocumentConfigurationData,
  clauseCodes: string[] = data.selectedClauseCodes || []
): RulesEvaluationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const missingRequiredFields: string[] = [];
  const incompatibleClausePairs: IncompatiblePair[] = [];
  const unsatisfiedDependencies: UnsatisfiedDependency[] = [];

  const selectedSet = new Set(clauseCodes);

  // --------------------------------------------------------------------------
  // STEP 1: Parties (Beteiligte)
  // --------------------------------------------------------------------------
  const parties = data.parties || [];
  const sellers = parties.filter((p) => p.role === "Verkäufer");
  const buyers = parties.filter((p) => p.role === "Käufer");

  if (sellers.length === 0) {
    errors.push({
      step: 1,
      field: "parties.sellers",
      message: "Mindestens ein Verkäufer muss angegeben werden.",
      severity: "error",
    });
    missingRequiredFields.push("Verkäufer (mindestens eine Partei)");
  }

  if (buyers.length === 0) {
    errors.push({
      step: 1,
      field: "parties.buyers",
      message: "Mindestens ein Käufer muss angegeben werden.",
      severity: "error",
    });
    missingRequiredFields.push("Käufer (mindestens eine Partei)");
  }

  parties.forEach((party, idx) => {
    const rolePrefix = `${party.role || "Beteiligter"} #${idx + 1}`;

    if (!party.name || party.name.trim().length === 0) {
      errors.push({
        step: 1,
        field: `parties[${idx}].name`,
        message: `${rolePrefix}: Vollständiger Name fehlt.`,
        severity: "error",
      });
      missingRequiredFields.push(`${rolePrefix} Name`);
    }

    if (!party.address || party.address.trim().length === 0) {
      errors.push({
        step: 1,
        field: `parties[${idx}].address`,
        message: `${rolePrefix}: Wohnanschrift (Straße & Hausnummer) fehlt.`,
        severity: "error",
      });
      missingRequiredFields.push(`${rolePrefix} Wohnanschrift`);
    }

    if (party.actingForSelf === false && (!party.representativeName || party.representativeName.trim().length === 0)) {
      errors.push({
        step: 1,
        field: `parties[${idx}].representativeName`,
        message: `${rolePrefix}: Name des Vertreters / Bevollmächtigten muss angegeben werden.`,
        severity: "error",
      });
      missingRequiredFields.push(`${rolePrefix} Vertretername`);
    }

    if (!party.taxId || party.taxId.trim().length === 0) {
      warnings.push({
        step: 1,
        field: `parties[${idx}].taxId`,
        message: `${rolePrefix}: Steuer-Identifikationsnummer (IdNr) für Grunderwerbsteueranzeige fehlt.`,
        severity: "warning",
      });
    }

    if (!party.birthDate || party.birthDate.trim().length === 0) {
      warnings.push({
        step: 1,
        field: `parties[${idx}].birthDate`,
        message: `${rolePrefix}: Geburtsdatum fehlt.`,
        severity: "warning",
      });
    }
  });

  // --------------------------------------------------------------------------
  // STEP 2: Property (Grundstück)
  // --------------------------------------------------------------------------
  const property = data.property || {};

  if (!property.landRegistryDistrict || property.landRegistryDistrict.trim().length === 0) {
    errors.push({
      step: 2,
      field: "property.landRegistryDistrict",
      message: "Grundbuchbezirk fehlt.",
      severity: "error",
    });
    missingRequiredFields.push("Grundbuchbezirk");
  }

  if (!property.sheetNumber || property.sheetNumber.trim().length === 0) {
    errors.push({
      step: 2,
      field: "property.sheetNumber",
      message: "Grundbuchblatt-Nummer fehlt.",
      severity: "error",
    });
    missingRequiredFields.push("Grundbuchblatt");
  }

  if (!property.parcelNumber || property.parcelNumber.trim().length === 0) {
    errors.push({
      step: 2,
      field: "property.parcelNumber",
      message: "Flurstücksnummer bzw. Parzellendaten fehlen.",
      severity: "error",
    });
    missingRequiredFields.push("Flurstück");
  }

  if (!property.streetAddress || property.streetAddress.trim().length === 0) {
    errors.push({
      step: 2,
      field: "property.streetAddress",
      message: "Lagebezeichnung / Straßenadresse des Grundstücks fehlt.",
      severity: "error",
    });
    missingRequiredFields.push("Grundstücks-Adresse");
  }

  if (!property.plotAreaSqm || property.plotAreaSqm <= 0) {
    warnings.push({
      step: 2,
      field: "property.plotAreaSqm",
      message: "Grundstücksfläche in m² ist nicht beziffert.",
      severity: "warning",
    });
  }

  // --------------------------------------------------------------------------
  // STEP 3: Purchase Price (Kaufpreis & Zahlungsmodalitäten)
  // --------------------------------------------------------------------------
  const price = data.purchasePrice || {};

  if (price.amount === undefined || price.amount === null || isNaN(price.amount) || price.amount <= 0) {
    errors.push({
      step: 3,
      field: "purchasePrice.amount",
      message: "Kaufpreis muss angegeben und größer als 0 EUR sein.",
      severity: "error",
    });
    missingRequiredFields.push("Kaufpreis");
  }

  if (price.useEscrowAccount && (!price.escrowReason || price.escrowReason.trim().length === 0)) {
    errors.push({
      step: 3,
      field: "purchasePrice.escrowReason",
      message: "Bei Abwicklung über Notaranderkonto ist ein berechtigtes Sicherungsinteresse gem. § 54a BeurkG erforderlich.",
      severity: "error",
    });
    missingRequiredFields.push("Anderkonto-Begründung (§ 54a BeurkG)");
  }

  if (price.financingRequired && (!price.financingAmount || price.financingAmount <= 0)) {
    warnings.push({
      step: 3,
      field: "purchasePrice.financingAmount",
      message: "Käuferfinanzierung ausgewählt, aber voraussichtlicher Darlehensbetrag noch nicht beziffert.",
      severity: "warning",
    });
  }

  if (price.financingRequired && price.financingAmount && price.amount && price.financingAmount > price.amount) {
    warnings.push({
      step: 3,
      field: "purchasePrice.financingAmount",
      message: "Finanzierungsbetrag übersteigt den Gesamtkaufpreis.",
      severity: "warning",
    });
  }

  // --------------------------------------------------------------------------
  // STEP 4: Clauses & Rules Validation (Regelungen)
  // --------------------------------------------------------------------------
  if (clauseCodes.length === 0) {
    errors.push({
      step: 4,
      field: "selectedClauseCodes",
      message: "Es müssen vertragliche Regelungen (Klauseln) ausgewählt werden.",
      severity: "error",
    });
  }

  // Check Clause Dependencies & Incompatibilities
  for (const code of clauseCodes) {
    const clauseMeta = CLAUSE_MAP.get(code);
    if (!clauseMeta) continue;

    // 1. Dependencies
    if (clauseMeta.dependencies) {
      for (const depCode of clauseMeta.dependencies) {
        if (!selectedSet.has(depCode)) {
          const depMeta = CLAUSE_MAP.get(depCode);
          const depTitle = depMeta ? depMeta.title : depCode;
          const issue: UnsatisfiedDependency = {
            clauseCode: code,
            missingDependency: depCode,
            reason: `Klausel „${clauseMeta.title}“ setzt die Klausel „${depTitle}“ voraus.`,
          };
          unsatisfiedDependencies.push(issue);
          errors.push({
            step: 4,
            clauseCode: code,
            message: issue.reason,
            severity: "error",
          });
        }
      }
    }

    // 2. Incompatibilities
    if (clauseMeta.incompatibilities) {
      for (const incompCode of clauseMeta.incompatibilities) {
        if (selectedSet.has(incompCode)) {
          // Avoid duplicate pairs by ordering codes
          if (code < incompCode) {
            const incompMeta = CLAUSE_MAP.get(incompCode);
            const incompTitle = incompMeta ? incompMeta.title : incompCode;
            const pair: IncompatiblePair = {
              clauseA: code,
              clauseB: incompCode,
              reason: `Klausel „${clauseMeta.title}“ schließt die Klausel „${incompTitle}“ rechtlich aus.`,
            };
            incompatibleClausePairs.push(pair);
            errors.push({
              step: 4,
              clauseCode: code,
              message: pair.reason,
              severity: "error",
            });
          }
        }
      }
    }

    // 3. Conditional data requirements driven by specific clauses
    if (code === "CLAUSE_ESCROW_ACCOUNT") {
      if (!price.useEscrowAccount) {
        errors.push({
          step: 4,
          clauseCode: code,
          message: "Klausel 'Notaranderkonto' gewählt, aber in Schritt 3 nicht als Zahlungsmodalität aktiviert.",
          severity: "error",
        });
      }
    }

    if (code === "CLAUSE_TENANCY") {
      if (data.terms?.tenancyStatus === "free") {
        errors.push({
          step: 4,
          clauseCode: code,
          message: "Klausel 'Mietverhältnisse' gewählt, das Objekt ist jedoch als 'bezugsfrei' deklariert.",
          severity: "error",
        });
      }
      if (!data.terms?.tenancyDetails || data.terms.tenancyDetails.trim().length === 0) {
        errors.push({
          step: 4,
          clauseCode: code,
          message: "Klausel 'Mietverhältnisse' erfordert nähere Angaben zu Mietverträgen und Kautionen in Schritt 4.",
          severity: "error",
        });
        missingRequiredFields.push("Mietvertrags- & Kautionsdetails");
      }
    }

    if (code === "CLAUSE_FINANCING_CONTINGENCY") {
      if (!price.financingRequired || !price.financingAmount || price.financingAmount <= 0) {
        errors.push({
          step: 4,
          clauseCode: code,
          message: "Klausel 'Finanzierungsvorbehalt' erfordert die Angabe eines konkreten Darlehensbetrags in Schritt 3.",
          severity: "error",
        });
        missingRequiredFields.push("Darlehensbetrag für Finanzierungsvorbehalt");
      }
    }

    if (code === "CLAUSE_NEW_BUILD_WARRANTY" && data.terms?.buildingStatus === "existing") {
      warnings.push({
        step: 4,
        clauseCode: code,
        message: "Neubau-Gewährleistung (§ 634a BGB) für eine Bestandsimmobilie gewählt. Bitte Objektart prüfen.",
        severity: "warning",
      });
    }
  }

  const isValid = errors.length === 0;
  const canGenerateDraft = isValid && missingRequiredFields.length === 0;

  return {
    isValid,
    canGenerateDraft,
    errors,
    warnings,
    missingRequiredFields,
    incompatibleClausePairs,
    unsatisfiedDependencies,
    selectedClausesCount: clauseCodes.length,
  };
}

/**
 * Returns default configuration state with synthetic German sample data for demonstrations.
 */
export function getDefaultConfigurationData(caseNumber = "2026-UR-0142"): DocumentConfigurationData {
  return {
    title: "Kaufvertrag Grundstück & Wohnhaus",
    caseNumber,
    notaryOfficeName: "Notariat Dr. Johannes Weiss & Partner, München",
    parties: [
      {
        id: "p_seller_1",
        role: "Verkäufer",
        name: "Dr. Barbara Lindner",
        address: "Königinstr. 12",
        city: "München",
        postalCode: "80539",
        birthDate: "1974-05-14",
        birthPlace: "München",
        taxId: "12 345 678 901",
        maritalStatus: "Gütertrennung",
        nationality: "deutsch",
        actingForSelf: true,
      },
      {
        id: "p_buyer_1",
        role: "Käufer",
        name: "Maximilian Huber",
        address: "Leopoldstr. 45",
        city: "München",
        postalCode: "80802",
        birthDate: "1988-11-23",
        birthPlace: "Augsburg",
        taxId: "98 765 432 109",
        maritalStatus: "ledig",
        nationality: "deutsch",
        actingForSelf: true,
      },
    ],
    property: {
      landRegistryDistrict: "Schwabing",
      sheetNumber: "4521",
      cadastralDistrict: "München-Schwabing",
      parcelNumber: "Flur 14, Flurstück 88/2",
      streetAddress: "Kaiserstraße 18, 80801 München",
      city: "München",
      postalCode: "80801",
      plotAreaSqm: 850,
      economicUse: "Wohnbaufläche, Ein-/Zweifamilienhaus",
      existingEncumbrancesAbt2: [
        "Abt. II: Geh- und Fahrtrecht zugunsten des jeweiligen Eigentümers Flurstück 88/1",
      ],
      existingEncumbrancesAbt3: [
        "Abt. III: Grundschuld 1.200.000 EUR für Bayerische Landesbank A.d.ö.R.",
      ],
    },
    purchasePrice: {
      amount: 1850000,
      currency: "EUR",
      paymentDueDate: "2026-11-15",
      paymentConditionsDescription: "Fällig 14 Tage nach Mitteilung des Notars über Eintragung der Auflassungsvormerkung und Vorliegen aller Lastenfreistellungsunterlagen.",
      useEscrowAccount: false,
      sellerBankDetails: {
        accountHolder: "Dr. Barbara Lindner",
        iban: "DE89 7002 0270 0012 3456 78",
        bic: "HYVEDEMMXXX",
        bankName: "UniCredit Bank GmbH (HypoVereinsbank)",
      },
      financingRequired: true,
      financingAmount: 1400000,
      financingBankName: "Bayerische Landesbank",
      encumbranceAuthorityRequired: true,
    },
    terms: {
      possessionTransferDate: "2026-11-15",
      tenancyStatus: "free",
      energyCertificatePresent: true,
      energyCertificateDetails: "Bedarfsausweis, 84 kWh/(m²*a), Klasse C, gültig bis 2033",
      buildingStatus: "existing",
      costsAllocation: "standard",
    },
    selectedClauseCodes: REAL_ESTATE_CLAUSES.filter((c) => c.isDefault).map((c) => c.code),
  };
}
