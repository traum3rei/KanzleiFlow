import crypto from "crypto";
import { getPrismaClient } from "@/lib/db";
import { TenantContext } from "@/lib/auth/tenant";
import { getCaseDataForXnpExport } from "@/lib/integrations/xnp/export-data";
import { getFile, saveExportPackage, deleteExportPackage } from "@/lib/storage";
import {
  XnpExportOptions,
  XnpExportRecord,
  XnpExportAttachment,
  XnpExportManifest,
  XnpExportType,
  XnpValidationReport,
} from "./types";
import { validateCaseForXnpExport } from "./validator";
import { buildXnotarGrundbuchXml } from "./adapters/xnotar-grundbuch-adapter";
import { buildUvzXml } from "./adapters/uvz-adapter";
import { buildEnovaXml } from "./adapters/enova-adapter";
import { createDeterministicZip, ZipFileEntry } from "./zip-writer";

export class XnpValidationError extends Error {
  public readonly report: unknown;
  constructor(message: string, report: unknown) {
    super(message);
    this.name = "XnpValidationError";
    this.report = report;
  }
}

/**
 * Generates an end-to-end XNP/XNotar export package for a case.
 * Produces a deterministic ZIP archive with transfer XML, attachments, metadata, and compatibility notice.
 */
export async function generateXnpExportPackage(
  tenant: TenantContext,
  options: XnpExportOptions
): Promise<XnpExportRecord> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error("Datenbankverbindung nicht verfügbar.");
  }

  // 1. Fetch case with strict tenant scoping
  const caseData = await getCaseDataForXnpExport(tenant, options.caseId);
  if (!caseData) {
    throw new Error("Akte wurde nicht gefunden oder gehört nicht zu Ihrem Notariat.");
  }

  // 2. Validate required fields
  const validationReport = validateCaseForXnpExport(caseData, options.exportType);
  if (!validationReport.isValid && !options.allowPartialDraft) {
    throw new XnpValidationError(
      `Validierung für ${options.exportType} fehlgeschlagen. Pflichtfelder fehlen.`,
      validationReport
    );
  }

  // 3. Resolve attachments if requested
  const attachments: XnpExportAttachment[] = [];
  if (options.includeAttachments !== false) {
    const rawDocs = await prisma.document.findMany({
      where: {
        caseId: options.caseId,
        organizationId: tenant.organizationId,
      },
    });
    for (const doc of rawDocs) {
      try {
        const buf = await getFile(doc.storagePath);
        if (buf && buf.length > 0) {
          const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
          attachments.push({
            fileName: doc.fileName,
            mimeType: doc.mimeType,
            category: doc.category,
            buffer: buf,
            sha256,
          });
        }
      } catch (err) {
        console.warn(`Anlage ${doc.fileName} konnte nicht für XNP-Export geladen werden:`, err);
      }
    }
  }

  // 4. Generate Export ID and XML
  const exportId = `XNP-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  let manifestFileName = "transfer.xml";
  let xmlContent = "";

  switch (options.exportType) {
    case "XNOTAR_GRUNDBUCH_XML": {
      const res = buildXnotarGrundbuchXml(tenant, caseData, exportId, attachments);
      manifestFileName = res.manifestFileName;
      xmlContent = res.xmlContent;
      break;
    }
    case "UVZ_XML": {
      const res = buildUvzXml(tenant, caseData, exportId, attachments);
      manifestFileName = res.manifestFileName;
      xmlContent = res.xmlContent;
      break;
    }
    case "ENOVA_XML": {
      const res = buildEnovaXml(tenant, caseData, exportId);
      manifestFileName = res.manifestFileName;
      xmlContent = res.xmlContent;
      break;
    }
    default:
      throw new Error(`Nicht unterstützter Export-Typ: ${options.exportType}`);
  }

  // 5. Build Metadata Manifest
  const manifestData: XnpExportManifest = {
    exportId,
    exportType: options.exportType,
    formatVersion: "1.0.0",
    specificationReference: "Bundesnotarkammer Onlinehilfe (Stand 2025/2026) / XJustiz v3.0",
    generatedAt: new Date().toISOString(),
    organizationId: tenant.organizationId,
    organizationName: tenant.organizationName,
    jurisdiction: tenant.jurisdiction,
    caseNumber: caseData.caseNumber,
    caseTitle: caseData.title,
    matterType: caseData.matterType,
    isAuthoritative: validationReport.isAuthoritative,
    compatibilityLevel: "PROTOTYPE_SPECIFICATION_ALIGNED",
    compatibilityNotice:
      "Dieser Datensatz wurde gemäß den öffentlich dokumentierten BNotK-Schnittstellenvorgaben für XNP und XNotar erzeugt. Die finale elektronische Übermittlung an Register oder Urkundenverzeichnisse erfordert ein durch die BNotK zertifiziertes Notarnet-Zugangssystem mit qualifizierter Signatur.",
    attachments: attachments.map((a) => ({
      fileName: a.fileName,
      fileSize: a.buffer.length,
      sha256: a.sha256,
    })),
  };

  const compatibilityNoticeText = `================================================================================
