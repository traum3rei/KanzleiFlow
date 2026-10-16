/**
 * Clause Definitions for German Real Estate Purchase Agreement (Immobilienkaufvertrag v1.0.0).
 * Standardized clause catalog with dependencies, incompatibilities, and non-authoritative drafting templates.
 */

import { ClauseMetadata } from "./types";

export const REAL_ESTATE_TEMPLATE_SLUG = "immobilienkaufvertrag";
export const REAL_ESTATE_TEMPLATE_NAME = "Immobilienkaufvertrag (Grundstück/Wohnung)";
export const REAL_ESTATE_TEMPLATE_VERSION = "1.0.0";

export const REAL_ESTATE_CLAUSES: ClauseMetadata[] = [
  {
    code: "CLAUSE_PREAMBLE",
    title: "Abschnitt 1 Verhandlung & Beteiligte",
    category: "PARTIES",
    description: "Ungeprüftes Textbeispiel. Feststellung der Identität und Erscheinen der Urkundsparteien durch den Notar.",
    isDefault: true,
    sortOrder: 10,
    bodyTemplate:
      "Vor dem unterzeichnenden Notar erschienen am heutigen Tage die in der Urkunde näher bezeichneten Parteien " +
      "(nachfolgend Verkäufer und Käufer genannt). Die Beteiligten handeln im eigenen Namen bzw. durch ausgewiesene Bevollmächtigte.",
  },
  {
    code: "CLAUSE_PROPERTY",
    title: "Abschnitt 2 Kaufgegenstand & Grundbuchstand",
    category: "PROPERTY",
    description: "Ungeprüftes Textbeispiel. Genaue Bezeichnung des Grundstücks bzw. Sondereigentums nach Grundbuch, Gemarkung und Flurstück.",
    isDefault: true,
    sortOrder: 20,
    requiredFields: ["property.landRegistryDistrict", "property.sheetNumber", "property.parcelNumber", "property.streetAddress"],
    bodyTemplate:
      "Der Verkäufer ist im Grundbuch von {{property.landRegistryDistrict}}, Blatt {{property.sheetNumber}}, " +
      "eingetragener Eigentümer des Grundstücks der Gemarkung {{property.cadastralDistrict}}, Flurstück {{property.parcelNumber}}, " +
      "Lage: {{property.streetAddress}}. Der Verkäufer verkauft diesen Grundbesitz mit allen wesentlichen Bestandteilen an den dies annehmenden Käufer.",
  },
  {
    code: "CLAUSE_PRICE_DUE",
    title: "Abschnitt 3 Kaufpreis & Fälligkeitsvoraussetzungen",
    category: "PRICE",
    description: "Ungeprüftes Textbeispiel. Festlegung des Kaufpreises, Fälligkeitsmitteilung des Notars und Direktzahlung an den Verkäufer.",
    isDefault: true,
    sortOrder: 30,
    requiredFields: ["purchasePrice.amount", "purchasePrice.currency"],
    bodyTemplate:
      "Der Kaufpreis beträgt {{purchasePrice.amountFormatted}} {{purchasePrice.currency}}. " +
      "Der Kaufpreis ist fällig innerhalb von 14 Tagen, nachdem der Notar beiden Parteien schriftlich bestätigt hat, " +
      "dass die Vormerkung zugunsten des Käufers im Grundbuch eingetragen ist, alle erforderlichen Löschungsunterlagen vorliegen " +
      "und gesetzliche Vorkaufsrechte nicht ausgeübt werden. Die Zahlung erfolgt auf das angegebene Konto des Verkäufers.",
  },
  {
    code: "CLAUSE_ESCROW_ACCOUNT",
    title: "Abschnitt 3a Abwicklung über Notaranderkonto",
    category: "PRICE",
    description: "Ungeprüftes Textbeispiel. Besondere Abwicklung über ein Notaranderkonto als illustratives Beispiel.",
    isDefault: false,
    sortOrder: 35,
    dependencies: ["CLAUSE_PRICE_DUE"],
    requiredFields: ["purchasePrice.escrowReason"],
    bodyTemplate:
      "Die Kaufpreiszahlung erfolgt abweichend über ein vom Notar einzurichtendes Notaranderkonto. " +
      "Als berechtigtes Sicherungsinteresse im illustrativen Demo-Text wird festgehalten: {{purchasePrice.escrowReason}}. " +
      "Der Notar wird angewiesen, den Hinterlegungsbetrag nach Vorliegen der vereinbarten Auszahlungsreife an den Verkäufer weiterzuleiten.",
  },
  {
    code: "CLAUSE_MORTGAGE_CLEARANCE",
    title: "Abschnitt 4 Lastenfreistellung (Abt. II und III)",
    category: "CLEARANCE",
    description: "Ungeprüftes Textbeispiel. Verpflichtung des Verkäufers zur lastenfreien Übergabe und Ablösung nicht übernommener Belastungen.",
    isDefault: true,
    sortOrder: 40,
    dependencies: ["CLAUSE_PROPERTY"],
    bodyTemplate:
      "Der Grundbesitz wird frei von nicht ausdrücklich übernommenen Belastungen in Abteilung II und III des Grundbuchs übertragen. " +
      "Der Verkäufer verpflichtet sich, alle eingetragenen Grundpfandrechte unverzüglich auf eigene Kosten zur Löschung zu bringen. " +
      "Soweit Gläubiger Ablösebeträge anfordern, ist der Käufer berechtigt und angewiesen, den Kaufpreis vorrangig zur Ablösung einzusetzen.",
  },
  {
    code: "CLAUSE_POSSESSION",
    title: "Abschnitt 5 Besitz-, Nutzen- und Lastenübergang",
    category: "POSSESSION",
    description: "Ungeprüftes Textbeispiel. Zeitpunkt des Übergangs von Besitz, Nutzungen, Gefahren und öffentlichen Abgaben auf den Käufer.",
    isDefault: true,
    sortOrder: 50,
    dependencies: ["CLAUSE_PRICE_DUE"],
    bodyTemplate:
      "Der Besitz, die Nutzungen, die Gefahr des zufälligen Untergangs und die Lasten des Vertragsobjekts gehen mit dem Tag der vollständigen " +
      "Zahlung des Kaufpreises (Besitzübergangsstichtag: {{terms.possessionTransferDateFormatted}}) auf den Käufer über. " +
      "Ab diesem Tag trägt der Käufer alle laufenden öffentlichen und privaten Abgaben.",
  },
  {
    code: "CLAUSE_DEFECT_EXCLUSION",
    title: "Abschnitt 6 Haftungsausschluss für Sach- und Rechtsmängel",
    category: "WARRANTY",
    description: "Ungeprüftes Textbeispiel. Umfassender Ausschluss der Sachmängelhaftung für Bestandsbauten (gekauft wie besichtigt, ohne Arglist).",
    isDefault: true,
    sortOrder: 60,
    incompatibilities: ["CLAUSE_NEW_BUILD_WARRANTY"],
    bodyTemplate:
      "Der Grundbesitz wird in dem gegenwärtigen, gebrauchten Zustand verkauft, wie er vom Käufer besichtigt worden ist. " +
      "Ansprüche und Rechte des Käufers wegen Sachmängeln des Grundstücks und der aufstehenden Gebäude werden ausgeschlossen. " +
      "Dieser Haftungsausschluss gilt nicht bei Vorsatz oder arglistigem Verschweigen von Mängeln durch den Verkäufer sowie bei Verletzung von Leben, Körper und Gesundheit.",
  },
  {
    code: "CLAUSE_NEW_BUILD_WARRANTY",
    title: "Abschnitt 6b Gesetzliche Gewährleistung bei Neubau / Sanierung",
    category: "WARRANTY",
    description: "Ungeprüftes Textbeispiel. Ungeprüftes Textbeispiel zur Gewährleistung für neue oder sanierte Objekte; keine Aussage zu gesetzlichen Fristen.",
    isDefault: false,
    sortOrder: 65,
    incompatibilities: ["CLAUSE_DEFECT_EXCLUSION"],
    bodyTemplate:
      "Für die neu errichteten bzw. sanierten Bauwerke übernimmt der Verkäufer die gesetzliche Gewährleistung nach Werkvertragsrecht (ungeprüftes Textbeispiel). " +
      "Die Verjährungsfrist für Mängelansprüche beträgt fünf Jahre ab förmlicher Abnahme des Bauwerks. " +
      "Der Verkäufer tritt hiermit vorleistungshalber alle Gewährleistungsansprüche gegen beteiligte Handwerker und Sonderfachleute an den Käufer ab.",
  },
  {
    code: "CLAUSE_TENANCY",
    title: "Abschnitt 7 Fortbestehende Mietverhältnisse",
    category: "TENANCY",
    description: "Ungeprüftes Textbeispiel. Ungeprüftes Beispiel zu Mietverhältnissen, Kaution und Abrechnung.",
    isDefault: false,
    sortOrder: 70,
    dependencies: ["CLAUSE_POSSESSION"],
    requiredFields: ["terms.tenancyDetails"],
    bodyTemplate:
      "Das Vertragsobjekt ist ganz oder teilweise vermietet (Status: {{terms.tenancyStatusText}}). " +
      "Der Käufer tritt mit dem Tag des Besitzübergangs kraft Gesetzes im illustrativen Demo-Text in die bestehenden Mietverhältnisse ein. " +
      "Bestehende Mietkautionen werden zum Übergangsstichtag an den Käufer übertragen: {{terms.tenancyDetails}}.",
  },
  {
    code: "CLAUSE_FINANCING_CONTINGENCY",
    title: "Abschnitt 8 Finanzierungsvorbehalt des Käufers",
    category: "FINANCING",
    description: "Ungeprüftes Textbeispiel. Rücktrittsrecht des Käufers, falls keine verbindliche Kreditzusage bis zu einer vereinbarten Frist vorliegt.",
    isDefault: false,
    sortOrder: 80,
    dependencies: ["CLAUSE_PRICE_DUE"],
    requiredFields: ["purchasePrice.financingAmount"],
    bodyTemplate:
      "Der Käufer beabsichtigt, den Kaufpreis in Höhe von {{purchasePrice.financingAmountFormatted}} EUR durch ein Bankdarlehen zu finanzieren. " +
      "Erhält der Käufer trotz nachweisbar rechtzeitiger Antragstellung bis zum vereinbarten Stichtag keine verbindliche Finanzierungszusage, " +
      "ist er berechtigt, durch schriftliche Erklärung gegenüber dem Notar vom Vertrag zurückzutreten.",
  },
  {
    code: "CLAUSE_FINANCING_COOPERATION",
    title: "Abschnitt 8b Belastungsvollmacht zur Kaufpreisfinanzierung",
    category: "FINANCING",
    description: "Ungeprüftes Textbeispiel. Mitwirkung des Verkäufers bei der Bestellung von Grundpfandrechten vor Eigentumsumschreibung zugunsten der Käuferbank.",
    isDefault: true,
    sortOrder: 85,
    dependencies: ["CLAUSE_PRICE_DUE"],
    bodyTemplate:
      "Der Verkäufer verpflichtet sich, an der Bestellung von Grundschulden zur Finanzierung des Kaufpreises vor Eigentumsumschreibung mitzuwirken. " +
      "Der Verkäufer bevollmächtigt den Käufer, den Kaufgegenstand bereits vor Umschreibung mit Grundpfandrechten bis zur Höhe des Kaufpreises zu belasten. " +
      "Die Gläubigerbank darf die Grundschuld nur insoweit als Sicherheit verwerten, als der Darlehensbetrag tatsächlich zur Kaufpreiszahlung an den Verkäufer geflossen ist.",
  },
  {
    code: "CLAUSE_ENFORCEMENT",
    title: "Abschnitt 9 Vollstreckungsunterwerfung",
    category: "ENFORCEMENT",
    description: "Ungeprüftes Textbeispiel. Ungeprüftes Textbeispiel einer Vollstreckungsklausel. Keine Bestätigung von Wirksamkeit oder Vollstreckbarkeit.",
    isDefault: true,
    sortOrder: 90,
    dependencies: ["CLAUSE_PRICE_DUE"],
    bodyTemplate:
      "Wegen aller in dieser Urkunde eingegangenen Zahlungsverpflichtungen unterwirft sich der Käufer der sofortigen Zwangsvollstreckung aus dieser Urkunde " +
      "in sein gesamtes Vermögen (ungeprüftes Textbeispiel). Der Notar wird ermächtigt, dem Verkäufer vollstreckbare Ausfertigung zu erteilen, sobald die Fälligkeit eingetreten ist.",
  },
  {
    code: "CLAUSE_COSTS_TAXES",
    title: "Abschnitt 10 Kosten & Grunderwerbsteuer",
    category: "COSTS",
    description: "Ungeprüftes Textbeispiel. Regelung der Notar- und Grundbuchkosten sowie der Grunderwerbsteuer als Textbeispiel.",
    isDefault: true,
    sortOrder: 100,
    bodyTemplate:
      "Die Kosten dieser Beurkundung, des grundbuchamtlichen Vollzugs sowie die anfallende Grunderwerbsteuer trägt der Käufer. " +
      "Die Kosten der Lastenfreistellung nicht übernommener Belastungen trägt der Verkäufer.",
  },
  {
    code: "CLAUSE_POWER_OF_ATTORNEY",
    title: "Abschnitt 11 Vollmachten zur Grundbuchabwicklung",
    category: "MISC",
    description: "Ungeprüftes Textbeispiel. Umfassende Vollmacht für die Notariatsmitarbeiter zur Abgabe aller verfahrensrechtlichen Grundbucherklärungen.",
    isDefault: true,
    sortOrder: 110,
    bodyTemplate:
      "Die Beteiligten bevollmächtigen die Notarangestellten des amtierenden Notars, im illustrativen Demo-Text, " +
      "alle zur Durchführung dieses Vertrages etwa noch erforderlichen Erklärungen, Ergänzungen und Bewilligungen vor dem Notar abzugeben, " +
      "insbesondere die Eintragung der Auflassung und Grundbuchberichtigungen zu bewilligen und zu beantragen.",
  },
];
