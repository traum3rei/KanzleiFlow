import { NextResponse } from "next/server";
import { getAddinTenantContext, assertTenantOwnership } from "@/lib/auth/tenant";
import { getCaseById } from "@/lib/services/case-service";
import { getPrismaClient } from "@/lib/db";

export const instant = false;

export async function POST(req: Request) {
  try {
    const tenant = await getAddinTenantContext(req);
    const body = await req.json();
    const { caseId, actionType, fieldKey, fieldLabel } = body;

    if (!caseId) {
      return NextResponse.json(
        { success: false, error: "VALIDATION_ERROR", message: "caseId ist erforderlich." },
        { status: 400 }
      );
    }

    const caseItem = await getCaseById(tenant, caseId);
    if (!caseItem) {
      return NextResponse.json(
        { success: false, error: "NOT_FOUND", message: `Akte '${caseId}' nicht gefunden.` },
        { status: 404 }
      );
    }

    assertTenantOwnership(caseItem.organizationId, tenant);

    const prisma = getPrismaClient();
    if (prisma) {
      try {
        await prisma.auditEvent.create({
          data: {
            organizationId: tenant.organizationId,
            userId: tenant.userId,
            action: actionType || "WORD_ADDIN_DATA_INSERTED",
            entityType: "CASE",
            entityId: caseId,
            metadata: {
              fieldKey: fieldKey || "unknown",
              fieldLabel: fieldLabel || "unknown",
              caseNumber: caseItem.caseNumber,
              channel: "WORD_ADDIN",
              timestamp: new Date().toISOString(),
            },
          },
        });
      } catch (err) {
        console.warn("Could not persist add-in audit event to DB:", err);
      }
    }

    return NextResponse.json({
      success: true,
      logged: true,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Fehler beim Aufzeichnen des Audit-Events.";
    return NextResponse.json(
      {
        success: false,
        error: "ERROR",
        message,
      },
      { status: 500 }
    );
  }
}
