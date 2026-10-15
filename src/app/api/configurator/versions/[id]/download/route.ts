import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth/tenant";
import { getGeneratedVersionDocx } from "@/lib/configurator/configurator-service";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const tenant = await getTenantContext();

    const { buffer, fileName } = await getGeneratedVersionDocx(tenant, id);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
      },
    });
  } catch (err: unknown) {
    const message = (err as Error).message || "Fehler beim Herunterladen des Vertragsentwurfs.";

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
      err instanceof Error &&
      (err.name === "TenantIsolationError" ||
        message.includes("Mandanten-Isolation verletzt") ||
        message.includes("Zugriff auf fremde Kanzleidaten verweigert"))
    ) {
      return new NextResponse(message, { status: 403 });
    }

    return new NextResponse(message, { status: 404 });
  }
}
