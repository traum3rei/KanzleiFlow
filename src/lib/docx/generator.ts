import {
  Document,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  AlignmentType,
  WidthType,
  BorderStyle,
  ShadingType,
  Packer,
  Header,
  Footer,
  PageNumber,
} from "docx";
import { ExtractedLegalFields } from "@/lib/ai/schema";
import { TEMPLATE_VERSION, TEMPLATE_NAME } from "@/lib/templates/appointment-summary";

export interface DocxTemplateContext {
  caseNumber: string;
  caseTitle: string;
  notaryName?: string | null;
  assignedClerk?: string | null;
  reviewNotes?: string | null;
  version?: number;
}

/**
 * Deterministically formats currency in German standard (e.g. 1.850.000,00 EUR)
 */
function formatCurrency(amount: number | null | undefined, currency = "EUR"): string {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return "— [noch zu beziffern] —";
  }
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
  }).format(amount);
}

/**
 * Formats ISO date into German DD.MM.YYYY string
 */
function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "— [Datum offen] —";
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return String(isoDate);
    return d.toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return String(isoDate);
  }
}

const BORDER_COLOR = "CBD5E1"; // Slate 300
const TABLE_BORDER = {
  style: BorderStyle.SINGLE,
  size: 1,
  color: BORDER_COLOR,
};
const BORDERS_ALL = {
  top: TABLE_BORDER,
  bottom: TABLE_BORDER,
  left: TABLE_BORDER,
  right: TABLE_BORDER,
};

const CELL_MARGINS = { top: 120, bottom: 120, left: 160, right: 160 };

/**
 * Builds a professional, version-controlled German notarial DOCX document
 * deterministically from approved extraction data and case context.
 */
