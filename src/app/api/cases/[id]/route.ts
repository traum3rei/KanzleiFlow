import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth/tenant";
import { getPrismaClient } from "@/lib/db";
import { getCaseById, deleteCase, CaseNotFoundError } from "@/lib/services/case-service";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const tenant = await getTenantContext();
    const caseRecord = await getCaseById(tenant, id);

    if (!caseRecord) {
      return new NextResponse("Akte nicht gefunden.", { status: 404 });
    }

    return NextResponse.json(caseRecord);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Fehler beim Laden der Akte.";
    if (
      err instanceof Error &&
      (err.name === "AuthenticationRequiredError" ||
        err.name === "SessionExpiredError" ||
        message.includes("Authentifizierung erforderlich") ||
        message.includes("abgelaufen"))
    ) {
      return new NextResponse("Nicht authentifiziert. Bitte melden Sie sich an.", { status: 401 });
    }
    if (
      message.includes("Tenant Isolation Violation") ||
      message.includes("Mandanten-Isolation verletzt")
    ) {
      return new NextResponse("Zugriff verweigert (Fremdmandant).", { status: 403 });
    }
    return new NextResponse(message, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const tenant = await getTenantContext();
    const prisma = getPrismaClient();

    if (!prisma) {
      return new NextResponse("Datenbankverbindung nicht verfügbar.", { status: 500 });
    }

    await deleteCase(tenant, id);

    return NextResponse.json({
      success: true,
      message: "Akte erfolgreich gelöscht.",
    });
  } catch (err: unknown) {
    console.error("Case deletion API error:", err);
    const message = err instanceof Error ? err.message : "Fehler beim Löschen der Akte.";
    if (
      err instanceof Error &&
      (err.name === "AuthenticationRequiredError" ||
        err.name === "SessionExpiredError" ||
        message.includes("Authentifizierung erforderlich") ||
        message.includes("abgelaufen"))
    ) {
      return new NextResponse("Nicht authentifiziert. Bitte melden Sie sich an.", { status: 401 });
    }
    if (
      message.includes("Tenant Isolation Violation") ||
      message.includes("Mandanten-Isolation verletzt")
    ) {
      return new NextResponse("Zugriff verweigert (Fremdmandant).", { status: 403 });
    }
    if (err instanceof CaseNotFoundError) {
      return new NextResponse("Akte nicht gefunden.", { status: 404 });
    }
    return new NextResponse(message, { status: 500 });
  }
}