KANZLEIFLOW - BNOTK XNP / XNOTAR EXPORT-PAKET (TECHNISCHER PROTOTYP)
================================================================================

Export-ID:              ${exportId}
Typ:                    ${options.exportType}
Format-Version:         1.0.0
Aktenzeichen:           ${caseData.caseNumber}
Notariat:               ${tenant.organizationName} (${tenant.jurisdiction})
Erstellungszeitpunkt:   ${manifestData.generatedAt}
Kompatibilitätsstatus:  PROTOTYP (BNotK-Spezifikation 2025/2026)

RECHTLICHER HINWEIS:
Dieses Paket enthält strukturierte Daten für die Weiterverarbeitung in 
der Bundesnotarkammer-Anwendung XNP bzw. den Modulen von XNotar.

1. Das Paket stellt einen technischen Demonstrations- und Vorbereitungsdatensatz dar.
2. Zur rechtswirksamen Einreichung bei Gerichten oder dem Urkundenverzeichnis (UVZ)
   ist die Prüfung durch den zuständigen Notar sowie die Signatur mit einer 
   zugelassenen Notarsignaturkarte (beA/beN-Schnittstelle) zwingend erforderlich.
3. Fehlende Angaben wurden mit [NICHT ANGEGEBEN] gekennzeichnet.

