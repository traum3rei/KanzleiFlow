/**
 * ============================================================================
 * KanzleiFlow Microsoft Word Integration Service
 * ============================================================================
 * Provides typed operations using the official Office.js Word JavaScript API.
 * Uses Word Content Controls for repeatable, structured, and auditable insertions.
 * Gracefully degrades to simulation when executed in browser preview environments.
 */

export interface WordInsertionResult {
  success: boolean;
  inserted: boolean;
  simulated: boolean;
  message?: string;
  error?: string;
}

export interface WordPartyItem {
  index: number;
  name: string;
  role: string;
  address?: string;
  taxId?: string;
  birthDate?: string;
  maritalStatus?: string;
  isVerified?: boolean;
}

export interface WordPropertyDetails {
  district?: string;
  sheetNumber?: string;
  parcelNumber?: string;
  areaSqm?: string;
  economicUse?: string;
  isVerified?: boolean;
}

export interface WordFinancialDetails {
  dealValue?: string;
  currency?: string;
  dueDate?: string;
  encumbrances?: string;
  isVerified?: boolean;
}

export interface WordCaseMetadata {
  caseNumber: string;
  title: string;
  matterTypeLabel: string;
  statusLabel: string;
  notaryName: string;
  assignedClerk: string;
  targetDate?: string;
  description?: string;
}

/**
 * Checks whether the current runtime environment is Microsoft Word.
 */
export function isWordHostAvailable(): boolean {
  const g = typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : undefined;
  if (!g) return false;
  const win = g as unknown as { Word?: typeof Word; Office?: typeof Office };
  return Boolean(
    win.Word &&
    win.Office &&
    win.Office.context &&
    win.Office.context.document
  );
}

function getWordGlobal(): typeof Word {
  if (typeof window !== "undefined" && (window as unknown as { Word?: typeof Word }).Word) {
    return (window as unknown as { Word: typeof Word }).Word;
  }
  if (typeof globalThis !== "undefined" && (globalThis as unknown as { Word?: typeof Word }).Word) {
    return (globalThis as unknown as { Word: typeof Word }).Word;
  }
  throw new Error("Microsoft Word JavaScript API nicht verfügbar.");
}

/**
 * Inserts a single field into Word, wrapping it in a Content Control.
 * If executed in a normal browser, logs a simulated insertion message.
 */
