import { NextResponse } from "next/server";
import { getTenantContextOrRedirect } from "@/lib/auth/tenant";
import { getExportById } from "@/lib/integrations/xnp/export-service";
import { getExportPackage } from "@/lib/storage";
import { getPrismaClient } from "@/lib/db";

export const instant = false;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; exportId: string }> }
) {
  try {
    const { id, exportId } = await params;
    const tenant = await getTenantContextOrRedirect();

    const record = await getExportById(tenant, exportId);
    if (!record || record.caseId !== id) {
      return NextResponse.json(
        {
          success: false,
          error: "NOT_FOUND",
          message: "Das angeforderte Exportpaket wurde nicht gefunden oder gehört nicht zu Ihrem Notariat.",
        },
        { status: 404 }
      );
    }

    const buffer = await getExportPackage(record.storagePath);
    if (!buffer) {
      return NextResponse.json(
        {
          success: false,
          error: "FILE_MISSING",
          message: "Die Paketdatei ist auf dem Speicher nicht verfügbar.",
        },
        { status: 404 }
      );
    }

    // Record Audit Event for download
    const prisma = getPrismaClient();
    if (prisma) {
      try {
        await prisma.auditEvent.create({
          data: {
            organizationId: tenant.organizationId,
            userId: tenant.userId,
            action: "XNP_EXPORT_DOWNLOADED",
            entityType: "CASE_EXPORT",
            entityId: record.id,
            metadata: {
              fileName: record.fileName,
              exportType: record.exportType,
              fileSize: buffer.length,
            },
          },
        });
      } catch {
        // Non-blocking audit error
      }
    }

    const sanitizedFileName = encodeURIComponent(record.fileName);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${sanitizedFileName}"; filename*=UTF-8''${sanitizedFileName}`,
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Download-Fehler.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