export async function generateDocxDraft(
  data: ExtractedLegalFields,
  context: DocxTemplateContext
): Promise<Buffer> {
  const versionNum = context.version ?? 1;
  const generatedAt = new Date().toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const todayGerman = new Date().toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const children: (Paragraph | Table)[] = [];

  // 1. Notariat Letterhead / Header Block
  children.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: "NOTARIAT DR. JOHANNES WEISS & PARTNER",
          bold: true,
          size: 19,
          color: "1E293B",
          font: "Arial",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 180 },
      children: [
        new TextRun({
          text: "Theatinerstraße 14 • 80333 München • Telefon (089) 210-450",
          size: 15,
          color: "64748B",
          font: "Arial",
        }),
      ],
    })
  );

  // 2. Main Title
  children.push(
    new Paragraph({
      text: "VORBEREITUNGSVERMERK ZUR BEURKUNDUNG",
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 120, after: 80 },
      children: [
        new TextRun({
          text: "VORBEREITUNGSVERMERK ZUR BEURKUNDUNG",
          bold: true,
          size: 28,
          color: "0F172A",
          font: "Arial",
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: `${TEMPLATE_NAME} • Template v${TEMPLATE_VERSION} • Entwurfsversion v${versionNum}`,
          size: 17,
          color: "475569",
          italics: true,
          font: "Arial",
        }),
      ],
    })
  );

  // 3. Disclaimer Banner Box (Single-cell table with border)
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE },
        bottom: { style: BorderStyle.NONE },
        right: { style: BorderStyle.NONE },
        left: { style: BorderStyle.SINGLE, size: 24, color: "D97706" }, // Amber thick border
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              margins: { top: 140, bottom: 140, left: 180, right: 180 },
              shading: { fill: "FFFBEB", type: ShadingType.CLEAR }, // Light amber
              children: [
                new Paragraph({
                  spacing: { after: 60 },
                  children: [
                    new TextRun({
                      text: "WICHTIGER HINWEIS / COMPLIANCE-DISCLAIMER (§ 17 BeurkG):",
                      bold: true,
                      size: 17,
                      color: "92400E",
                      font: "Arial",
                    }),
                  ],
                }),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: data.disclaimer || "SYNTHETISCHER DEMO-DATENSATZ. Keine Gewähr nach § 17 BeurkG.",
                      size: 16,
                      bold: true,
                      color: "78350F",
                      font: "Arial",
                    }),
                    new TextRun({
                      text: " — Dieser Vorbereitungsvermerk wurde aus verifizierten und menschlich freigegebenen Daten (Human-in-the-Loop) deterministisch erzeugt. Er stellt keine rechtsverbindliche notarielle Urkunde dar. Das Zustandekommen eines wirksamen Rechtsgeschäfts setzt die persönliche Beurkundung nach § 13 ff. BeurkG voraus.",
                      size: 16,
                      color: "92400E",
                      font: "Arial",
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    }),
    new Paragraph({ spacing: { after: 180 }, children: [] })
  );

  // 4. Procedural & Case Overview (Stammdaten Table)
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: BORDERS_ALL,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 25, type: WidthType.PERCENTAGE },
              shading: { fill: "F1F5F9", type: ShadingType.CLEAR },
              margins: CELL_MARGINS,
              children: [
                new Paragraph({
                  children: [new TextRun({ text: "Aktenzeichen", bold: true, size: 17, font: "Arial" })],
                }),
              ],
            }),
            new TableCell({
              width: { size: 25, type: WidthType.PERCENTAGE },
              margins: CELL_MARGINS,
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: context.caseNumber,
                      bold: true,
                      color: "312E81",
                      size: 17,
                      font: "Arial",
                    }),
                  ],
                }),
              ],
            }),
            new TableCell({
              width: { size: 25, type: WidthType.PERCENTAGE },
              shading: { fill: "F1F5F9", type: ShadingType.CLEAR },
              margins: CELL_MARGINS,
              children: [
                new Paragraph({
                  children: [new TextRun({ text: "Bezeichnung", bold: true, size: 17, font: "Arial" })],
                }),
              ],
            }),
            new TableCell({
              width: { size: 25, type: WidthType.PERCENTAGE },
              margins: CELL_MARGINS,
              children: [
                new Paragraph({
                  children: [new TextRun({ text: context.caseTitle, size: 17, font: "Arial" })],
                }),
              ],
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              shading: { fill: "F1F5F9", type: ShadingType.CLEAR },
              margins: CELL_MARGINS,
              children: [
                new Paragraph({
                  children: [new TextRun({ text: "Zuständiger Notar", bold: true, size: 17, font: "Arial" })],
                }),
              ],
            }),
            new TableCell({
              margins: CELL_MARGINS,
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: context.notaryName || "Dr. Johannes Weiss (Notar)",
                      size: 17,
                      font: "Arial",
                    }),
                  ],
                }),
              ],
            }),
            new TableCell({
              shading: { fill: "F1F5F9", type: ShadingType.CLEAR },
              margins: CELL_MARGINS,
              children: [
                new Paragraph({
                  children: [new TextRun({ text: "Sachbearbeitung", bold: true, size: 17, font: "Arial" })],
                }),
              ],
            }),
            new TableCell({
              margins: CELL_MARGINS,
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: context.assignedClerk || "Stefanie Bauer (Notarfachwirtin)",
                      size: 17,
                      font: "Arial",
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              shading: { fill: "F1F5F9", type: ShadingType.CLEAR },
              margins: CELL_MARGINS,
              children: [
                new Paragraph({
                  children: [new TextRun({ text: "Erstellt am", bold: true, size: 17, font: "Arial" })],
                }),
              ],
            }),
            new TableCell({
              margins: CELL_MARGINS,
              children: [
                new Paragraph({
                  children: [new TextRun({ text: `${generatedAt} Uhr`, size: 17, font: "Arial" })],
                }),
              ],
            }),
            new TableCell({
              shading: { fill: "F1F5F9", type: ShadingType.CLEAR },
              margins: CELL_MARGINS,
              children: [
                new Paragraph({
                  children: [new TextRun({ text: "Entwurfsversion", bold: true, size: 17, font: "Arial" })],
                }),
              ],
            }),
            new TableCell({
              margins: CELL_MARGINS,
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `v${versionNum} (Template v${TEMPLATE_VERSION})`,
                      bold: true,
                      size: 17,
                      font: "Arial",
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    }),
    new Paragraph({ spacing: { after: 200 }, children: [] })
  );

  // 5. Missing Fields / Alerts Section (if any missing fields or discrepancies)
  const missingItems = data.missingFields || [];
  const discrepancyItems = data.discrepancies || [];

  if (missingItems.length > 0 || discrepancyItems.length > 0) {
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.NONE },
          bottom: { style: BorderStyle.NONE },
          right: { style: BorderStyle.NONE },
          left: { style: BorderStyle.SINGLE, size: 24, color: "DC2626" },
        },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                margins: CELL_MARGINS,
                shading: { fill: "FEF2F2", type: ShadingType.CLEAR },
                children: [
                  new Paragraph({
                    spacing: { after: 60 },
                    children: [
                      new TextRun({
                        text: "KLÄRUNGSBEDARF & OFFENE PFLICHTANGABEN VOR TERMIN:",
                        bold: true,
                        size: 17,
                        color: "991B1B",
                        font: "Arial",
                      }),
                    ],
                  }),
                  ...missingItems.map(
                    (item) =>
                      new Paragraph({
                        spacing: { after: 40 },
                        children: [
                          new TextRun({ text: "• OFFEN: ", bold: true, color: "DC2626", size: 16, font: "Arial" }),
                          new TextRun({ text: item, color: "7F1D1D", size: 16, font: "Arial" }),
                        ],
                      })
                  ),
                  ...discrepancyItems.map(
                    (item) =>
                      new Paragraph({
                        spacing: { after: 40 },
                        children: [
                          new TextRun({ text: "• HINWEIS: ", bold: true, color: "D97706", size: 16, font: "Arial" }),
                          new TextRun({ text: item, color: "78350F", size: 16, font: "Arial" }),
                        ],
                      })
                  ),
                ],
              }),
            ],
          }),
        ],
      }),
      new Paragraph({ spacing: { after: 200 }, children: [] })
    );
  }

  // 6. § 1 Vertragsparteien & Beteiligte
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 180, after: 100 },
      children: [
        new TextRun({
          text: "§ 1 VERTRAGSVERTEILTE & BETEILIGTE",
          bold: true,
          size: 22,
          color: "1E293B",
          font: "Arial",
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: "Identitätsfeststellung nach GwG § 11 ff. sowie Legitimation gem. § 10 BeurkG:",
          italics: true,
          size: 16,
          color: "475569",
          font: "Arial",
        }),
      ],
    })
  );

  const partyRows: TableRow[] = [
    new TableRow({
      children: [
        new TableCell({
          width: { size: 20, type: WidthType.PERCENTAGE },
          shading: { fill: "F1F5F9", type: ShadingType.CLEAR },
          margins: CELL_MARGINS,
          children: [new Paragraph({ children: [new TextRun({ text: "Rolle", bold: true, size: 16, font: "Arial" })] })],
        }),
        new TableCell({
          width: { size: 25, type: WidthType.PERCENTAGE },
          shading: { fill: "F1F5F9", type: ShadingType.CLEAR },
          margins: CELL_MARGINS,
          children: [new Paragraph({ children: [new TextRun({ text: "Name / Firma", bold: true, size: 16, font: "Arial" })] })],
        }),
        new TableCell({
          width: { size: 25, type: WidthType.PERCENTAGE },
          shading: { fill: "F1F5F9", type: ShadingType.CLEAR },
          margins: CELL_MARGINS,
          children: [new Paragraph({ children: [new TextRun({ text: "Anschrift", bold: true, size: 16, font: "Arial" })] })],
        }),
        new TableCell({
          width: { size: 15, type: WidthType.PERCENTAGE },
          shading: { fill: "F1F5F9", type: ShadingType.CLEAR },
          margins: CELL_MARGINS,
          children: [new Paragraph({ children: [new TextRun({ text: "Geburtsdatum", bold: true, size: 16, font: "Arial" })] })],
        }),
        new TableCell({
          width: { size: 15, type: WidthType.PERCENTAGE },
          shading: { fill: "F1F5F9", type: ShadingType.CLEAR },
          margins: CELL_MARGINS,
          children: [new Paragraph({ children: [new TextRun({ text: "Steuer-ID", bold: true, size: 16, font: "Arial" })] })],
        }),
      ],
    }),
  ];

  if (data.parties && data.parties.length > 0) {
    for (const p of data.parties) {
      partyRows.push(
        new TableRow({
          children: [
            new TableCell({
              margins: CELL_MARGINS,
              children: [
                new Paragraph({
                  children: [new TextRun({ text: p.role, bold: true, color: "312E81", size: 16, font: "Arial" })],
                }),
              ],
            }),
            new TableCell({
              margins: CELL_MARGINS,
              children: [
                new Paragraph({
                  children: [new TextRun({ text: p.name, bold: true, size: 16, font: "Arial" })],
                }),
              ],
            }),
            new TableCell({
              margins: CELL_MARGINS,
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: p.address || "— [fehlt] —",
                      color: p.address ? "0F172A" : "94A3B8",
                      italics: !p.address,
                      size: 16,
                      font: "Arial",
                    }),
                  ],
                }),
              ],
            }),
            new TableCell({
              margins: CELL_MARGINS,
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: p.birthDate ? formatDate(p.birthDate) : "— [fehlt] —",
                      color: p.birthDate ? "0F172A" : "94A3B8",
                      italics: !p.birthDate,
                      size: 16,
                      font: "Arial",
                    }),
                  ],
                }),
              ],
            }),
            new TableCell({
              margins: CELL_MARGINS,
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: p.taxId || "— [nachzureichen] —",
                      color: p.taxId ? "0F172A" : "94A3B8",
                      italics: !p.taxId,
                      size: 16,
                      font: "Arial",
                    }),
                  ],
                }),
              ],
            }),
          ],
        })
      );
    }
  } else {
    partyRows.push(
      new TableRow({
        children: [
          new TableCell({
            margins: CELL_MARGINS,
            children: [
              new Paragraph({
                children: [new TextRun({ text: "Keine Beteiligten erfasst", italics: true, color: "94A3B8" })],
              }),
            ],
          }),
        ],
      })
    );
  }

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: BORDERS_ALL,
      rows: partyRows,
    }),
    new Paragraph({ spacing: { after: 200 }, children: [] })
  );

  // 7. § 2 Vertragsgegenstand & Grundbuchstand
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 180, after: 100 },
      children: [
        new TextRun({
          text: "§ 2 VERTRAGSGEGENSTAND & GRUNDBUCHSTAND",
          bold: true,
          size: 22,
          color: "1E293B",
          font: "Arial",
        }),
      ],
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: BORDERS_ALL,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 25, type: WidthType.PERCENTAGE },
              shading: { fill: "F1F5F9", type: ShadingType.CLEAR },
              margins: CELL_MARGINS,
              children: [new Paragraph({ children: [new TextRun({ text: "Gemarkung", bold: true, size: 16, font: "Arial" })] })],
            }),
            new TableCell({
              width: { size: 25, type: WidthType.PERCENTAGE },
              margins: CELL_MARGINS,
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: data.propertyDetails?.landRegistryDistrict || "— [fehlt] —",
                      size: 16,
                      italics: !data.propertyDetails?.landRegistryDistrict,
                      font: "Arial",
                    }),
                  ],
                }),
              ],
            }),
            new TableCell({
              width: { size: 25, type: WidthType.PERCENTAGE },
              shading: { fill: "F1F5F9", type: ShadingType.CLEAR },
              margins: CELL_MARGINS,
              children: [new Paragraph({ children: [new TextRun({ text: "Grundbuchblatt", bold: true, size: 16, font: "Arial" })] })],
            }),
            new TableCell({
              width: { size: 25, type: WidthType.PERCENTAGE },
              margins: CELL_MARGINS,
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: data.propertyDetails?.sheetNumber || "— [Abt. I noch beizuziehen] —",
                      size: 16,
                      italics: !data.propertyDetails?.sheetNumber,
                      font: "Arial",
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              shading: { fill: "F1F5F9", type: ShadingType.CLEAR },
              margins: CELL_MARGINS,
              children: [new Paragraph({ children: [new TextRun({ text: "Flurstück / Flurnr.", bold: true, size: 16, font: "Arial" })] })],
            }),
            new TableCell({
              margins: CELL_MARGINS,
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: data.propertyDetails?.parcelNumber || "— [offen] —",
                      size: 16,
                      italics: !data.propertyDetails?.parcelNumber,
                      font: "Arial",
                    }),
                  ],
                }),
              ],
            }),
            new TableCell({
              shading: { fill: "F1F5F9", type: ShadingType.CLEAR },
              margins: CELL_MARGINS,
              children: [new Paragraph({ children: [new TextRun({ text: "Grundstücksfläche", bold: true, size: 16, font: "Arial" })] })],
            }),
            new TableCell({
              margins: CELL_MARGINS,
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: data.propertyDetails?.areaSqm ? `${data.propertyDetails.areaSqm} m²` : "— [unbestimmt] —",
                      size: 16,
                      italics: !data.propertyDetails?.areaSqm,
                      font: "Arial",
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              shading: { fill: "F1F5F9", type: ShadingType.CLEAR },
              margins: CELL_MARGINS,
              children: [new Paragraph({ children: [new TextRun({ text: "Wirtschaftsart", bold: true, size: 16, font: "Arial" })] })],
            }),
            new TableCell({
              columnSpan: 3,
              margins: CELL_MARGINS,
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: String(data.propertyDetails?.economicUse || "Wohnbaufläche / Gebäude- und Freifläche"),
                      size: 16,
                      font: "Arial",
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    }),
    new Paragraph({ spacing: { after: 200 }, children: [] })
  );

  // 8. § 3 Gegenleistung & Finanzierungskonditionen
  const encumbrancesList = data.financials?.existingEncumbrances?.length
    ? data.financials.existingEncumbrances.join("; ")
    : "Keine eingetragenen Belastungen oder Vorlasten vermerkt.";

  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 180, after: 100 },
      children: [
        new TextRun({
          text: "§ 3 GEGENLEISTUNG & FINANZIERUNGSKONDITIONEN",
          bold: true,
          size: 22,
          color: "1E293B",
          font: "Arial",
        }),
      ],
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: BORDERS_ALL,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 30, type: WidthType.PERCENTAGE },
              shading: { fill: "F1F5F9", type: ShadingType.CLEAR },
              margins: CELL_MARGINS,
              children: [new Paragraph({ children: [new TextRun({ text: "Vereinbarter Kaufpreis", bold: true, size: 16, font: "Arial" })] })],
            }),
            new TableCell({
              margins: CELL_MARGINS,
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: formatCurrency(data.financials?.purchasePrice, data.financials?.currency),
                      bold: true,
                      color: "0F172A",
                      size: 17,
                      font: "Arial",
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              shading: { fill: "F1F5F9", type: ShadingType.CLEAR },
              margins: CELL_MARGINS,
              children: [new Paragraph({ children: [new TextRun({ text: "Zahlungsfälligkeit", bold: true, size: 16, font: "Arial" })] })],
            }),
            new TableCell({
              margins: CELL_MARGINS,
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: data.financials?.paymentDueDate
                        ? formatDate(data.financials.paymentDueDate)
                        : "14 Tage nach Vorliegen aller gesetzlichen und behördlichen Fälligkeitsvoraussetzungen",
                      size: 16,
                      font: "Arial",
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              shading: { fill: "F1F5F9", type: ShadingType.CLEAR },
              margins: CELL_MARGINS,
              children: [new Paragraph({ children: [new TextRun({ text: "Zahlungsweg", bold: true, size: 16, font: "Arial" })] })],
            }),
            new TableCell({
              margins: CELL_MARGINS,
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: "Überweisung auf Notaranderkonto / Direktzahlung an Verkäufer nach Fälligkeitsmitteilung (§ 54a BeurkG)",
                      size: 16,
                      font: "Arial",
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              shading: { fill: "F1F5F9", type: ShadingType.CLEAR },
              margins: CELL_MARGINS,
              children: [new Paragraph({ children: [new TextRun({ text: "Bestehende Belastungen (Abt. II & III)", bold: true, size: 16, font: "Arial" })] })],
            }),
            new TableCell({
              margins: CELL_MARGINS,
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: encumbrancesList,
                      size: 16,
                      font: "Arial",
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    }),
    new Paragraph({ spacing: { after: 200 }, children: [] })
  );

  // 9. § 4 Notarielle Vollzugshinweise & Gesetzliche Pflichtprüfungen
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 180, after: 100 },
      children: [
        new TextRun({
          text: "§ 4 NOTARIELLE WEGFÜHRUNG & VOLLZUGSHINWEISE",
          bold: true,
          size: 22,
          color: "1E293B",
          font: "Arial",
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 60 },
      children: [
        new TextRun({ text: "1. Identitätsnachweis: ", bold: true, size: 16, font: "Arial" }),
        new TextRun({
          text: "Alle Beteiligten haben sich bei der Beurkundung durch gültige amtliche Lichtbildausweise auszuweisen (GwG § 11 ff.).",
          size: 16,
          font: "Arial",
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 60 },
      children: [
        new TextRun({ text: "2. Steuer-Identifikationsnummer: ", bold: true, size: 16, font: "Arial" }),
        new TextRun({
          text: "Pflichtangabe zur Veräußerungsanzeige gem. § 18 GrEStG an das zuständige Finanzamt für Verkehrsteuern.",
          size: 16,
          font: "Arial",
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 60 },
      children: [
        new TextRun({ text: "3. Grundbuchsicherung: ", bold: true, size: 16, font: "Arial" }),
        new TextRun({
          text: "Zur Sicherung des Käufers ist unverzüglich die Eintragung einer Eigentumsvormerkung (Auflassungsvormerkung) im Grundbuch zu beantragen.",
          size: 16,
          font: "Arial",
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun({ text: "4. Lastenfreistellung: ", bold: true, size: 16, font: "Arial" }),
        new TextRun({
          text: "Löschungsunterlagen und Treuhandauflagen für nicht übernommene Grundpfandrechte sind vor Kaufpreisfälligkeit beizuziehen.",
          size: 16,
          font: "Arial",
        }),
      ],
    })
  );

  // 10. § 5 Freigabevermerk & Beurkundungsreife
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 180, after: 100 },
      children: [
        new TextRun({
          text: "§ 5 PRÜF- UND FREIGABEVERMERK",
          bold: true,
          size: 22,
          color: "1E293B",
          font: "Arial",
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 100 },
      children: [
        new TextRun({
          text: "Die vorstehenden Angaben wurden auf Grundlage der eingereichten Urkunden und Auskünfte durch die zuständige Sachbearbeitung geprüft und für die Terminsvorbereitung freigegeben.",
          size: 16,
          font: "Arial",
        }),
      ],
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: BORDERS_ALL,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 25, type: WidthType.PERCENTAGE },
              shading: { fill: "F1F5F9", type: ShadingType.CLEAR },
              margins: CELL_MARGINS,
              children: [new Paragraph({ children: [new TextRun({ text: "Prüfvermerk der Sachbearbeitung", bold: true, size: 16, font: "Arial" })] })],
            }),
            new TableCell({
              margins: CELL_MARGINS,
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: context.reviewNotes || "Ordnungsgemäß erfasst, abgeglichen und zur Terminsvorbereitung freigegeben.",
                      italics: !context.reviewNotes,
                      size: 16,
                      font: "Arial",
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    }),
    new Paragraph({ spacing: { after: 300 }, children: [] }),
    // Signature block
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE },
        bottom: { style: BorderStyle.NONE },
        left: { style: BorderStyle.NONE },
        right: { style: BorderStyle.NONE },
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: `München, den ${todayGerman}`, size: 16, font: "Arial" })],
                }),
                new Paragraph({ spacing: { before: 360 }, children: [new TextRun({ text: "____________________________________", color: "94A3B8" })] }),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `Sachbearbeitung: ${context.assignedClerk || "Stefanie Bauer"}`,
                      bold: true,
                      size: 16,
                      font: "Arial",
                    }),
                  ],
                }),
              ],
            }),
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: "Zur Beurkundung vorbereitet:", size: 16, font: "Arial" })],
                }),
                new Paragraph({ spacing: { before: 360 }, children: [new TextRun({ text: "____________________________________", color: "94A3B8" })] }),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `Zuständiger Notar: ${context.notaryName || "Dr. Johannes Weiss"}`,
                      bold: true,
                      size: 16,
                      font: "Arial",
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    })
  );

  // Construct Document
  const doc = new Document({
    creator: "KanzleiFlow Notariatssoftware",
    title: `Vorbereitungsvermerk_${context.caseNumber}_v${versionNum}`,
    description: `Deterministischer Notariatsentwurf zur Terminsvorbereitung (${TEMPLATE_NAME})`,
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440,    // 1 inch = 1440 dxa (approx 2.54 cm)
              bottom: 1440,
              left: 1440,
              right: 1440,
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: `KanzleiFlow • Notariat Dr. Johannes Weiss & Partner • Aktenzeichen: ${context.caseNumber}`,
                    size: 14,
                    color: "94A3B8",
                    font: "Arial",
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: `Demonstrationsentwurf (v${versionNum}) • Template v${TEMPLATE_VERSION} • Seite `,
                    size: 14,
                    color: "94A3B8",
                    font: "Arial",
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    size: 14,
                    color: "94A3B8",
                    font: "Arial",
                  }),
                  new TextRun({
                    text: " von ",
                    size: 14,
                    color: "94A3B8",
                    font: "Arial",
                  }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    size: 14,
                    color: "94A3B8",
                    font: "Arial",
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return await Packer.toBuffer(doc);
}