export async function insertFieldAsContentControl(
  caseNumber: string,
  fieldKey: string,
  fieldLabel: string,
  value: string | null | undefined,
  options?: { isVerified?: boolean; unverifiedDisclaimer?: boolean }
): Promise<WordInsertionResult> {
  const displayValue = value && value.trim().length > 0
    ? value.trim()
    : "[NICHT ANGEGEBEN]";

  const finalValue = options?.isVerified === false && options?.unverifiedDisclaimer
    ? `${displayValue} [NICHT VERIFIZIERT]`
    : displayValue;

  if (!isWordHostAvailable()) {
    console.info(`[Word Add-in Simulation] Inserted ContentControl: [${fieldLabel}] = "${finalValue}"`);
    return {
      success: true,
      inserted: true,
      simulated: true,
      message: `Vorschau-Modus: Feld „${fieldLabel}“ wurde simuliert eingefügt.`,
    };
  }

  try {
    const WordApi = getWordGlobal();
    await WordApi.run(async (context) => {
      const selection = context.document.getSelection();

      // Insert text at current selection
      const textRange = selection.insertText(finalValue, "Replace");

      // Wrap in a Content Control for auditability and document maintenance
      const cc = textRange.insertContentControl();
      cc.title = `KanzleiFlow: ${fieldLabel}`;
      cc.tag = `KanzleiFlow:${caseNumber}:${fieldKey}`;
      cc.appearance = "BoundingBox";
      cc.color = options?.isVerified === false ? "#F59E0B" : "#18181B";

      await context.sync();
    });

    return {
      success: true,
      inserted: true,
      simulated: false,
      message: `Feld „${fieldLabel}“ erfolgreich in Word eingefügt.`,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("Word API error during insertFieldAsContentControl:", err);
    return {
      success: false,
      inserted: false,
      simulated: false,
      error: `Fehler beim Einfügen in Word: ${errorMsg}`,
    };
  }
}

/**
 * Inserts a formatted heading into the active Word document.
 */
export async function insertDocumentHeading(
  text: string,
  level: 1 | 2 | 3 = 2
): Promise<WordInsertionResult> {
  if (!isWordHostAvailable()) {
    console.info(`[Word Add-in Simulation] Inserted Heading ${level}: "${text}"`);
    return {
      success: true,
      inserted: true,
      simulated: true,
    };
  }

  try {
    const WordApi = getWordGlobal();
    await WordApi.run(async (context) => {
      const selection = context.document.getSelection();
      const p = selection.insertParagraph(text, "After");
      p.styleBuiltIn =
        level === 1
          ? "Heading1"
          : level === 2
          ? "Heading2"
          : "Heading3";
      p.font.bold = true;
      p.spaceAfter = 6;
      await context.sync();
    });

    return { success: true, inserted: true, simulated: false };
  } catch (err: unknown) {
    return {
      success: false,
      inserted: false,
      simulated: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Inserts a structured 2-column or multi-column table into the active Word document.
 */
export async function insertWordTable(
  headers: string[],
  rows: string[][],
  title?: string
): Promise<WordInsertionResult> {
  if (!isWordHostAvailable()) {
    console.info(`[Word Add-in Simulation] Inserted Table "${title || "Tabelle"}":`, { headers, rows });
    return {
      success: true,
      inserted: true,
      simulated: true,
      message: `Vorschau-Modus: Tabelle „${title || "Tabelle"}“ wurde simuliert.`,
    };
  }

  try {
    const WordApi = getWordGlobal();
    await WordApi.run(async (context) => {
      const selection = context.document.getSelection();

      if (title) {
        const titlePara = selection.insertParagraph(title, "After");
        titlePara.styleBuiltIn = "Heading2";
        titlePara.spaceAfter = 6;
      }

      const tableData = [headers, ...rows];
      const table = selection.insertTable(
        tableData.length,
        headers.length,
        "After",
        tableData
      );

      // Header row styling
      const headerRow = table.rows.getFirst();
      headerRow.font.bold = true;
      headerRow.font.size = 10;

      table.styleBuiltIn = "TableGrid";
      table.alignment = "Left";

      await context.sync();
    });

    return {
      success: true,
      inserted: true,
      simulated: false,
      message: `Tabelle „${title || "Tabelle"}“ erfolgreich in Word eingefügt.`,
    };
  } catch (err: unknown) {
    return {
      success: false,
      inserted: false,
      simulated: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Inserts the complete Parties Section into the active Word document.
 */
export async function insertPartiesSection(
  parties: WordPartyItem[],
  caseNumber: string
): Promise<WordInsertionResult> {
  if (parties.length === 0) {
    return insertFieldAsContentControl(caseNumber, "parties", "Beteiligte", "Keine Beteiligten erfasst.");
  }

  const headers = ["Rolle", "Name / Firma", "Anschrift", "Steuer-ID / Geburtsdatum", "Familienstand"];
  const rows: string[][] = parties.map((p) => [
    p.role || "[Rolle offen]",
    p.name || "[Name offen]",
    p.address || "[Keine Anschrift]",
    [p.taxId ? `IdNr: ${p.taxId}` : "", p.birthDate ? `Geb.: ${p.birthDate}` : ""]
      .filter(Boolean)
      .join(" • ") || "[Nicht angegeben]",
    p.maritalStatus || "[Nicht angegeben]",
  ]);

  return insertWordTable(headers, rows, "Vertragsparteien & Beteiligte");
}

/**
 * Inserts the Property / Real Estate Details section as a formatted table.
 */
export async function insertPropertySection(
  property: WordPropertyDetails,
  caseNumber: string
): Promise<WordInsertionResult> {
  const headers = ["Grundbuchmerkmal", "Angabe / Nachweis"];
  const rows: string[][] = [
    ["Gemarkung", property.district || "[Nicht angegeben]"],
    ["Grundbuchblatt", property.sheetNumber || "[Nicht angegeben]"],
    ["Flurstück / Flurnummer", property.parcelNumber || "[Nicht angegeben]"],
    ["Fläche (Grundstücksgröße)", property.areaSqm || "[Nicht angegeben]"],
    ["Wirtschaftsart / Nutzungsart", property.economicUse || "[Nicht angegeben]"],
  ];

  return insertWordTable(headers, rows, `Grundbuch- & Grundstücksdaten (Urk.-Nr. ${caseNumber})`);
}

/**
 * Inserts the Financials / Purchase Price section into Word.
 */
export async function insertFinancialsSection(
  financials: WordFinancialDetails,
  caseNumber: string
): Promise<WordInsertionResult> {
  const headers = ["Finanzielle Vertragsbedingung", "Vereinbarter Wert"];
  const rows: string[][] = [
    ["Kaufpreis / Geschäftswert", financials.dealValue || "[Nicht vereinbart]"],
    ["Zahlungsfälligkeit", financials.dueDate || "[Noch nicht terminiert]"],
    ["Belastungen & Lastenfreistellung", financials.encumbrances || "[Keine Belastungen erfasst]"],
  ];

  return insertWordTable(headers, rows, `Kaufpreis & Zahlungsmodalitäten (Urk.-Nr. ${caseNumber})`);
}

/**
 * Inserts the Notarial Case Summary Header into Word.
 */
export async function insertCaseSummaryHeader(
  meta: WordCaseMetadata
): Promise<WordInsertionResult> {
  const headers = ["Notarieller Vorgang", "Verfahrensdaten"];
  const rows: string[][] = [
    ["Urkunden-Nummer / AZ", meta.caseNumber],
    ["Vorgangsbezeichnung", meta.title],
    ["Rechtsgebiet / Urkundenart", meta.matterTypeLabel],
    ["Bearbeitungsstatus", meta.statusLabel],
    ["Zuständiger Notar", meta.notaryName],
    ["Sachbearbeitung", meta.assignedClerk],
    ["Beurkundungstermin", meta.targetDate || "Noch nicht terminiert"],
  ];

  return insertWordTable(headers, rows, `Notarieller Aktenauszug: ${meta.caseNumber}`);
}
