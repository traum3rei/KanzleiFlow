import { CaseItem } from "@/lib/services/case-service";
import { TenantContext } from "@/lib/auth/tenant";
import { PropertyDetailsInput, FinancialDetailsInput } from "@/lib/validations/case";

export interface EnovaXmlResult {
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
 * Builds the electronic Veräußerungsanzeige XML according to § 18 GrEStG
 * for submission via the eNoVA interface in XNP.
 */
export function buildEnovaXml(
  tenant: TenantContext,
  caseData: CaseItem,
  exportId: string
): EnovaXmlResult {
  const generatedAt = new Date().toISOString();
  const parties = caseData.parties || [];
  const prop: Partial<PropertyDetailsInput> = caseData.propertyDetails || {};
  const fin: Partial<FinancialDetailsInput> = caseData.financials || {};

  const sellers = parties.filter((p) => /verkäufer|veräußerer|übergeber/i.test(p.role));
  const buyers = parties.filter((p) => /käufer|erwerber|übernehmer/i.test(p.role));

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!-- 
  KanzleiFlow Notariats-Portal
  eNoVA Veräußerungsanzeige gemäß § 18 GrEStG
  Erzeugt am: ${escapeXml(generatedAt)}
-->
<enova:veraeusserungsanzeige
  xmlns:enova="http://www.bnotk.de/enova/v1.0"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  anzeigeId="${escapeXml(exportId)}"
  version="1.0.0">

  <enova:notariat>
    <enova:notarName>${escapeXml(caseData.notaryName || tenant.userName)}</enova:notarName>
    <enova:dienstsitz>${escapeXml(tenant.organizationName)}</enova:dienstsitz>
    <enova:bundesland>${escapeXml(tenant.jurisdiction)}</enova:bundesland>
    <enova:urkundennummer>${escapeXml(caseData.caseNumber)}</enova:urkundennummer>
    <enova:beurkundungsdatum>${escapeXml(caseData.targetDate ? caseData.targetDate.split("T")[0] : new Date().toISOString().split("T")[0])}</enova:beurkundungsdatum>
  </enova:notariat>

  <enova:vertragsgegenstand>
    <enova:art>Grundstückskaufvertrag</enova:art>
    <enova:gemarkung>${escapeXml(prop.landRegistryDistrict || "[NICHT ANGEGEBEN]")}</enova:gemarkung>
    <enova:grundbuchblatt>${escapeXml(prop.sheetNumber || "[NICHT ANGEGEBEN]")}</enova:grundbuchblatt>
    <enova:flurstueck>${escapeXml(prop.parcelNumber || "[NICHT ANGEGEBEN]")}</enova:flurstueck>
    <enova:flaecheSqm>${escapeXml(prop.areaSqm ?? 0)}</enova:flaecheSqm>
  </enova:vertragsgegenstand>

  <enova:gegenleistung>
    <enova:kaufpreis waehrung="${escapeXml(fin.currency || "EUR")}">${escapeXml(fin.dealValue ?? 0)}</enova:kaufpreis>
    <enova:faelligkeit>${escapeXml(fin.paymentDueDate || "[Nicht angegeben]")}</enova:faelligkeit>
  </enova:gegenleistung>

  <enova:veraeusserer>
${(sellers.length > 0 ? sellers : parties)
  .map(
    (p, idx) => `    <enova:person id="V${idx + 1}">
      <enova:name>${escapeXml(p.name)}</enova:name>
      <enova:anschrift>${escapeXml(p.address || "[NICHT ANGEGEBEN]")}</enova:anschrift>
      <enova:steuerId>${escapeXml(p.taxId || "[NICHT ANGEGEBEN]")}</enova:steuerId>
      <enova:geburtsdatum>${escapeXml(p.birthDate || "")}</enova:geburtsdatum>
    </enova:person>`
  )
  .join("\n")}
  </enova:veraeusserer>

  <enova:erwerber>
${(buyers.length > 0 ? buyers : parties)
  .map(
    (p, idx) => `    <enova:person id="E${idx + 1}">
      <enova:name>${escapeXml(p.name)}</enova:name>
      <enova:anschrift>${escapeXml(p.address || "[NICHT ANGEGEBEN]")}</enova:anschrift>
      <enova:steuerId>${escapeXml(p.taxId || "[NICHT ANGEGEBEN]")}</enova:steuerId>
      <enova:geburtsdatum>${escapeXml(p.birthDate || "")}</enova:geburtsdatum>
    </enova:person>`
  )
  .join("\n")}
  </enova:erwerber>

</enova:veraeusserungsanzeige>
`;

  return {
    xmlContent: xml.trim(),
    manifestFileName: "enova-veraeusserungsanzeige.xml",
  };
}
