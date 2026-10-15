import { getPrismaClient } from "@/lib/db";
import { TenantContext, assertTenantOwnership, TenantIsolationError } from "@/lib/auth/tenant";
import { deleteFile, deleteDraftDocx } from "@/lib/storage";
import {
  CreateCaseInput,
  CaseStatus,
  MatterType,
  Party,
  PropertyDetailsInput,
  FinancialDetailsInput,
  SpecialDetailsInput,
} from "@/lib/validations/case";

export class CaseNotFoundError extends Error {
  constructor(caseId: string) {
    super(`Akte mit ID '${caseId}' nicht gefunden.`);
    this.name = "CaseNotFoundError";
  }
}

export interface CaseRecord {
  id: string;
  organizationId: string;
  caseNumber: string;
  title: string;
  matterType: MatterType;
  status: CaseStatus;
  description?: string | null;
  notaryName?: string | null;
  assignedClerk?: string | null;
  targetDate?: string | null;
  parties: Party[];
  propertyDetails?: PropertyDetailsInput | null;
  financials?: FinancialDetailsInput | null;
  specialDetails?: SpecialDetailsInput | null;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardStats {
  totalCases: number;
  readyForNotarization: number;
  inReview: number;
  completed: number;
  drafts: number;
  recentCases: CaseRecord[];
}

// Initial synthetic demo records for Milestone 1 preview
const INITIAL_DEMO_CASES: CaseRecord[] = [
  {
    id: "case_demo_01",
    organizationId: "org_notariat_weiss_01",
    caseNumber: "2026-UR-0142",
    title: "Kaufvertrag Grundstück Flur 14, Gemarkung Schwabing",
    matterType: "REAL_ESTATE",
    status: "READY_FOR_NOTARIZATION",
    description: "Kaufvertrag über ein unbebautes Wohngrundstück (850 m²). Kaufpreis 1.850.000 EUR. Grundschuldbestellung der Käuferbank vorliegend.",
    notaryName: "Dr. Johannes Weiss",
    assignedClerk: "Stefanie Bauer",
    targetDate: "2026-10-18T10:00:00.000Z",
    parties: [
      {
        role: "Verkäuferin",
        name: "Dr. Barbara Lindner",
        address: "Königinstr. 12, 80539 München",
        birthDate: "1974-05-14",
        taxId: "12 345 678 901",
        email: "b.lindner@example.de",
        phone: "+49 89 210200",
      },
      {
        role: "Käufer",
        name: "Maximilian Huber",
        address: "Leopoldstr. 45, 80802 München",
        birthDate: "1988-11-23",
        taxId: "98 765 432 109",
        email: "m.huber@example.de",
        phone: "+49 89 381920",
      },
      { role: "Gläubigerin", name: "Bayerische Landesbank", address: "Brienner Str. 1, 80333 München" },
    ],
    propertyDetails: {
      landRegistryDistrict: "Schwabing",
      sheetNumber: "4521",
      parcelNumber: "Flur 14, Flurstück 88/2",
      areaSqm: 850,
      economicUse: "Wohnbaufläche",
    },
    financials: {
      dealValue: 1850000,
      currency: "EUR",
      paymentDueDate: "2026-11-15",
      existingEncumbrances: "Abt. II: Geh- und Fahrtrecht zugunsten Flurstück 88/1. Abt. III: Grundschuld 1.200.000 EUR für Bayerische Landesbank.",
    },
    createdAt: "2026-10-01T08:30:00.000Z",
    updatedAt: "2026-10-10T14:20:00.000Z",
  },
  {
    id: "case_demo_02",
    organizationId: "org_notariat_weiss_01",
    caseNumber: "2026-UR-0143",
    title: "Erbscheinsantrag nach Karoline Freifrau von Stauffen",
    matterType: "INHERITANCE",
    status: "IN_REVIEW",
    description: "Gesetzliche Erbfolge. Drei Miterben zu gleichen Teilen. Vorprüfung des Familienstammbaums und Sterbeurkunde läuft.",
    notaryName: "Dr. Johannes Weiss",
    assignedClerk: "Michael Köhler",
    targetDate: "2026-10-22T14:30:00.000Z",
    parties: [
      { role: "Erblasserin", name: "Karoline Freifrau von Stauffen (†)", address: "Schlossallee 4, 82319 Starnberg" },
      { role: "Antragsteller / Erbe", name: "Felix von Stauffen", address: "Ludwigstr. 18, 80539 München", taxId: "44 556 778 990", birthDate: "1982-03-12" },
    ],
    specialDetails: {
      deceasedDate: "2026-08-12",
    },
    createdAt: "2026-10-04T09:15:00.000Z",
    updatedAt: "2026-10-09T11:45:00.000Z",
  },
  {
    id: "case_demo_03",
    organizationId: "org_notariat_weiss_01",
    caseNumber: "2026-UR-0144",
    title: "Gründung AlpinTech Solutions GmbH & Gesellschafterliste",
    matterType: "CORPORATE",
    status: "DRAFT",
    description: "Bargründung mit Stammkapital 50.000 EUR. Zwei Gründungsgesellschafter mit Musterprotokoll-Abweichung bezüglich Vorerwerbsrechten.",
    notaryName: "Dr. Johannes Weiss",
    assignedClerk: "Stefanie Bauer",
    targetDate: "2026-10-25T11:00:00.000Z",
    parties: [
      { role: "Gründerin", name: "Laura Bergmann", address: "Maximilianstr. 22, 80539 München", taxId: "19 283 746 501" },
      { role: "Gründer", name: "David Sommer", address: "Sendlinger Str. 9, 80331 München", taxId: "82 736 451 920" },
    ],
    specialDetails: {
      commercialRegister: "HRB 294819",
      registerCourt: "Amtsgericht München",
      shareCapital: 50000,
    },
    createdAt: "2026-10-08T13:00:00.000Z",
    updatedAt: "2026-10-08T13:00:00.000Z",
  },
  {
    id: "case_demo_04",
    organizationId: "org_notariat_weiss_01",
    caseNumber: "2026-UR-0139",
    title: "General- und Vorsorgevollmacht Eheleute Weber",
    matterType: "POWER_OF_ATTORNEY",
    status: "NOTARIZED",
    description: "Umfassende vermögensrechtliche und persönliche Vorsorgevollmacht nebst Patientenverfügung und Meldung an das Zentrale Vorsorgeregister (ZVR).",
    notaryName: "Dr. Johannes Weiss",
    assignedClerk: "Michael Köhler",
    targetDate: "2026-10-05T09:00:00.000Z",
    parties: [
      { role: "Vollmachtgeber 1", name: "Heinrich Weber", address: "Prinzregentenstr. 54, 81675 München" },
      { role: "Vollmachtgeberin 2", name: "Margarete Weber", address: "Prinzregentenstr. 54, 81675 München" },
    ],
    createdAt: "2026-09-28T10:00:00.000Z",
    updatedAt: "2026-10-05T10:15:00.000Z",
  },
  {
    id: "case_demo_05",
    organizationId: "org_notariat_weiss_01",
    caseNumber: "2026-UR-0130",
    title: "Kaufvertrag Eigentumswohnung Leopoldstraße 84",
    matterType: "REAL_ESTATE",
    status: "COMPLETED",
    description: "3-Zimmer-Wohnung mit Tiefgaragenstellplatz. Vollzugsmeldung an Grundbuchamt abgeschlossen, Eigentumsumschreibung erfolgt.",
    notaryName: "Dr. Johannes Weiss",
    assignedClerk: "Stefanie Bauer",
    targetDate: "2026-09-15T15:00:00.000Z",
    parties: [
      { role: "Verkäufer", name: "Jonas Eder", address: "Leopoldstr. 84, 80802 München" },
      { role: "Käuferin", name: "Dr. Sarah Richter", address: "Balanstr. 14, 81669 München" },
    ],
    createdAt: "2026-09-01T11:00:00.000Z",
    updatedAt: "2026-09-30T16:00:00.000Z",
  },
];

// Fallback in-memory storage for preview before Supabase migration is applied
const memoryCasesStore: Map<string, CaseRecord> = new Map(
  INITIAL_DEMO_CASES.map((c) => [c.id, { ...c }])
);

/**
 * Ensures the organization exists in PostgreSQL before creating relations.
 */
async function ensureOrganizationExists(prisma: ReturnType<typeof getPrismaClient>, tenant: TenantContext) {
  if (!prisma) return;
  try {
    await prisma.organization.upsert({
      where: { id: tenant.organizationId },
      update: { name: tenant.organizationName },
      create: {
        id: tenant.organizationId,
        slug: tenant.organizationSlug,
        name: tenant.organizationName,
        jurisdiction: tenant.jurisdiction,
      },
    });

    if (tenant.userId) {
      await prisma.user.upsert({
        where: { id: tenant.userId },
        update: { fullName: tenant.userName, email: tenant.userEmail },
        create: {
          id: tenant.userId,
          fullName: tenant.userName,
          email: tenant.userEmail,
        },
      });

      await prisma.organizationMember.upsert({
        where: {
          organizationId_userId: {
            organizationId: tenant.organizationId,
            userId: tenant.userId,
          },
        },
        update: { role: tenant.userRole },
        create: {
          organizationId: tenant.organizationId,
          userId: tenant.userId,
          role: tenant.userRole,
        },
      });
    }
  } catch (err) {
    console.warn("Could not upsert organization/user in DB, may not have migrated yet:", err);
  }
}


/**
 * Helper to unpack extended metadata from partiesSummary JSON.
 */
export function unpackCaseMetadata(summary: unknown): {
  parties: Party[];
  propertyDetails: PropertyDetailsInput | null;
  financials: FinancialDetailsInput | null;
  specialDetails: SpecialDetailsInput | null;
} {
  if (!summary) {
    return { parties: [], propertyDetails: null, financials: null, specialDetails: null };
  }

  if (Array.isArray(summary)) {
    return {
      parties: summary as Party[],
      propertyDetails: null,
      financials: null,
      specialDetails: null,
    };
  }

  if (typeof summary === "object") {
    const rec = summary as Record<string, unknown>;
    return {
      parties: Array.isArray(rec.parties) ? (rec.parties as Party[]) : [],
      propertyDetails: (rec.propertyDetails as PropertyDetailsInput) || null,
      financials: (rec.financials as FinancialDetailsInput) || null,
      specialDetails: (rec.specialDetails as SpecialDetailsInput) || null,
    };
  }

  return { parties: [], propertyDetails: null, financials: null, specialDetails: null };
}

export interface CaseFilters {
  status?: CaseStatus;
  search?: string;
  take?: number;
  skip?: number;
  cursor?: string;
}

/**
 * Retrieve cases scoped to the tenant with bounded pagination.
 */
export async function getCases(
  tenant: TenantContext,
  filters?: CaseFilters
): Promise<CaseRecord[]> {
  const prisma = getPrismaClient();

  if (prisma) {
    try {
      const takeLimit = filters?.take ? Math.min(filters.take, 200) : 100;
      const dbCases = await prisma.case.findMany({
        where: {
          organizationId: tenant.organizationId,
          ...(filters?.status ? { status: filters.status } : {}),
          ...(filters?.search
            ? {
                OR: [
                  { caseNumber: { contains: filters.search, mode: "insensitive" } },
                  { title: { contains: filters.search, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        take: takeLimit,
        ...(filters?.skip ? { skip: filters.skip } : {}),
        ...(filters?.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
      });

      if (dbCases.length > 0) {
        return dbCases.map((c) => {
          const meta = unpackCaseMetadata(c.partiesSummary);
          return {
            id: c.id,
            organizationId: c.organizationId,
            caseNumber: c.caseNumber,
            title: c.title,
            matterType: c.matterType as MatterType,
            status: c.status as CaseStatus,
            description: c.description,
            notaryName: c.notaryName,
            assignedClerk: c.assignedClerk,
            targetDate: c.targetDate ? c.targetDate.toISOString() : null,
            parties: meta.parties,
            propertyDetails: meta.propertyDetails,
            financials: meta.financials,
            specialDetails: meta.specialDetails,
            createdAt: c.createdAt.toISOString(),
            updatedAt: c.updatedAt.toISOString(),
          };
        });
      }
    } catch (err) {
      console.warn("Database query failed (schema might not be migrated yet), falling back to demo store:", err);
    }
  }

  // Tenant-scoped fallback
  let cases = Array.from(memoryCasesStore.values()).filter(
    (c) => c.organizationId === tenant.organizationId
  );

  if (filters?.status) {
    cases = cases.filter((c) => c.status === filters.status);
  }

  if (filters?.search) {
    const q = filters.search.toLowerCase();
    cases = cases.filter(
      (c) =>
        c.caseNumber.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q)
    );
  }

  return cases.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Retrieve a single case by ID with strict tenant authorization.
 */
export async function getCaseById(
  tenant: TenantContext,
  id: string
): Promise<CaseRecord | null> {
  const prisma = getPrismaClient();

  if (prisma) {
    try {
      const c = await prisma.case.findUnique({
        where: { id },
      });

      if (c) {
        assertTenantOwnership(c.organizationId, tenant);
        const meta = unpackCaseMetadata(c.partiesSummary);
        return {
          id: c.id,
          organizationId: c.organizationId,
          caseNumber: c.caseNumber,
          title: c.title,
          matterType: c.matterType as MatterType,
          status: c.status as CaseStatus,
          description: c.description,
          notaryName: c.notaryName,
          assignedClerk: c.assignedClerk,
          targetDate: c.targetDate ? c.targetDate.toISOString() : null,
          parties: meta.parties,
          propertyDetails: meta.propertyDetails,
          financials: meta.financials,
          specialDetails: meta.specialDetails,
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
        };
      }
    } catch (err) {
      if (err instanceof TenantIsolationError || (err as Error)?.name === "TenantIsolationError") {
        throw err;
      }
      console.warn("DB findUnique failed, checking memory store:", err);
    }
  }

  const memoryCase = memoryCasesStore.get(id);
  if (!memoryCase) {
    return null;
  }

  assertTenantOwnership(memoryCase.organizationId, tenant);
  return memoryCase;
}

/**
 * Create a new case strictly scoped to the tenant.
 */
export async function createCase(
  tenant: TenantContext,
  input: CreateCaseInput
): Promise<CaseRecord> {
  const prisma = getPrismaClient();

  const metadataPayload = {
    parties: input.parties,
    propertyDetails: input.propertyDetails || null,
    financials: input.financials || null,
    specialDetails: input.specialDetails || null,
  };

  if (prisma) {
    try {
      await ensureOrganizationExists(prisma, tenant);

      const created = await prisma.case.create({
        data: {
          organizationId: tenant.organizationId,
          caseNumber: input.caseNumber,
          title: input.title,
          matterType: input.matterType,
          status: input.status,
          description: input.description,
          notaryName: input.notaryName || tenant.userName,
          assignedClerk: input.assignedClerk,
          targetDate: input.targetDate ? new Date(input.targetDate) : null,
          partiesSummary: metadataPayload,
        },
      });

      // Audit log creation
      try {
        await prisma.auditEvent.create({
          data: {
            organizationId: tenant.organizationId,
            userId: tenant.userId,
            action: "CASE_CREATED",
            entityType: "Case",
            entityId: created.id,
            metadata: {
              caseNumber: created.caseNumber,
              title: created.title,
            },
          },
        });
      } catch (auditErr) {
        console.warn("Could not log audit event:", auditErr);
      }

      return {
        id: created.id,
        organizationId: created.organizationId,
        caseNumber: created.caseNumber,
        title: created.title,
        matterType: created.matterType as MatterType,
        status: created.status as CaseStatus,
        description: created.description,
        notaryName: created.notaryName,
        assignedClerk: created.assignedClerk,
        targetDate: created.targetDate ? created.targetDate.toISOString() : null,
        parties: input.parties,
        propertyDetails: input.propertyDetails || null,
        financials: input.financials || null,
        specialDetails: input.specialDetails || null,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      };
    } catch (err) {
      console.warn("Prisma case creation failed, falling back to memory store:", err);
    }
  }

  // Memory fallback
  const newCaseId = `case_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  const record: CaseRecord = {
    id: newCaseId,
    organizationId: tenant.organizationId,
    caseNumber: input.caseNumber,
    title: input.title,
    matterType: input.matterType,
    status: input.status,
    description: input.description || null,
    notaryName: input.notaryName || tenant.userName,
    assignedClerk: input.assignedClerk || null,
    targetDate: input.targetDate || null,
    parties: input.parties,
    propertyDetails: input.propertyDetails || null,
    financials: input.financials || null,
    specialDetails: input.specialDetails || null,
    createdAt: now,
    updatedAt: now,
  };

  memoryCasesStore.set(newCaseId, record);
  return record;
}

export async function getCaseStatusCounts(tenant: TenantContext): Promise<Record<string, number>> {
  const prisma = getPrismaClient();
  const counts: Record<string, number> = {
    ALL: 0,
    DRAFT: 0,
    IN_REVIEW: 0,
    READY_FOR_NOTARIZATION: 0,
    NOTARIZED: 0,
    COMPLETED: 0,
    ARCHIVED: 0,
  };

  if (prisma) {
    try {
      const grouped = await prisma.case.groupBy({
        by: ["status"],
        where: { organizationId: tenant.organizationId },
        _count: { _all: true },
      });

      let total = 0;
      for (const g of grouped) {
        if (counts[g.status] !== undefined) {
          counts[g.status] = g._count._all;
          total += g._count._all;
        }
      }
      counts.ALL = total;
      return counts;
    } catch (err) {
      console.warn("Database groupBy failed, falling back to memory store:", err);
    }
  }

  // Memory store fallback
  const allCases = Array.from(memoryCasesStore.values()).filter(
    (c) => c.organizationId === tenant.organizationId
  );
  counts.ALL = allCases.length;
  for (const c of allCases) {
    if (counts[c.status] !== undefined) {
      counts[c.status] += 1;
    }
  }
  return counts;
}

/**
 * Aggregates dashboard metrics for the tenant efficiently.
 */
export async function getDashboardStats(tenant: TenantContext): Promise<DashboardStats> {
  const prisma = getPrismaClient();

  if (prisma) {
    try {
      const [counts, recentCases] = await Promise.all([
        getCaseStatusCounts(tenant),
        getCases(tenant, { take: 5 }),
      ]);

      return {
        totalCases: counts.ALL,
        readyForNotarization: counts.READY_FOR_NOTARIZATION,
        inReview: counts.IN_REVIEW,
        completed: counts.COMPLETED + counts.NOTARIZED,
        drafts: counts.DRAFT,
        recentCases,
      };
    } catch (err) {
      console.warn("getDashboardStats DB aggregation failed, checking fallback:", err);
    }
  }

  const allCases = Array.from(memoryCasesStore.values()).filter(
    (c) => c.organizationId === tenant.organizationId
  );
  return {
    totalCases: allCases.length,
    readyForNotarization: allCases.filter((c) => c.status === "READY_FOR_NOTARIZATION").length,
    inReview: allCases.filter((c) => c.status === "IN_REVIEW").length,
    completed: allCases.filter((c) => c.status === "COMPLETED" || c.status === "NOTARIZED").length,
    drafts: allCases.filter((c) => c.status === "DRAFT").length,
    recentCases: allCases.slice(0, 5),
  };
}

/**
 * Delete a case along with its documents, drafts, and physical files with strict tenant isolation.
 */
export async function deleteCase(
  tenant: TenantContext,
  caseId: string
): Promise<void> {
  const prisma = getPrismaClient();

  if (prisma) {
    const targetCase = await prisma.case.findUnique({
      where: { id: caseId },
      include: {
        documents: true,
        drafts: true,
      },
    });

    if (!targetCase) {
      // Fallback check memory store
      if (memoryCasesStore.has(caseId)) {
        const memoryCase = memoryCasesStore.get(caseId)!;
        assertTenantOwnership(tenant, memoryCase.organizationId);
        memoryCasesStore.delete(caseId);
        return;
      }
      throw new CaseNotFoundError(caseId);
    }

    assertTenantOwnership(tenant, targetCase.organizationId);

    // 1. Clean up physical document files from disk / storage
    for (const doc of targetCase.documents) {
      try {
        await deleteFile(doc.storagePath);
      } catch (err) {
        console.warn(`Could not delete storage file for document ${doc.id}:`, err);
      }
    }

    // 2. Clean up physical generated draft DOCX files from disk / storage
    for (const draft of targetCase.drafts) {
      try {
        await deleteDraftDocx(tenant.organizationId, draft.id, draft.version);
      } catch (err) {
        console.warn(`Could not delete draft file for draft ${draft.id}:`, err);
      }
    }

    // 3. Delete case in database (cascades to documents, extractionResults, generatedDrafts)
    await prisma.case.delete({
      where: { id: caseId },
    });

    // Also remove from memory store if present
    memoryCasesStore.delete(caseId);

    // 4. Audit log the deletion
    try {
      await prisma.auditEvent.create({
        data: {
          organizationId: tenant.organizationId,
          userId: tenant.userId,
          action: "CASE_DELETED",
          entityType: "Case",
          entityId: caseId,
          metadata: {
            caseNumber: targetCase.caseNumber,
            title: targetCase.title,
            deletedDocumentsCount: targetCase.documents.length,
            deletedDraftsCount: targetCase.drafts.length,
          },
        },
      });
    } catch (auditErr) {
      console.warn("Audit-Log für Case-Delete fehlgeschlagen:", auditErr);
    }

    return;
  }

  // Pure memory fallback
  const memoryCase = memoryCasesStore.get(caseId);
  if (!memoryCase) {
    throw new CaseNotFoundError(caseId);
  }
  assertTenantOwnership(tenant, memoryCase.organizationId);
  memoryCasesStore.delete(caseId);
}

