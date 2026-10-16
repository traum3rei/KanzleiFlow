import { CaseItem } from "@/lib/services/case-service";
import { TenantContext } from "@/lib/auth/tenant";
import { PropertyDetailsInput, FinancialDetailsInput } from "@/lib/validations/case";
import { XnpExportAttachment } from "../types";

export interface XnotarXmlResult {
  xmlContent: string;
  manifestFileName: string;
  targetModule: "GRUNDBUCH";
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
 * Builds the official transfer XML for the XNotar Modul Grundbuch.
 * Conforms to BNotK & XJustiz structured message conventions.
 */
export function buildXnotarGrundbuchXml(
  tenant: TenantContext,
  caseData: CaseItem,
  exportId: string,
  attachments: XnpExportAttachment[] = []
): XnotarXmlResult {
  const generatedAt = new Date().toISOString();
  const parties = caseData.parties || [];
  const prop: Partial<PropertyDetailsInput> = caseData.propertyDetails || {};
  const fin: Partial<FinancialDetailsInput> = caseData.financials || {};

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!-- 
  KanzleiFlow Notariats-Portal
  XNotar Transferpaket - Modul Grundbuch
  Erzeugt am: ${escapeXml(generatedAt)}
  HINWEIS: Technischer Entwurf / Prototyp nach BNotK-Schnittstellenvorgaben.
-->
<xnotar:nachricht 
  xmlns:xnotar="http://www.bnotk.de/xnotar/v1.0" 
  xmlns:xjustiz="http://www.xjustiz.de/v3.0"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  exportId="${escapeXml(exportId)}"
  version="1.0.0"
  schemaVersion="2025/2026">

  <xnotar:kopf>
    <xnotar:erstellungszeitpunkt>${escapeXml(generatedAt)}</xnotar:erstellungszeitpunkt>
    <xnotar:erstellendeSoftware>KanzleiFlow (v0.1.0 SaaS)</xnotar:erstellendeSoftware>
    <xnotar:aktenzeichenNotar>${escapeXml(caseData.caseNumber)}</xnotar:aktenzeichenNotar>
    <xnotar:vorgangsbezeichnung>${escapeXml(caseData.title)}</xnotar:vorgangsbezeichnung>
    <xnotar:amtstaetigkeit>
      <xnotar:notarName>${escapeXml(caseData.notaryName || tenant.userName)}</xnotar:notarName>
      <xnotar:notariatName>${escapeXml(tenant.organizationName)}</xnotar:notariatName>
      <xnotar:amtsbezirk>${escapeXml(tenant.jurisdiction)}</xnotar:amtsbezirk>
      <xnotar:sachbearbeiter>${escapeXml(caseData.assignedClerk || "Stefanie Bauer")}</xnotar:sachbearbeiter>
    </xnotar:amtstaetigkeit>
  </xnotar:kopf>

  <xnotar:grundbuchantrag>
    <xnotar:verfahrensgegenstand>Eigentumsumschreibung und Eintragungsantrag nach § 13 GBO</xnotar:verfahrensgegenstand>
    <xnotar:geschaeftswert waehrung="${escapeXml(fin.currency || "EUR")}">${escapeXml(fin.dealValue ?? 0)}</xnotar:geschaeftswert>
    
    <xnotar:liegenschaft>
      <xnotar:gemarkung>${escapeXml(prop.landRegistryDistrict || "[NICHT ANGEGEBEN]")}</xnotar:gemarkung>
      <xnotar:grundbuchblatt>${escapeXml(prop.sheetNumber || "[NICHT ANGEGEBEN]")}</xnotar:grundbuchblatt>
      <xnotar:flurstueck>${escapeXml(prop.parcelNumber || "[NICHT ANGEGEBEN]")}</xnotar:flurstueck>
      <xnotar:flaecheSqm>${escapeXml(prop.areaSqm ?? 0)}</xnotar:flaecheSqm>
      <xnotar:wirtschaftsart>${escapeXml(prop.economicUse || "[Nicht angegeben]")}</xnotar:wirtschaftsart>
    </xnotar:liegenschaft>

    <xnotar:vorlasten>
      <xnotar:beschreibung>${escapeXml(fin.existingEncumbrances || "Keine Vorlasten angegeben")}</xnotar:beschreibung>
    </xnotar:vorlasten>
  </xnotar:grundbuchantrag>

  <xnotar:beteiligte>
${parties
  .map(
    (p, idx) => `    <xnotar:beteiligter id="P${idx + 1}" rolle="${escapeXml(p.role)}">
      <xnotar:name>${escapeXml(p.name)}</xnotar:name>
      <xnotar:anschrift>${escapeXml(p.address || "[NICHT ANGEGEBEN]")}</xnotar:anschrift>
      <xnotar:geburtsdatum>${escapeXml(p.birthDate || "")}</xnotar:geburtsdatum>
      <xnotar:steuerId>${escapeXml(p.taxId || "")}</xnotar:steuerId>
      <xnotar:familienstand>${escapeXml(p.maritalStatus || "")}</xnotar:familienstand>
      <xnotar:staatsangehoerigkeit>${escapeXml(p.nationality || "deutsch")}</xnotar:staatsangehoerigkeit>
    </xnotar:beteiligter>`
  )
  .join("\n")}
  </xnotar:beteiligte>

  <xnotar:anlagen>
${attachments
  .map(
    (att) => `    <xnotar:anlage>
      <xnotar:dateiname>${escapeXml(att.fileName)}</xnotar:dateiname>
      <xnotar:mimeType>${escapeXml(att.mimeType)}</xnotar:mimeType>
      <xnotar:kategorie>${escapeXml(att.category)}</xnotar:kategorie>
      <xnotar:sha256>${escapeXml(att.sha256)}</xnotar:sha256>
    </xnotar:anlage>`
  )
  .join("\n")}
  </xnotar:anlagen>

</xnotar:nachricht>
`;

  return {
    xmlContent: xml.trim(),
    manifestFileName: "xnotar-grundbuch-transfer.xml",
    targetModule: "GRUNDBUCH",
  };
}
