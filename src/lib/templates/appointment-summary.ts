import { ExtractedLegalFields } from "@/lib/ai/schema";

export const TEMPLATE_VERSION = "1.0.0";
export const TEMPLATE_NAME = "Vorbereitungsvermerk zum Kaufvertrag (Terminsvorbereitung)";

export interface TemplateContext {
  caseNumber: string;
  caseTitle: string;
  notaryName?: string | null;
  assignedClerk?: string | null;
}

/**
 * Deterministically formats currency in German format (e.g. 1.850.000,00 EUR)
 */
function formatCurrency(amount: number | null, currency = "EUR"): string {
  if (amount === null || isNaN(amount)) return "— [noch zu beziffern] —";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
  }).format(amount);
}

/**
 * Formats date into German DD.MM.YYYY string
 */
function formatDate(isoDate: string | null): string {
  if (!isoDate) return "— [Datum offen] —";
  try {
    const d = new Date(isoDate);
    return d.toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return isoDate;
  }
}

/**
 * Versioned, deterministic legal draft generator.
 * Does NOT invoke any LLM; builds directly from human-approved structured data.
 */
export function renderAppointmentSummaryTemplate(
  data: ExtractedLegalFields,
  context: TemplateContext
): string {
  const generatedAt = new Date().toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const partiesList = data.parties.length > 0
    ? data.parties
        .map((p, idx) => {
          return `${idx + 1}. ${p.role.toUpperCase()}:
   Name:      ${p.name}
   Anschrift: ${p.address || "[Wohnsitz / Geschäftsanschrift fehlt]"}
   Geburtsdatum: ${p.birthDate ? formatDate(p.birthDate) : "[fehlt]"}
   Steuer-ID: ${p.taxId || "[nachzureichen nach § 139b AO]"}`;
        })
        .join("\n\n")
    : "   [Keine Vertragsparteien erfasst]";

  const encumbrances = data.financials?.existingEncumbrances?.length
    ? data.financials.existingEncumbrances.map((e) => `   - ${e}`).join("\n")
    : "   - Keine eingetragenen Belastungen oder Vorlasten vermerkt.";

  const missingWarnings = data.missingFields.length > 0
    ? `HINWEISE ZU NOCH OFFENEN PFLICHTANGABEN:\n` +
      data.missingFields.map((m) => `   [!] OFFEN: ${m}`).join("\n") + "\n\n"
    : "STATUS: Alle wesentlichen Pflichtangaben des Sachverhalts wurden erfasst und plausibilisiert.\n\n";

  return `================================================================================
NOTARIAT DR. JOHANNES WEISS & PARTNER — MÜNCHEN
VORBEREITUNGSVERMERK ZUR BEURKUNDUNG (VERSION ${TEMPLATE_VERSION})
================================================================================

AKTENZEICHEN:       ${context.caseNumber}
BEZEICHNUNG:        ${context.caseTitle}
ZUSTÄNDIGER NOTAR:  ${context.notaryName || "Dr. Johannes Weiss"}
SACHBEARBEITUNG:    ${context.assignedClerk || "Stefanie Bauer"}
ERSTELLT AM:        ${generatedAt} Uhr

--------------------------------------------------------------------------------
WICHTIGER HINWEIS / COMPLIANCE-DISCLAIMER:
${data.disclaimer}
Dieser Entwurf wurde auf Basis geprüfter und menschlich freigegebener Daten
(Human-in-the-Loop) deterministisch generiert. Er stellt keine rechtsverbindliche
Urkunde im Sinne des § 17 BeurkG dar.
--------------------------------------------------------------------------------

${missingWarnings}§ 1 VERTRAGSBETEILIGTE
--------------------------------------------------------------------------------
${partiesList}

§ 2 VERTRAGSGEGENSTAND & GRUNDBUCHSTAND
--------------------------------------------------------------------------------
Gemarkung:          ${data.propertyDetails?.landRegistryDistrict || "[fehlt]"}
Grundbuchblatt:     ${data.propertyDetails?.sheetNumber || "[Abt. I noch beizuziehen]"}
Flurstück:          ${data.propertyDetails?.parcelNumber || "[Flurbezeichnung offen]"}
Fläche:             ${data.propertyDetails?.areaSqm ? `${data.propertyDetails.areaSqm} m²` : "[Fläche unbestimmt]"}
Nutzungsart:        ${data.propertyDetails?.economicUse || "Wohnbaufläche"}

§ 3 GEGENLEISTUNG & FINANZIERUNG
--------------------------------------------------------------------------------
Kaufpreis:          ${formatCurrency(data.financials?.purchasePrice ?? null, data.financials?.currency)}
Fälligkeit:         ${data.financials?.paymentDueDate ? formatDate(data.financials.paymentDueDate) : "14 Tage nach Vorliegen aller Fälligkeitsvoraussetzungen"}
Zahlweg:            Überweisung auf das Notaranderkonto / Direktzahlung an Verkäufer

Eingetragene Lasten (Abt. II & III):
${encumbrances}

§ 4 NOTARIELLE WEGFÜHRUNG & VOLLZUGSHINWEISE
--------------------------------------------------------------------------------
1. Identitätsnachweis:
   Alle Erschienenen haben sich durch gültige amtliche Lichtbildausweise auszuweisen
   (Geldwäschegesetz GwG § 11 ff.).
2. Vorlage Steuer-Identifikationsnummern:
   Verpflichtend zur Meldung gem. Grunderwerbsteuergesetz (GrEStG) an das zuständige
   Finanzamt für Verkehrsteuern.
3. Vormerkung & Lastenfreistellung:
   Zur Sicherung des Käufers ist die Eintragung einer Eigentumsvormerkung (Auflassungsvormerkung)
   im Grundbuch vorzusehen.

§ 5 PRÜF- UND FREIGABEVERMERK
--------------------------------------------------------------------------------
Die vorstehenden Daten wurden mit den eingereichten Unterlagen abgeglichen und
zur Vorbereitung des Notartermins durch die Sachbearbeitung freigegeben.

Template-Version: ${TEMPLATE_VERSION}
Generierungsmodus: Deterministisch (Approved Data Snapshot)
`;
}
