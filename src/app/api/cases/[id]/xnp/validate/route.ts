import { NextResponse } from "next/server";
import { getTenantContextOrRedirect } from "@/lib/auth/tenant";
import { getCaseDataForXnpExport } from "@/lib/integrations/xnp/export-data";
import { validateCaseForXnpExport } from "@/lib/integrations/xnp/validator";
import { XnpExportType } from "@/lib/integrations/xnp/types";

export const instant = false;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tenant = await getTenantContextOrRedirect();
    const caseData = await getCaseDataForXnpExport(tenant, id);

    if (!caseData) {
      return NextResponse.json(
        { success: false, error: "NOT_FOUND", message: "Akte nicht gefunden." },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(req.url);
    const exportType = (searchParams.get("type") as XnpExportType) || "XNOTAR_GRUNDBUCH_XML";

    const report = validateCaseForXnpExport(caseData, exportType);

    return NextResponse.json({
      success: true,
      exportType,
      report,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Validierungsfehler.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
