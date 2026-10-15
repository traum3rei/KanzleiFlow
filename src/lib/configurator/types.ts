/**
 * Structured Document Configurator — Types & Interfaces
 * Domain models for deterministic legal document assembly (Immobilienkaufvertrag).
 */

export type PartyRole = "Käufer" | "Verkäufer" | "Beteiligter";

export interface ConfiguredParty {
  id: string;
  role: PartyRole;
  name: string;
  birthDate?: string | null;
  birthPlace?: string | null;
  taxId?: string | null;
  address: string;
  city?: string | null;
  postalCode?: string | null;
  maritalStatus?: "ledig" | "verheiratet" | "Gütertrennung" | "Gütergemeinschaft" | "Zugewinngemeinschaft" | "geschieden" | "unbekannt" | null;
  nationality?: string | null;
  actingForSelf?: boolean;
  representativeName?: string | null;
  representativePowerOfAttorneyDetails?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface ConfiguredProperty {
  landRegistryDistrict: string; // Grundbuchbezirk (z.B. München-Schwabing)
  sheetNumber: string; // Grundbuchblatt (z.B. 4521)
  cadastralDistrict?: string | null; // Gemarkung
  parcelNumber: string; // Flurstück (z.B. Flur 14, Flurstück 88/2)
  streetAddress: string; // Lagebezeichnung / Adresse
  city?: string | null;
  postalCode?: string | null;
  plotAreaSqm?: number | null; // Grundstücksfläche in m²
  economicUse?: string | null; // z.B. Wohnbaufläche, Zweifamilienhaus
  coOwnershipShare?: string | null; // z.B. 450/10.000 MEA bei WEG
  existingEncumbrancesAbt2?: string[] | null; // Lasten Abt. II (Wegerecht etc.)
  existingEncumbrancesAbt3?: string[] | null; // Grundschulden Abt. III
}

export interface ConfiguredPurchasePrice {
  amount: number; // Kaufpreis in EUR
  currency: string; // EUR
  paymentDueDate?: string | null; // z.B. 2026-11-15
  paymentConditionsDescription?: string | null; // Fälligkeitsvoraussetzungen
  useEscrowAccount: boolean; // Notaranderkonto erforderlich
  escrowReason?: string | null; // Begründung für berechtigtes Sicherungsinteresse gem. § 54a BeurkG
  sellerBankDetails?: {
    accountHolder?: string | null;
    iban?: string | null;
    bic?: string | null;
    bankName?: string | null;
  } | null;
  financingRequired: boolean; // Käufer benötigt Finanzierungsgrundschuld
  financingAmount?: number | null;
  financingBankName?: string | null;
  encumbranceAuthorityRequired?: boolean; // Belastungsvollmacht vor Eigentumsumschreibung
}

export interface ConfiguredTerms {
  possessionTransferDate?: string | null; // Besitz- und Nutzenübergang
  tenancyStatus: "free" | "rented" | "partially_rented";
  tenancyDetails?: string | null; // Angaben zu Mietern, Kautionen, Nettokaltmiete
  energyCertificatePresent: boolean;
  energyCertificateDetails?: string | null;
  buildingStatus: "existing" | "new_build" | "under_construction";
  knownDefectsDescription?: string | null; // Bekannte Mängel / Altlasten
  costsAllocation: "standard" | "custom"; // Standard: Käufer trägt Kosten & GrESt, Verkäufer trägt Lastenfreistellung
  customNotes?: string | null;
}

export interface DocumentConfigurationData {
  title: string;
  caseNumber?: string | null;
  notaryOfficeName?: string | null;
  parties: ConfiguredParty[];
  property: ConfiguredProperty;
  purchasePrice: ConfiguredPurchasePrice;
  terms: ConfiguredTerms;
  selectedClauseCodes: string[];
  customClauseOverrides?: Record<string, string>; // Code -> Custom Text
}

export interface ClauseMetadata {
  code: string;
  title: string;
  category: "PARTIES" | "PROPERTY" | "PRICE" | "CLEARANCE" | "POSSESSION" | "WARRANTY" | "TENANCY" | "FINANCING" | "ENFORCEMENT" | "COSTS" | "MISC";
  description: string;
  isDefault: boolean;
  requiredFields?: string[];
  dependencies?: string[];
  incompatibilities?: string[];
  sortOrder: number;
  bodyTemplate: string;
}

export type ValidationSeverity = "error" | "warning";

export interface ValidationIssue {
  field?: string;
  step: number; // 1 to 5
  message: string;
  severity: ValidationSeverity;
  clauseCode?: string;
}

export interface UnsatisfiedDependency {
  clauseCode: string;
  missingDependency: string;
  reason: string;
}

export interface IncompatiblePair {
  clauseA: string;
  clauseB: string;
  reason: string;
}

export interface RulesEvaluationResult {
  isValid: boolean;
  canGenerateDraft: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  missingRequiredFields: string[];
  incompatibleClausePairs: IncompatiblePair[];
  unsatisfiedDependencies: UnsatisfiedDependency[];
  selectedClausesCount: number;
}
