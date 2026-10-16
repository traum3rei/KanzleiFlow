import { CaseItem } from "@/lib/services/case-service";
import { Party } from "@/lib/validations/case";
import { XnpExportType, XnpValidationReport, XnpValidationIssue } from "./types";

/**
 * Validates a case's structured data against official BNotK XNP / XNotar requirements.
 * Rejects missing required values and distinguishes critical blocking errors from warnings.
 */
export function validateCaseForXnpExport(
  caseData: CaseItem,
  exportType: XnpExportType
): XnpValidationReport {
  const issues: XnpValidationIssue[] = [];
  const missingRequiredFields: string[] = [];
  let verifiedCount = 0;

  // 1. Core Case Metadata (Required for all types)
  if (!caseData.caseNumber || caseData.caseNumber.trim().length === 0) {
    issues.push({
      fieldKey: "caseNumber",
      path: "metadata.caseNumber",
      message: "Aktenzeichen / Urkunden-Nummer ist für die BNotK-Übertragung zwingend erforderlich.",
      severity: "ERROR",
    });
    missingRequiredFields.push("Aktenzeichen (caseNumber)");
  } else {
    verifiedCount++;
  }

  if (!caseData.notaryName || caseData.notaryName.trim().length === 0) {
    issues.push({
      fieldKey: "notaryName",
      path: "metadata.notaryName",
      message: "Zuständiger Notar (Amtstätigkeit) muss für die XNP-Signaturzuordnung angegeben sein.",
      severity: "ERROR",
    });
    missingRequiredFields.push("Zuständiger Notar (notaryName)");
  } else {
    verifiedCount++;
  }

  // 2. Parties validation
  const parties: Party[] = caseData.parties || [];
  if (parties.length === 0) {
    issues.push({
      fieldKey: "parties",
      path: "parties",
      message: "Es müssen mindestens die beteiligten Vertragsparteien erfasst sein.",
      severity: "ERROR",
    });
    missingRequiredFields.push("Vertragsparteien (parties)");
  } else {
    // Validate individual parties
    parties.forEach((p, idx) => {
      if (!p.name || p.name.trim().length === 0) {
        issues.push({
          fieldKey: `parties[${idx}].name`,
          path: `parties[${idx}].name`,
          message: `Beteiligter #${idx + 1}: Name oder Firmenbezeichnung fehlt.`,
          severity: "ERROR",
        });
        missingRequiredFields.push(`Beteiligter #${idx + 1} Name`);
      } else {
        verifiedCount++;
      }

      if (!p.role || p.role.trim().length === 0) {
        issues.push({
          fieldKey: `parties[${idx}].role`,
          path: `parties[${idx}].role`,
          message: `Beteiligter #${idx + 1} (${p.name || "Unbenannt"}): Notarielle Rolle (z. B. Veräußerer/Erwerber) ist erforderlich.`,
          severity: "ERROR",
        });
        missingRequiredFields.push(`Beteiligter #${idx + 1} Rolle`);
      }

      if (!p.address || p.address.trim().length === 0) {
        issues.push({
          fieldKey: `parties[${idx}].address`,
          path: `parties[${idx}].address`,
          message: `Beteiligter #${idx + 1} (${p.name || "Unbenannt"}): Anschrift ist für das XNP-Postfach / Register unvollständig.`,
          severity: exportType === "ENOVA_XML" ? "ERROR" : "WARNING",
        });
        if (exportType === "ENOVA_XML") {
          missingRequiredFields.push(`Beteiligter #${idx + 1} Anschrift`);
        }
      }
    });
  }

  // 3. Export-specific rules
  if (exportType === "XNOTAR_GRUNDBUCH_XML") {
    // Modul Grundbuch requires land registry information
    const prop = caseData.propertyDetails;
    if (!prop?.landRegistryDistrict) {
      issues.push({
        fieldKey: "landRegistryDistrict",
        path: "propertyDetails.landRegistryDistrict",
        message: "Gemarkung ist für Grundbuchanträge zwingend erforderlich (Demo-Pflichtfeld).",
        severity: "ERROR",
      });
      missingRequiredFields.push("Gemarkung (landRegistryDistrict)");
    } else {
      verifiedCount++;
    }

    if (!prop?.sheetNumber) {
      issues.push({
        fieldKey: "sheetNumber",
        path: "propertyDetails.sheetNumber",
        message: "Grundbuchblattnummer ist für Grundbuchanträge zwingend erforderlich.",
        severity: "ERROR",
      });
      missingRequiredFields.push("Grundbuchblatt (sheetNumber)");
    } else {
      verifiedCount++;
    }

    if (!prop?.parcelNumber) {
      issues.push({
        fieldKey: "parcelNumber",
        path: "propertyDetails.parcelNumber",
        message: "Flurstück / Flurnummer ist für die exakte Liegenschaftsbezeichnung erforderlich.",
        severity: "WARNING",
      });
    }

    // Role check: Grundbuch transactions should have seller & buyer
    const hasSeller = parties.some((p) => /verkäufer|veräußerer|übergeber/i.test(p.role));
    const hasBuyer = parties.some((p) => /käufer|erwerber|übernehmer/i.test(p.role));

    if (!hasSeller || !hasBuyer) {
      issues.push({
        fieldKey: "partyRoles",
        path: "parties.roles",
        message: "Für den Grundbuchvollzug werden typischerweise Veräußerer und Erwerber benötigt.",
        severity: "WARNING",
      });
    }
  } else if (exportType === "UVZ_XML") {
    // UVZ requires matter categorization and date
    if (!caseData.targetDate && caseData.status !== "READY_FOR_NOTARIZATION" && caseData.status !== "NOTARIZED") {
      issues.push({
        fieldKey: "targetDate",
        path: "metadata.targetDate",
        message: "Für den UVZ-Eintrag wird ein Beurkundungsdatum oder geplanter Termin empfohlen.",
        severity: "WARNING",
      });
    }
  } else if (exportType === "ENOVA_XML") {
    // eNoVA (Veräußerungsanzeige § 18 GrEStG) requires consideration & tax data
    const fin = caseData.financials;
    if (!fin?.dealValue || fin.dealValue <= 0) {
      issues.push({
        fieldKey: "dealValue",
        path: "financials.dealValue",
        message: "Kaufpreis / Gegenleistung ist für die Veräußerungsanzeige (Demo-Pflichtfeld) zwingend erforderlich.",
        severity: "ERROR",
      });
      missingRequiredFields.push("Kaufpreis (dealValue)");
    } else {
      verifiedCount++;
    }

    if (!caseData.propertyDetails?.landRegistryDistrict) {
      issues.push({
        fieldKey: "landRegistryDistrict",
        path: "propertyDetails.landRegistryDistrict",
        message: "Gemarkung des Veräußerungsobjekts ist für das Finanzamt erforderlich.",
        severity: "ERROR",
      });
      missingRequiredFields.push("Gemarkung (landRegistryDistrict)");
    }
  }

  const errors = issues.filter((i) => i.severity === "ERROR");
  const isValid = errors.length === 0;

  return {
    isValid,
    issues,
    missingRequiredFields,
    verifiedDataCount: verifiedCount,
    isAuthoritative: false,
    summary: isValid
      ? `Die technischen Demo-Pflichtfelder für ${exportType} sind vorhanden. Keine juristische oder amtliche Prüfung.`
      : `Validierung fehlgeschlagen: ${errors.length} Pflichtangabe(n) fehlen für ${exportType}.`,
  };
}
