import { describe, expect, it, vi, afterEach } from "vitest";
import { getPrismaClient } from "@/lib/db";
import { provisionPortfolioDemo } from "./portfolio-demo";
import { PORTFOLIO_DEMO, PORTFOLIO_DEMOS } from "@/lib/auth/demo";
import { resolveTenantContextFromUser } from "@/lib/auth/tenant";

afterEach(() => vi.unstubAllEnvs());
describe("dedicated demo tenant", () => {
  it("can be provisioned repeatedly without overwriting edited demo cases", async () => {
    const prisma = getPrismaClient()!;
    await provisionPortfolioDemo(prisma);
    const before = await prisma.case.findMany({ where: { organizationId: PORTFOLIO_DEMO.organizationId }, orderBy: { id: "asc" } });
    await provisionPortfolioDemo(prisma);
    expect(await prisma.case.findMany({ where: { organizationId: PORTFOLIO_DEMO.organizationId }, orderBy: { id: "asc" } })).toEqual(before);
  });
  it("refuses a privileged existing identity without silently changing it", async () => {
    const prisma = getPrismaClient()!;
    const where = { organizationId: PORTFOLIO_DEMO.organizationId, userId: PORTFOLIO_DEMO.userId };
    await prisma.organizationMember.updateMany({ where, data: { role: "ADMIN" } });
    try {
      await expect(provisionPortfolioDemo(prisma)).rejects.toThrow(/Keine bestehenden Datensätze verändert/);
      expect((await prisma.organizationMember.findFirst({ where }))!.role).toBe("ADMIN");
    } finally {
      await prisma.organizationMember.updateMany({ where, data: { role: "CLERK" } });
    }
  });
  it("keeps both public demo identities and cases isolated", async () => {
    const prisma = getPrismaClient()!;
    await Promise.all([provisionPortfolioDemo(prisma), provisionPortfolioDemo(prisma)]);
    for (const demo of PORTFOLIO_DEMOS) {
      const session = { userId: demo.userId, email: demo.email, fullName: demo.fullName, demoOrganizationId: demo.organizationId, issuedAt: Date.now(), expiresAt: Date.now() + 10000 };
      const tenant = await resolveTenantContextFromUser(session, demo.organizationId);
      expect(tenant.organizationId).toBe(demo.organizationId);
      expect(tenant.availableOrganizations).toHaveLength(1);
      const other = PORTFOLIO_DEMOS.find((entry) => entry.organizationId !== demo.organizationId)!;
      await expect(resolveTenantContextFromUser(session, other.organizationId)).rejects.toThrow(/Demo-Zugriff/);
      expect(await prisma.case.count({ where: { organizationId: demo.organizationId } })).toBe(3);
    }
  });
  it("pins signed demo sessions to the synthetic organization and clerk role", async () => {
    vi.stubEnv("ENABLE_DEMO_LOGIN", "true");
    const session = { userId: PORTFOLIO_DEMO.userId, email: PORTFOLIO_DEMO.email, fullName: "Demo-Gast", demoOrganizationId: PORTFOLIO_DEMO.organizationId, issuedAt: Date.now(), expiresAt: Date.now() + 10000 };
    const tenant = await resolveTenantContextFromUser(session, PORTFOLIO_DEMO.organizationId);
    expect(tenant.userRole).toBe("CLERK"); expect(tenant.isDemoMode).toBe(true);
    expect(tenant.availableOrganizations).toHaveLength(1);
    await expect(resolveTenantContextFromUser(session, "org_notariat_weiss_01")).rejects.toThrow(/Demo-Zugriff/);
    vi.stubEnv("ENABLE_DEMO_LOGIN", "false");
    await expect(resolveTenantContextFromUser(session)).rejects.toThrow(/Demo-Zugriff/);
  });
});
