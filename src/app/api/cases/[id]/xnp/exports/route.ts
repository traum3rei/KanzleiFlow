import { NextResponse } from "next/server";
import { getTenantContextOrRedirect } from "@/lib/auth/tenant";
import { getCaseExports } from "@/lib/integrations/xnp/export-service";

export const instant = false;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tenant = await getTenantContextOrRedirect();
    const exportsList = await getCaseExports(tenant, id);

    return NextResponse.json({
      success: true,
      exports: exportsList,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Fehler beim Laden der Exporte.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
