import { NextResponse } from "next/server";
import { getAddinTenantContext } from "@/lib/auth/tenant";

export const instant = false;

export async function GET(req: Request) {
  try {
    const tenant = await getAddinTenantContext(req);

    return NextResponse.json({
      success: true,
      tenant: {
        organizationId: tenant.organizationId,
        organizationName: tenant.organizationName,
        organizationSlug: tenant.organizationSlug,
        jurisdiction: tenant.jurisdiction,
        userId: tenant.userId,
        userName: tenant.userName,
        userEmail: tenant.userEmail,
        userRole: tenant.userRole,
        availableOrganizations: tenant.availableOrganizations || [],
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Authentifizierung ungültig.";
    return NextResponse.json(
      {
        success: false,
        error: "UNAUTHORIZED",
        message,
      },
      { status: 401 }
    );
  }
}
