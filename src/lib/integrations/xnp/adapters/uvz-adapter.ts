import { CaseItem } from "@/lib/services/case-service";
import { TenantContext } from "@/lib/auth/tenant";
import { FinancialDetailsInput } from "@/lib/validations/case";
import { XnpExportAttachment } from "../types";

export interface UvzXmlResult {
  xmlContent: string;
  manifestFileName: string;
}

function escapeXml(str: string | number | null | undefined): string {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Builds the official Urkundenverzeichnis (UVZ) XML import structure
 * conforming to § 8 DONot and Bundesnotarkammer UVZ import specifications.
 */
export function buildUvzXml(
  tenant: TenantContext,
  caseData: CaseItem,
  exportId: string,
  attachments: XnpExportAttachment[] = []
): UvzXmlResult {
  const generatedAt = new Date().toISOString();
  const parties = caseData.parties || [];
  const fin: Partial<FinancialDetailsInput> = caseData.financials || {};

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!-- 
  KanzleiFlow Notariats-Portal
  Urkundenverzeichnis (UVZ) Importdatensatz (§ 8 DONot)
  Erzeugt am: ${escapeXml(generatedAt)}
-->
<uvz:urkundenverzeichnisEintrag
  xmlns:uvz="http://www.bnotk.de/uvz/v1.0"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  exportId="${escapeXml(exportId)}"
  version="1.0.0">

  <uvz:eintragsdaten>
    <uvz:urkundenNummer>${escapeXml(caseData.caseNumber)}</uvz:urkundenNummer>
    <uvz:geschaeftsjahr>${new Date().getFullYear()}</uvz:geschaeftsjahr>
    <uvz:urkundenart>${escapeXml(caseData.matterType)}</uvz:urkundenart>
    <uvz:bezeichnung>${escapeXml(caseData.title)}</uvz:bezeichnung>
    <uvz:beurkundungsdatum>${escapeXml(caseData.targetDate ? caseData.targetDate.split("T")[0] : new Date().toISOString().split("T")[0])}</uvz:beurkundungsdatum>
    <uvz:status>${escapeXml(caseData.status)}</uvz:status>
    <uvz:geschaeftswert waehrung="${escapeXml(fin.currency || "EUR")}">${escapeXml(fin.dealValue ?? 0)}</uvz:geschaeftswert>
  </uvz:eintragsdaten>

  <uvz:notar>
    <uvz:name>${escapeXml(caseData.notaryName || tenant.userName)}</uvz:name>
    <uvz:amtsstelle>${escapeXml(tenant.organizationName)}</uvz:amtsstelle>
    <uvz:amtsbereich>${escapeXml(tenant.jurisdiction)}</uvz:amtsbereich>
  </uvz:notar>

  <uvz:beteiligte>
${parties
  .map(
    (p, idx) => `    <uvz:beteiligter id="UVZ-P${idx + 1}">
      <uvz:rolle>${escapeXml(p.role)}</uvz:rolle>
      <uvz:name>${escapeXml(p.name)}</uvz:name>
      <uvz:anschrift>${escapeXml(p.address || "[NICHT ANGEGEBEN]")}</uvz:anschrift>
      <uvz:geburtsdatum>${escapeXml(p.birthDate || "")}</uvz:geburtsdatum>
      <uvz:steuerId>${escapeXml(p.taxId || "")}</uvz:steuerId>
    </uvz:beteiligter>`
  )
  .join("\n")}
  </uvz:beteiligte>

  <uvz:dokumente>
${attachments
  .map(
    (att) => `    <uvz:dokument>
      <uvz:dateiname>${escapeXml(att.fileName)}</uvz:dateiname>
      <uvz:format>${escapeXml(att.mimeType)}</uvz:format>
      <uvz:sha256>${escapeXml(att.sha256)}</uvz:sha256>
    </uvz:dokument>`
  )
  .join("\n")}
  </uvz:dokumente>

</uvz:urkundenverzeichnisEintrag>
`;

  return {
    xmlContent: xml.trim(),
    manifestFileName: "uvz-import-eintrag.xml",
  };
}
