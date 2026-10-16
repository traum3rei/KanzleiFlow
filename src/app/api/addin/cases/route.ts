import { NextResponse } from "next/server";
import { getAddinTenantContext } from "@/lib/auth/tenant";
import { getCases, countCases } from "@/lib/services/case-service";
import { CaseStatus, MatterType } from "@/lib/validations/case";

export const instant = false;

export async function GET(req: Request) {
  try {
    const tenant = await getAddinTenantContext(req);

    const url = new URL(req.url);
    const search = url.searchParams.get("search")?.trim() || undefined;
    const status = (url.searchParams.get("status") as CaseStatus) || undefined;
    const matterType = (url.searchParams.get("matterType") as MatterType) || undefined;
    const responsibility = url.searchParams.get("responsibility")?.trim() || undefined;

    const rawPage = parseInt(url.searchParams.get("page") || "1", 10);
    const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;

    const rawPageSize = parseInt(url.searchParams.get("pageSize") || "20", 10);
    const pageSize = Math.min(50, Math.max(5, Number.isFinite(rawPageSize) ? rawPageSize : 20));

    const skip = (page - 1) * pageSize;

    const [cases, totalCount] = await Promise.all([
      getCases(tenant, {
        search,
        status,
        matterType,
        responsibility,
        take: pageSize,
        skip,
      }),
      countCases(tenant, {
        search,
        status,
        matterType,
        responsibility,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

    return NextResponse.json({
      success: true,
      cases,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Fehler beim Abrufen der Akten.";
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
