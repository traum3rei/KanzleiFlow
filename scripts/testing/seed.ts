import { getPrismaClient, getRawPgPool } from "../../src/lib/db";
import { provisionPortfolioDemo } from "../../src/lib/services/portfolio-demo";
const prisma = getPrismaClient();
if (!prisma || process.env.KANZLEIFLOW_TEST_RUN !== "isolated") throw new Error("Isolated test runner required.");
async function main() {
  await provisionPortfolioDemo(prisma!);
  await prisma!.organization.create({ data: { id: "org_notariat_weiss_01", name: "Synthetisches Testnotariat A", slug: "notariat-weiss-partner" } });
  await prisma!.user.create({ data: { id: "usr_notary_weiss_01", email: "j.weiss@notariat-weiss-partner.de", fullName: "Testnotar A" } });
  await prisma!.organizationMember.create({ data: { organizationId: "org_notariat_weiss_01", userId: "usr_notary_weiss_01", role: "NOTARY" } });
  await prisma!.case.createMany({ data: Array.from({ length: 28 }, (_, index) => ({
    id: `e2e_case_${index}`, organizationId: "org_notariat_weiss_01", caseNumber: `E2E-2026-${index}`,
    title: index === 0 ? "E2E Dokumentenablauf" : index === 1 ? "E2E Konfigurator" : `E2E Pagination ${index}`,
    matterType: "REAL_ESTATE", status: "DRAFT", createdById: "usr_notary_weiss_01",
  })) });
  await prisma!.organization.create({ data: { id: "org_e2e_b", name: "Synthetisches Testnotariat B", slug: "e2e-notariat-b" } });
  await prisma!.user.create({ data: { id: "usr_e2e_b", email: "b@example.test", fullName: "Testnotar B" } });
  await prisma!.organizationMember.create({ data: { organizationId: "org_e2e_b", userId: "usr_e2e_b", role: "NOTARY" } });
  await prisma!.case.create({ data: { id: "e2e_foreign_case", organizationId: "org_e2e_b", caseNumber: "FOREIGN-1", title: "Fremde vertrauliche Testakte", matterType: "REAL_ESTATE" } });
}
main().finally(async () => { await prisma.$disconnect(); await getRawPgPool()?.end(); });