Enthaltene Dateien:
- ${manifestFileName} (Strukturierte XML-Fachdaten)
- metadata.json (Export-Metadaten & SHA-256 Prüfsummen)
${attachments.map((a) => `- attachments/${a.fileName}`).join("\n")}
================================================================================
`;

  // 6. Build ZIP Archive Entries
  const zipEntries: ZipFileEntry[] = [
    {
      path: manifestFileName,
      data: Buffer.from(xmlContent, "utf-8"),
    },
    {
      path: "metadata.json",
      data: Buffer.from(JSON.stringify(manifestData, null, 2), "utf-8"),
    },
    {
      path: "COMPATIBILITY_NOTICE.txt",
      data: Buffer.from(compatibilityNoticeText, "utf-8"),
    },
  ];

  for (const att of attachments) {
    zipEntries.push({
      path: `attachments/${att.fileName}`,
      data: att.buffer,
    });
  }

  const zipBuffer = createDeterministicZip(zipEntries);
  const packageFileName = `${caseData.caseNumber.replace(/[^a-zA-Z0-9.\-_]/g, "_")}_${options.exportType.toLowerCase()}.zip`;

  // 7. Store package in organization-scoped storage
  const { storagePath, fileHash } = await saveExportPackage(
    tenant.organizationId,
    exportId,
    packageFileName,
    zipBuffer
  );

  // 8. Capture source data snapshot
  const sourceSnapshot = {
    caseNumber: caseData.caseNumber,
    title: caseData.title,
    notaryName: caseData.notaryName,
    status: caseData.status,
    matterType: caseData.matterType,
    parties: caseData.parties,
    propertyDetails: caseData.propertyDetails,
    financials: caseData.financials,
    specialDetails: caseData.specialDetails,
    extractedApprovedData: (caseData as unknown as Record<string, unknown>).extractedData || null,
  };

  // 9. Persist CaseExport record
  const createdRecord = await prisma.caseExport.create({
    data: {
      organizationId: tenant.organizationId,
      caseId: options.caseId,
      exportType: options.exportType,
      formatVersion: "1.0.0",
      fileName: packageFileName,
      fileSize: zipBuffer.length,
      fileHash,
      storagePath,
      sourceSnapshot: sourceSnapshot as object,
      validationReport: validationReport as object,
      isAuthoritative: validationReport.isAuthoritative,
      compatibilityNotice: manifestData.compatibilityNotice,
      createdById: tenant.userId,
    },
  });

  // 10. Record Audit Event
  try {
    await prisma.auditEvent.create({
      data: {
        organizationId: tenant.organizationId,
        userId: tenant.userId,
        action: "XNP_EXPORT_GENERATED",
        entityType: "CASE_EXPORT",
        entityId: createdRecord.id,
        metadata: {
          exportType: options.exportType,
          caseNumber: caseData.caseNumber,
          fileHash,
          fileSize: zipBuffer.length,
          attachmentsCount: attachments.length,
          isAuthoritative: validationReport.isAuthoritative,
        },
      },
    });
  } catch (auditErr) {
    console.warn("Failed to create audit event for XNP export:", auditErr);
  }

  return {
    id: createdRecord.id,
    organizationId: createdRecord.organizationId,
    caseId: createdRecord.caseId,
    jobId: createdRecord.jobId,
    exportType: createdRecord.exportType as XnpExportType,
    formatVersion: createdRecord.formatVersion,
    fileName: createdRecord.fileName,
    fileSize: createdRecord.fileSize,
    fileHash: createdRecord.fileHash,
    storagePath: createdRecord.storagePath,
    isAuthoritative: createdRecord.isAuthoritative,
    compatibilityNotice: createdRecord.compatibilityNotice,
    validationReport: createdRecord.validationReport as unknown as XnpValidationReport,
    sourceSnapshot: createdRecord.sourceSnapshot as Record<string, unknown>,
    createdAt: createdRecord.createdAt.toISOString(),
    downloadUrl: `/api/cases/${caseData.id}/xnp/exports/${createdRecord.id}/download`,
  };
}

/**
 * Lists all exports for a given case scoped strictly to tenant.
 */
export async function getCaseExports(
  tenant: TenantContext,
  caseId: string
): Promise<XnpExportRecord[]> {
  const prisma = getPrismaClient();
  if (!prisma) return [];

  const records = await prisma.caseExport.findMany({
    where: {
      organizationId: tenant.organizationId,
      caseId,
    },
    orderBy: { createdAt: "desc" },
  });

  return records.map((r) => ({
    id: r.id,
    organizationId: r.organizationId,
    caseId: r.caseId,
    jobId: r.jobId,
    exportType: r.exportType as XnpExportType,
    formatVersion: r.formatVersion,
    fileName: r.fileName,
    fileSize: r.fileSize,
    fileHash: r.fileHash,
    storagePath: r.storagePath,
    isAuthoritative: r.isAuthoritative,
    compatibilityNotice: r.compatibilityNotice,
    validationReport: r.validationReport as unknown as XnpValidationReport,
    sourceSnapshot: r.sourceSnapshot as Record<string, unknown>,
    createdAt: r.createdAt.toISOString(),
    downloadUrl: `/api/cases/${caseId}/xnp/exports/${r.id}/download`,
  }));
}

/**
 * Retrieves a single export record with strict tenant isolation.
 */
export async function getExportById(
  tenant: TenantContext,
  exportId: string
): Promise<XnpExportRecord | null> {
  const prisma = getPrismaClient();
  if (!prisma) return null;

  const record = await prisma.caseExport.findFirst({
    where: {
      id: exportId,
      organizationId: tenant.organizationId,
    },
  });

  if (!record) return null;

  return {
    id: record.id,
    organizationId: record.organizationId,
    caseId: record.caseId,
    jobId: record.jobId,
    exportType: record.exportType as XnpExportType,
    formatVersion: record.formatVersion,
    fileName: record.fileName,
    fileSize: record.fileSize,
    fileHash: record.fileHash,
    storagePath: record.storagePath,
    isAuthoritative: record.isAuthoritative,
    compatibilityNotice: record.compatibilityNotice,
    validationReport: record.validationReport as unknown as XnpValidationReport,
    sourceSnapshot: record.sourceSnapshot as Record<string, unknown>,
    createdAt: record.createdAt.toISOString(),
    downloadUrl: `/api/cases/${record.caseId}/xnp/exports/${record.id}/download`,
  };
}

/**
 * Deletes an export record and its physical storage artifact.
 */
export async function deleteCaseExport(
  tenant: TenantContext,
  exportId: string
): Promise<boolean> {
  const prisma = getPrismaClient();
  if (!prisma) return false;

  const record = await prisma.caseExport.findFirst({
    where: {
      id: exportId,
      organizationId: tenant.organizationId,
    },
  });

  if (!record) return false;

  await deleteExportPackage(record.storagePath);
  await prisma.caseExport.delete({ where: { id: exportId } });

  try {
    await prisma.auditEvent.create({
      data: {
        organizationId: tenant.organizationId,
        userId: tenant.userId,
        action: "XNP_EXPORT_DELETED",
        entityType: "CASE_EXPORT",
        entityId: exportId,
        metadata: { fileName: record.fileName },
      },
    });
  } catch {
    // Ignore audit logging error
  }

  return true;
}
