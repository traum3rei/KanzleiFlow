/**
 * KanzleiFlow — XNP/XNotar Integration Types & Contracts
 * 
 * Defines typed contracts for BNotK XNP (Urkundenverzeichnis UVZ),
 * XNotar (Modul Grundbuch / Handelsregister), and eNoVA (Veräußerungsanzeigen).
 */

export type XnpExportType = "XNOTAR_GRUNDBUCH_XML" | "UVZ_XML" | "ENOVA_XML";

export interface XnpValidationIssue {
  fieldKey: string;
  path: string;
  message: string;
  severity: "ERROR" | "WARNING";
}

export interface XnpValidationReport {
  isValid: boolean;
  issues: XnpValidationIssue[];
  missingRequiredFields: string[];
  verifiedDataCount: number;
  isAuthoritative: boolean;
  summary: string;
}

export interface XnpExportAttachment {
  fileName: string;
  mimeType: string;
  category: string;
  buffer: Buffer;
  sha256: string;
}

export interface XnpExportManifest {
  exportId: string;
  exportType: XnpExportType;
  formatVersion: string;
  specificationReference: string;
  generatedAt: string;
  organizationId: string;
  organizationName: string;
  jurisdiction: string;
  caseNumber: string;
  caseTitle: string;
  matterType: string;
  isAuthoritative: boolean;
  compatibilityLevel: "PROTOTYPE_SPECIFICATION_ALIGNED" | "CERTIFIED_NOTARNET_PRODUCTION";
  compatibilityNotice: string;
  attachments: Array<{
    fileName: string;
    fileSize: number;
    sha256: string;
  }>;
}

export interface XnpExportOptions {
  caseId: string;
  exportType: XnpExportType;
  includeAttachments?: boolean;
  allowPartialDraft?: boolean;
  idempotencyKey?: string;
}

export interface XnpExportRecord {
  id: string;
  organizationId: string;
  caseId: string;
  jobId: string | null;
  exportType: XnpExportType;
  formatVersion: string;
  fileName: string;
  fileSize: number;
  fileHash: string | null;
  storagePath: string;
  isAuthoritative: boolean;
  compatibilityNotice: string | null;
  validationReport: XnpValidationReport | null;
  sourceSnapshot: Record<string, unknown>;
  createdAt: string;
  downloadUrl: string;
}

export interface LocalXnpApiStatus {
  isConfigured: boolean;
  defaultPort: number;
  portRange: string;
  status: "LOCAL_REST_INTERFACE_SPECIFIED" | "DESKTOP_BRIDGE_REQUIRED";
  description: string;
  supportedFunctions: string[];
  securityConstraints: string[];
}
