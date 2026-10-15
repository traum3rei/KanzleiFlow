import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth/tenant";
import { getDraftById, getDraftDocxBuffer } from "@/lib/services/draft-service";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const tenant = await getTenantContext();
    const format = request.nextUrl.searchParams.get("format") || "docx";

    if (format === "txt") {
      const draft = await getDraftById(tenant, id);
      if (!draft) {
        return new NextResponse("Entwurf nicht gefunden oder Zugriff verweigert.", {
          status: 404,
        });
      }

      const filename = draft.title.endsWith(".txt")
        ? draft.title
        : `${draft.title.replace(/\.docx$/i, "")}.txt`;
      const isInline = request.nextUrl.searchParams.get("inline") === "true";
      const dispositionType = isInline ? "inline" : "attachment";

      return new NextResponse(draft.content, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `${dispositionType}; filename="${encodeURIComponent(filename)}"`,
          "Cache-Control": "private, no-cache, no-store, must-revalidate",
        },
      });
    }

    // Default: Professional Word (.docx) download
    const { buffer, filename } = await getDraftDocxBuffer(tenant, id);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
      },
    });
  } catch (err: unknown) {
    const message = (err as Error).message || "Fehler beim Herunterladen des Entwurfs.";
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
    if (message.includes("nicht gefunden")) {
      return new NextResponse("Entwurf nicht gefunden.", { status: 404 });
    }
    return new NextResponse(message, { status: 500 });
  }
}
