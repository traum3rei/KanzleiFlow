import type { PrismaClient } from "@/generated/prisma/client";
import { PORTFOLIO_DEMO as demo } from "@/lib/auth/demo";

/** Explicit, additive setup. Existing identities or memberships are never overwritten. */
export async function provisionPortfolioDemo(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.findUnique({ where: { id: demo.organizationId }, include: { members: true } });
    const user = await tx.user.findUnique({ where: { id: demo.userId }, include: { memberships: true } });
    if (organization || user) {
      if (!organization || !user || organization.slug !== demo.organizationSlug || organization.name !== demo.organizationName || user.email !== demo.email || user.memberships.length !== 1 || organization.members.length !== 1 || organization.members[0].userId !== demo.userId || user.memberships[0].organizationId !== demo.organizationId || user.memberships[0].role !== "CLERK") {
        throw new Error("Demo-Kennung bereits anderweitig belegt. Keine bestehenden Datensätze verändert.");
      }
      return;
    }
    await tx.organization.create({ data: { id: demo.organizationId, slug: demo.organizationSlug, name: demo.organizationName } });
    await tx.user.create({ data: { id: demo.userId, email: demo.email, fullName: demo.fullName } });
    await tx.organizationMember.create({ data: { organizationId: demo.organizationId, userId: demo.userId, role: "CLERK" } });
    await tx.case.createMany({ data: [
      { caseNumber: "DEMO-001", title: "Fiktives Immobilienbeispiel", matterType: "REAL_ESTATE" as const },
      { caseNumber: "DEMO-002", title: "Fiktives Nachlassbeispiel", matterType: "INHERITANCE" as const },
      { caseNumber: "DEMO-003", title: "Fiktives Gesellschaftsbeispiel", matterType: "CORPORATE" as const },
    ].map((record) => ({ ...record, organizationId: demo.organizationId, createdById: demo.userId, description: "Synthetischer Datensatz der Portfolio-Demo. Keine echten Personen oder Rechtsgeschäfte." })) });
  });
}
