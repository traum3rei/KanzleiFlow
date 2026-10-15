import { z } from "zod";

export const MatterTypeEnum = z.enum([
  "REAL_ESTATE",
  "INHERITANCE",
  "CORPORATE",
  "POWER_OF_ATTORNEY",
  "MARRIAGE_FAMILY",
  "OTHER",
]);
export type MatterType = z.infer<typeof MatterTypeEnum>;

export const CaseStatusEnum = z.enum([
  "DRAFT",
  "IN_REVIEW",
  "READY_FOR_NOTARIZATION",
  "NOTARIZED",
  "COMPLETED",
  "ARCHIVED",
]);
export type CaseStatus = z.infer<typeof CaseStatusEnum>;

export const PartySchema = z.object({
  role: z.string().min(2, "Rolle muss mindestens 2 Zeichen lang sein"),
  name: z.string().min(2, "Name muss mindestens 2 Zeichen lang sein"),
  address: z.string().optional(),
  birthDate: z.string().optional(),
  taxId: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  maritalStatus: z.string().optional(),
  nationality: z.string().optional(),
});
export type Party = z.infer<typeof PartySchema>;

export const PropertyDetailsInputSchema = z.object({
  landRegistryDistrict: z.string().optional(), // Gemarkung
  sheetNumber: z.string().optional(),          // Grundbuchblatt
  parcelNumber: z.string().optional(),         // Flurstück / Flurnummer
  areaSqm: z.number().nullable().optional(),   // Fläche in m²
  economicUse: z.string().optional(),          // Wirtschaftsart / Nutzungsart
});
export type PropertyDetailsInput = z.infer<typeof PropertyDetailsInputSchema>;

export const FinancialDetailsInputSchema = z.object({
  dealValue: z.number().nullable().optional(), // Kaufpreis / Geschäftswert in EUR
  currency: z.string().default("EUR"),
  paymentDueDate: z.string().optional(),       // Zahlungsfälligkeit
  existingEncumbrances: z.string().optional(), // Belastungen Abt. II / Abt. III
});
export type FinancialDetailsInput = z.infer<typeof FinancialDetailsInputSchema>;

export const SpecialDetailsInputSchema = z.object({
  commercialRegister: z.string().optional(),   // Handelsregisternummer (z. B. HRB 12345)
  registerCourt: z.string().optional(),        // Registergericht (z. B. Amtsgericht München)
  shareCapital: z.number().nullable().optional(), // Stammkapital in EUR
  deceasedDate: z.string().optional(),         // Sterbedatum des Erblassers
});
export type SpecialDetailsInput = z.infer<typeof SpecialDetailsInputSchema>;

export const createCaseSchema = z.object({
  caseNumber: z
    .string()
    .min(3, "Aktenzeichen / Urkundenrollen-Nummer muss mindestens 3 Zeichen haben")
    .max(50, "Aktenzeichen darf maximal 50 Zeichen lang sein")
    .regex(
      /^[A-Za-z0-9\-/\.\s]+$/,
      "Aktenzeichen darf nur Buchstaben, Zahlen, Bindestriche, Punkte und Schrägstriche enthalten"
    ),
  title: z
    .string()
    .min(5, "Bezeichnung / Betreff muss mindestens 5 Zeichen lang sein")
    .max(255, "Bezeichnung darf maximal 255 Zeichen lang sein"),
  matterType: MatterTypeEnum.default("REAL_ESTATE"),
  status: CaseStatusEnum.default("DRAFT"),
  description: z.string().max(2000, "Beschreibung darf maximal 2000 Zeichen lang sein").optional(),
  notaryName: z.string().max(100).optional(),
  assignedClerk: z.string().max(100).optional(),
  targetDate: z
    .string()
    .refine((val) => !val || !isNaN(Date.parse(val)), {
      message: "Ungültiges Datumsformat für den Beurkundungstermin",
    })
    .optional(),
  parties: z.array(PartySchema).default([]),
  propertyDetails: PropertyDetailsInputSchema.optional(),
  financials: FinancialDetailsInputSchema.optional(),
  specialDetails: SpecialDetailsInputSchema.optional(),
});

export type CreateCaseInput = z.infer<typeof createCaseSchema>;

export const matterTypeLabels: Record<MatterType, string> = {
  REAL_ESTATE: "Grundstückskaufvertrag & Grundbuch",
  INHERITANCE: "Erbrecht & Nachlass",
  CORPORATE: "Gesellschaftsrecht & Handelsregister",
  POWER_OF_ATTORNEY: "Vorsorgevollmacht & Patientenverfügung",
  MARRIAGE_FAMILY: "Ehevertrag & Familienrecht",
  OTHER: "Sonstige notarielle Beurkundung",
};

export const caseStatusLabels: Record<CaseStatus, string> = {
  DRAFT: "Entwurf",
  IN_REVIEW: "In Prüfung",
  READY_FOR_NOTARIZATION: "Beurkundungsreif",
  NOTARIZED: "Beurkundet",
  COMPLETED: "Vollzug abgeschlossen",
  ARCHIVED: "Archiviert",
};
