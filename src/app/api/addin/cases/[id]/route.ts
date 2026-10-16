import { NextResponse } from "next/server";
import { getAddinTenantContext, assertTenantOwnership, TenantIsolationError, AuthenticationRequiredError } from "@/lib/auth/tenant";
import { getCaseById } from "@/lib/services/case-service";
import { getDocumentsForCase } from "@/lib/services/document-service";
import { matterTypeLabels, caseStatusLabels } from "@/lib/validations/case";

export const instant = false;

interface RouteProps {
  params: Promise<{ id: string }>;
}

export async function GET(req: Request, { params }: RouteProps) {
  try {
    const tenant = await getAddinTenantContext(req);
    const { id } = await params;

    const caseItem = await getCaseById(tenant, id);
    if (!caseItem) {
      return NextResponse.json(
        {
          success: false,
          error: "NOT_FOUND",
          message: `Akte '${id}' nicht gefunden.`,
        },
        { status: 404 }
      );
    }

    assertTenantOwnership(caseItem.organizationId, tenant);

    // Check approved documents
    const documents = await getDocumentsForCase(tenant, id);
    const approvedDocs = documents.filter(
      (d) => d.workflowStatus === "APPROVED" || d.workflowStatus === "DRAFT_READY"
    );
    const hasApprovedData = approvedDocs.length > 0 || caseItem.status === "READY_FOR_NOTARIZATION";

    // Format fields with verification flags
    const isVerified = hasApprovedData;

    const parties = (caseItem.parties || []).map((p, idx) => ({
      index: idx + 1,
      name: p.name || "",
      role: p.role || "",
      address: p.address || "",
      taxId: p.taxId || "",
      birthDate: p.birthDate || "",
      maritalStatus: p.maritalStatus || "",
      isVerified,
    }));

    const property = {
      district: caseItem.propertyDetails?.landRegistryDistrict || "",
      sheetNumber: caseItem.propertyDetails?.sheetNumber || "",
      parcelNumber: caseItem.propertyDetails?.parcelNumber || "",
      areaSqm: caseItem.propertyDetails?.areaSqm != null ? `${caseItem.propertyDetails.areaSqm} m²` : "",
      economicUse: caseItem.propertyDetails?.economicUse || "",
      isVerified,
    };

    const financials = {
      dealValue:
        caseItem.financials?.dealValue != null
          ? `${caseItem.financials.dealValue.toLocaleString("de-DE")} ${caseItem.financials.currency || "EUR"}`
          : "",
      dealValueRaw: caseItem.financials?.dealValue ?? null,
      currency: caseItem.financials?.currency || "EUR",
      dueDate: caseItem.financials?.paymentDueDate || "",
      encumbrances: caseItem.financials?.existingEncumbrances || "",
      isVerified,
    };

    const metadata = {
      caseNumber: caseItem.caseNumber,
      title: caseItem.title,
      matterType: caseItem.matterType,
      matterTypeLabel: matterTypeLabels[caseItem.matterType] || caseItem.matterType,
      status: caseItem.status,
      statusLabel: caseStatusLabels[caseItem.status] || caseItem.status,
      notaryName: caseItem.notaryName || "Noch nicht zugewiesen",
      assignedClerk: caseItem.assignedClerk || "Offen",
      targetDate: caseItem.targetDate
        ? new Date(caseItem.targetDate).toLocaleString("de-DE", {
            dateStyle: "medium",
            timeStyle: "short",
          }) + " Uhr"
        : "",
      targetDateIso: caseItem.targetDate || null,
      description: caseItem.description || "",
      isVerified,
    };

    return NextResponse.json({
      success: true,
      case: caseItem,
      data: {
        metadata,
        parties,
        property,
        financials,
        specialDetails: caseItem.specialDetails || {},
        verification: {
          hasApprovedExtraction: approvedDocs.length > 0,
          approvedDocumentsCount: approvedDocs.length,
          status: caseItem.status,
          isAuthoritative: isVerified,
        },
      },
    });
  } catch (err: unknown) {
    if (err instanceof TenantIsolationError) {
      return NextResponse.json({ success: false, error: "FORBIDDEN", message: "Zugriff auf diese Akte verweigert." }, { status: 403 });
    }
    if (err instanceof AuthenticationRequiredError) {
      return NextResponse.json({ success: false, error: "UNAUTHORIZED", message: "Bitte melden Sie sich erneut an." }, { status: 401 });
    }
    const message = "Fehler beim Laden der Akte. Bitte versuchen Sie es erneut.";
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
