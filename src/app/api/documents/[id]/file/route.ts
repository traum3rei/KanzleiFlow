import { NextRequest, NextResponse } from "next/server";
import { getTenantContext, assertTenantOwnership } from "@/lib/auth/tenant";
import { getPrismaClient } from "@/lib/db";
import { getFile } from "@/lib/storage";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const tenant = await getTenantContext();
    const prisma = getPrismaClient();

    if (!prisma) {
      return new NextResponse("Datenbankverbindung nicht verfügbar.", { status: 500 });
    }

    const doc = await prisma.document.findUnique({
      where: { id },
      select: {
        id: true,
        organizationId: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        storagePath: true,
      },
    });

    if (!doc) {
      return new NextResponse("Dokument nicht gefunden.", { status: 404 });
    }

    // Strict tenant boundary enforcement
    assertTenantOwnership(tenant, doc.organizationId);

    // Read file buffer from secure storage
    const fileBuffer = await getFile(doc.storagePath);

    const isDownload = request.nextUrl.searchParams.get("download") === "true";
    const dispositionType = isDownload ? "attachment" : "inline";
    const encodedFileName = encodeURIComponent(doc.fileName);

    return new NextResponse(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        "Content-Type": doc.mimeType || "application/pdf",
        "Content-Disposition": `${dispositionType}; filename="${encodedFileName}"; filename*=UTF-8''${encodedFileName}`,
        "Content-Length": fileBuffer.length.toString(),
        "Cache-Control": "private, max-age=3600, stale-while-revalidate=60",
      },
    });
  } catch (err: unknown) {
    console.error("File streaming error:", err);
    const message = (err as Error).message || "Fehler beim Laden der Datei.";
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
