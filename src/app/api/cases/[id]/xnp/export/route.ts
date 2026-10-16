import { NextResponse } from "next/server";
import { getTenantContextOrRedirect } from "@/lib/auth/tenant";
import {
  generateXnpExportPackage,
  XnpValidationError,
} from "@/lib/integrations/xnp/export-service";
import { XnpExportType } from "@/lib/integrations/xnp/types";
import { enqueueJob } from "@/lib/queue/job-queue";

export const instant = false;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tenant = await getTenantContextOrRedirect();
    const body = await req.json().catch(() => ({}));

    const exportType: XnpExportType = body.exportType || "XNOTAR_GRUNDBUCH_XML";
    const includeAttachments = body.includeAttachments !== false;
    const allowPartialDraft = body.allowPartialDraft === true;
    const asyncQueue = body.asyncQueue === true;

    if (asyncQueue) {
      const job = await enqueueJob(tenant, {
        jobType: "EXPORT_GENERATION",
        payload: {
          caseId: id,
          exportType,
          includeAttachments,
          allowPartialDraft,
        },
      });

      return NextResponse.json({
        success: true,
        queued: true,
        jobId: job.id,
        message: "XNP/XNotar-Exportauftrag wurde erfolgreich in die Hintergrund-Warteschlange eingereiht.",
      });
    }

    const exportRecord = await generateXnpExportPackage(tenant, {
      caseId: id,
      exportType,
      includeAttachments,
      allowPartialDraft,
    });

    return NextResponse.json({
      success: true,
      queued: false,
      export: exportRecord,
    });
  } catch (err: unknown) {
    if (err instanceof XnpValidationError) {
      return NextResponse.json(
        {
          success: false,
          error: "VALIDATION_FAILED",
          message: err.message,
          report: err.report,
        },
        { status: 422 }
      );
    }

    const message = err instanceof Error ? err.message : "Fehler bei der Paketerstellung.";
    return NextResponse.json(
      {
        success: false,
        error: "EXPORT_ERROR",
        message,
      },
      { status: 500 }
    );
  }
}
