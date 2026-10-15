import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth/tenant";
import { getPrismaClient } from "@/lib/db";
import { deleteDocument, DocumentNotFoundError } from "@/lib/services/document-service";

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

    await deleteDocument(tenant, id);

    return NextResponse.json({
      success: true,
      message: "Dokument erfolgreich gelöscht.",
    });
  } catch (err: unknown) {
    console.error("Document deletion error:", err);
    const message = (err as Error).message || "Fehler beim Löschen des Dokuments.";
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
    if (err instanceof DocumentNotFoundError) {
      return new NextResponse("Dokument nicht gefunden.", { status: 404 });
    }
    return new NextResponse(message, { status: 500 });
  }
}
