/**
 * Deterministic DOCX Generator for Structured Document Configurator
 * Assembles a professional German Notarial Contract (Immobilienkaufvertrag) from validated configuration data.
 */

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
import { DocumentConfigurationData } from "./types";
import { REAL_ESTATE_CLAUSES, REAL_ESTATE_TEMPLATE_VERSION } from "./clauses";

const DISCLAIMER_TEXT =
  "DEMONSTRATIONS-ENTWURF — NICHT ZUR BEURKUNDUNG GEEIGNET (§ 17 BeurkG). " +
  "KanzleiFlow ist ein juristisches Assistenzsystem. Dieser Entwurf ersetzt keine notarielle Prüfung.";

const BORDER_COLOR = "CBD5E1";
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
const CELL_MARGINS = { top: 100, bottom: 100, left: 140, right: 140 };

function formatCurrency(amount: number | null | undefined, currency = "EUR"): string {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return "— [noch zu beziffern] —";
  }
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
  }).format(amount);
}

function formatDateGerman(isoDate: string | null | undefined): string {
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

/**
 * Generates a complete, deterministic DOCX Buffer for the configured real estate purchase agreement.
 */
export async function generateConfiguredDocx(
  data: DocumentConfigurationData,
  metadata: {
    caseNumber: string;
    version: number;
    templateVersion?: string;
  }
): Promise<Buffer> {
  const versionNum = metadata.version || 1;
  const templateVer = metadata.templateVersion || REAL_ESTATE_TEMPLATE_VERSION;
  const generatedDate = new Date().toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const children: (Paragraph | Table)[] = [];

  // Header Banner / Notary Office
  children.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: data.notaryOfficeName || "Notariat am Amtssitz",
          font: "Geist Mono",
          size: 18,
          color: "64748B",
        }),
      ],
    })
  );

  // Red/Dark Disclaimer Callout Box
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: BORDERS_ALL,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              shading: { type: ShadingType.CLEAR, fill: "F8FAFC" },
              margins: CELL_MARGINS,
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: "HINWEIS GEMÄSS § 17 BEURKG (DEMONSTRATIONS-MUSTER):",
                      bold: true,
                      size: 16,
                      color: "B91C1C",
                      font: "Geist Mono",
                    }),
                  ],
                }),
                new Paragraph({
                  spacing: { before: 60 },
                  children: [
                    new TextRun({
                      text: DISCLAIMER_TEXT,
                      size: 16,
                      color: "475569",
                      font: "Geist Mono",
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

  children.push(new Paragraph({ spacing: { after: 240 } }));

  // Deed Title
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: "IMMOBILIENKAUFVERTRAG",
          bold: true,
          size: 36,
          font: "Geist Mono",
          color: "0F172A",
        }),
      ],
    })
  );

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 360 },
      children: [
        new TextRun({
          text: `Aktenzeichen: ${metadata.caseNumber}  •  Entwurfsversion: v${versionNum}  •  Vorlagenversion: v${templateVer}`,
          size: 18,
          color: "64748B",
          font: "Geist Mono",
        }),
      ],
    })
  );

  // SECTION 1: Beteiligte (Parties Table)
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 200, after: 120 },
      children: [
        new TextRun({
          text: "§ 1 Beteiligte der Urkunde",
          bold: true,
          size: 24,
          font: "Geist Mono",
          color: "0F172A",
        }),
      ],
    })
  );

  const partyRows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      children: [
        new TableCell({
          shading: { type: ShadingType.CLEAR, fill: "F1F5F9" },
          margins: CELL_MARGINS,
          width: { size: 25, type: WidthType.PERCENTAGE },
          children: [
            new Paragraph({
              children: [new TextRun({ text: "Rolle", bold: true, size: 18, font: "Geist Mono" })],
            }),
          ],
        }),
        new TableCell({
          shading: { type: ShadingType.CLEAR, fill: "F1F5F9" },
          margins: CELL_MARGINS,
          width: { size: 40, type: WidthType.PERCENTAGE },
          children: [
            new Paragraph({
              children: [new TextRun({ text: "Name & Anschrift", bold: true, size: 18, font: "Geist Mono" })],
            }),
          ],
        }),
        new TableCell({
          shading: { type: ShadingType.CLEAR, fill: "F1F5F9" },
          margins: CELL_MARGINS,
          width: { size: 35, type: WidthType.PERCENTAGE },
          children: [
            new Paragraph({
              children: [new TextRun({ text: "Geburtsdaten / Steuer-ID", bold: true, size: 18, font: "Geist Mono" })],
            }),
          ],
        }),
      ],
    }),
  ];

  data.parties.forEach((p) => {
    partyRows.push(
      new TableRow({
        children: [
          new TableCell({
            margins: CELL_MARGINS,
            children: [
              new Paragraph({
                children: [new TextRun({ text: p.role, bold: true, size: 18, font: "Geist Mono" })],
              }),
            ],
          }),
          new TableCell({
            margins: CELL_MARGINS,
            children: [
              new Paragraph({
                children: [new TextRun({ text: p.name, bold: true, size: 18, font: "Geist Mono" })],
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: `${p.address}${p.postalCode ? `, ${p.postalCode}` : ""}${p.city ? ` ${p.city}` : ""}`,
                    size: 16,
                    color: "475569",
                    font: "Geist Mono",
                  }),
                ],
              }),
              p.representativeName
                ? new Paragraph({
                    children: [
                      new TextRun({
                        text: `Vertreten durch: ${p.representativeName}`,
                        size: 16,
                        italics: true,
                        font: "Geist Mono",
                      }),
                    ],
                  })
                : new Paragraph({ children: [] }),
            ],
          }),
          new TableCell({
            margins: CELL_MARGINS,
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: `Geboren: ${formatDateGerman(p.birthDate)}${p.birthPlace ? ` in ${p.birthPlace}` : ""}`,
                    size: 16,
                    font: "Geist Mono",
                  }),
                ],
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: `IdNr: ${p.taxId || "— [fehlt] —"}`,
                    size: 16,
                    color: p.taxId ? "334155" : "DC2626",
                    font: "Geist Mono",
                  }),
                ],
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: `Familienstand: ${p.maritalStatus || "unbekannt"}`,
                    size: 16,
                    font: "Geist Mono",
                  }),
                ],
              }),
            ],
          }),
        ],
      })
    );
  });

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: BORDERS_ALL,
      rows: partyRows,
    })
  );

  children.push(new Paragraph({ spacing: { after: 200 } }));

  // SECTION 2: Kaufgegenstand (Property Table)
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 200, after: 120 },
      children: [
        new TextRun({
          text: "§ 2 Kaufgegenstand & Grundbuchbeschrieb",
          bold: true,
          size: 24,
          font: "Geist Mono",
          color: "0F172A",
        }),
      ],
    })
  );

  const prop = data.property;
  const propRows = [
    ["Grundbuchbezirk:", prop.landRegistryDistrict || "— [fehlt] —"],
    ["Grundbuchblatt:", prop.sheetNumber || "— [fehlt] —"],
    ["Gemarkung:", prop.cadastralDistrict || "— [fehlt] —"],
    ["Flurstück:", prop.parcelNumber || "— [fehlt] —"],
    ["Lagebezeichnung / Adresse:", prop.streetAddress || "— [fehlt] —"],
    ["Grundstücksgröße:", prop.plotAreaSqm ? `${prop.plotAreaSqm.toLocaleString("de-DE")} m²` : "— [nicht beziffert] —"],
    ["Wirtschaftsart / Nutzung:", prop.economicUse || "Wohnbaufläche"],
    [
      "Bestehende Belastungen (Abt. II):",
      prop.existingEncumbrancesAbt2 && prop.existingEncumbrancesAbt2.length > 0
        ? prop.existingEncumbrancesAbt2.join("; ")
        : "Keine Vorlasten in Abteilung II",
    ],
    [
      "Bestehende Belastungen (Abt. III):",
      prop.existingEncumbrancesAbt3 && prop.existingEncumbrancesAbt3.length > 0
        ? prop.existingEncumbrancesAbt3.join("; ")
        : "Keine Vorlasten in Abteilung III",
    ],
  ];

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: BORDERS_ALL,
      rows: propRows.map(
        ([label, val]) =>
          new TableRow({
            children: [
              new TableCell({
                width: { size: 35, type: WidthType.PERCENTAGE },
                margins: CELL_MARGINS,
                shading: { type: ShadingType.CLEAR, fill: "F8FAFC" },
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: label, bold: true, size: 18, font: "Geist Mono" })],
                  }),
                ],
              }),
              new TableCell({
                width: { size: 65, type: WidthType.PERCENTAGE },
                margins: CELL_MARGINS,
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: val, size: 18, font: "Geist Mono" })],
                  }),
                ],
              }),
            ],
          })
      ),
    })
  );

  children.push(new Paragraph({ spacing: { after: 200 } }));

  // SECTION 3: Kaufpreis (Purchase Price)
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 200, after: 120 },
      children: [
        new TextRun({
          text: "§ 3 Kaufpreis & Zahlungsmodalitäten",
          bold: true,
          size: 24,
          font: "Geist Mono",
          color: "0F172A",
        }),
      ],
    })
  );

  const price = data.purchasePrice;
  const priceRows = [
    ["Gesamtkaufpreis:", formatCurrency(price.amount, price.currency)],
    ["Fälligkeitstermin:", formatDateGerman(price.paymentDueDate)],
    ["Abwicklungsart:", price.useEscrowAccount ? "Notaranderkonto gem. § 54a BeurkG" : "Direktzahlung an Verkäufer"],
    ["Fälligkeitsvoraussetzungen:", price.paymentConditionsDescription || "Standardmäßige Fälligkeitsmitteilung durch den Notar."],
    [
      "Zahlungsempfänger / IBAN:",
      price.sellerBankDetails?.iban
        ? `${price.sellerBankDetails.accountHolder || "Verkäufer"} • IBAN: ${price.sellerBankDetails.iban} (${price.sellerBankDetails.bankName || ""})`
        : "— [Bankverbindung vor Fälligkeit mitzuteilen] —",
    ],
    ["Käuferfinanzierung:", price.financingRequired ? `Ja (${formatCurrency(price.financingAmount)})` : "Nein (Eigenmittel)"],
  ];

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: BORDERS_ALL,
      rows: priceRows.map(
        ([label, val]) =>
          new TableRow({
            children: [
              new TableCell({
                width: { size: 35, type: WidthType.PERCENTAGE },
                margins: CELL_MARGINS,
                shading: { type: ShadingType.CLEAR, fill: "F8FAFC" },
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: label, bold: true, size: 18, font: "Geist Mono" })],
                  }),
                ],
              }),
              new TableCell({
                width: { size: 65, type: WidthType.PERCENTAGE },
                margins: CELL_MARGINS,
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: val, size: 18, font: "Geist Mono" })],
                  }),
                ],
              }),
            ],
          })
      ),
    })
  );

  children.push(new Paragraph({ spacing: { after: 200 } }));

  // SECTION 4: Ausgewählte Klauseln & Regelungen
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 200, after: 120 },
      children: [
        new TextRun({
          text: "§ 4 Vereinbarte Vertragsbestimmungen",
          bold: true,
          size: 24,
          font: "Geist Mono",
          color: "0F172A",
        }),
      ],
    })
  );

  const selectedSet = new Set(data.selectedClauseCodes);
  const activeClauses = REAL_ESTATE_CLAUSES.filter((c) => selectedSet.has(c.code)).sort(
    (a, b) => a.sortOrder - b.sortOrder
  );

  activeClauses.forEach((clause) => {
    // Check if custom override exists
    const customText = data.customClauseOverrides?.[clause.code];
    let body = customText || clause.bodyTemplate;

    // Replace dynamic placeholders deterministically
    body = body
      .replace(/{{property\.landRegistryDistrict}}/g, prop.landRegistryDistrict || "[Grundbuchbezirk]")
      .replace(/{{property\.sheetNumber}}/g, prop.sheetNumber || "[Blatt]")
      .replace(/{{property\.cadastralDistrict}}/g, prop.cadastralDistrict || "[Gemarkung]")
      .replace(/{{property\.parcelNumber}}/g, prop.parcelNumber || "[Flurstück]")
      .replace(/{{property\.streetAddress}}/g, prop.streetAddress || "[Adresse]")
      .replace(/{{purchasePrice\.amountFormatted}}/g, formatCurrency(price.amount, price.currency))
      .replace(/{{purchasePrice\.currency}}/g, price.currency)
      .replace(/{{purchasePrice\.escrowReason}}/g, price.escrowReason || "[Berechtigtes Sicherungsinteresse gem. § 54a BeurkG]")
      .replace(/{{purchasePrice\.financingAmountFormatted}}/g, formatCurrency(price.financingAmount))
      .replace(/{{terms\.possessionTransferDateFormatted}}/g, formatDateGerman(data.terms?.possessionTransferDate))
      .replace(/{{terms\.tenancyStatusText}}/g, data.terms?.tenancyStatus === "rented" ? "Vollvermietet" : data.terms?.tenancyStatus === "partially_rented" ? "Teilweise vermietet" : "Bezugsfrei")
      .replace(/{{terms\.tenancyDetails}}/g, data.terms?.tenancyDetails || "Mietverträge und Kautionen gem. Anlagen");

    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_3,
        spacing: { before: 180, after: 60 },
        children: [
          new TextRun({
            text: clause.title,
            bold: true,
            size: 20,
            font: "Geist Mono",
            color: "0F172A",
          }),
        ],
      })
    );

    children.push(
      new Paragraph({
        spacing: { after: 140 },
        children: [
          new TextRun({
            text: body,
            size: 18,
            font: "Geist Mono",
            color: "334155",
          }),
        ],
      })
    );
  });

  // SIGNATURE BLOCK
  children.push(new Paragraph({ spacing: { before: 400, after: 120 } }));
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Vorgelesen, genehmigt und eigenhändig unterschrieben am ${generatedDate}:`,
          italics: true,
          size: 18,
          font: "Geist Mono",
        }),
      ],
    })
  );

  children.push(new Paragraph({ spacing: { before: 360 } }));

  // Signature lines table
  children.push(
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
              width: { size: 45, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: "____________________________________", font: "Geist Mono" })],
                }),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: "Verkäufer (Dr. Barbara Lindner)",
                      bold: true,
                      size: 16,
                      font: "Geist Mono",
                    }),
                  ],
                }),
              ],
            }),
            new TableCell({
              width: { size: 10, type: WidthType.PERCENTAGE },
              children: [new Paragraph({ children: [] })],
            }),
            new TableCell({
              width: { size: 45, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: "____________________________________", font: "Geist Mono" })],
                }),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: "Käufer (Maximilian Huber)",
                      bold: true,
                      size: 16,
                      font: "Geist Mono",
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
              width: { size: 45, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({ spacing: { before: 300 } }),
                new Paragraph({
                  children: [new TextRun({ text: "____________________________________", font: "Geist Mono" })],
                }),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: "Notar (Unterschrift & Dienstsiegel)",
                      bold: true,
                      size: 16,
                      font: "Geist Mono",
                    }),
                  ],
                }),
              ],
            }),
            new TableCell({
              width: { size: 10, type: WidthType.PERCENTAGE },
              children: [new Paragraph({ children: [] })],
            }),
            new TableCell({
              width: { size: 45, type: WidthType.PERCENTAGE },
              children: [new Paragraph({ children: [] })],
            }),
          ],
        }),
      ],
    })
  );

  const doc = new Document({
    sections: [
      {
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: `DEMO-KAUFVERTRAG • ${metadata.caseNumber} • v${versionNum}`,
                    size: 14,
                    color: "94A3B8",
                    font: "Geist Mono",
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
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: "Seite ",
                    size: 14,
                    font: "Geist Mono",
                    color: "94A3B8",
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    size: 14,
                    font: "Geist Mono",
                    color: "94A3B8",
                  }),
                  new TextRun({
                    text: " von ",
                    size: 14,
                    font: "Geist Mono",
                    color: "94A3B8",
                  }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    size: 14,
                    font: "Geist Mono",
                    color: "94A3B8",
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
