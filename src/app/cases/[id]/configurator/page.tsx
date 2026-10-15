import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getTenantContextOrRedirect } from "@/lib/auth/tenant";
import { getCaseById } from "@/lib/services/case-service";
import { testDatabaseConnection } from "@/lib/db";
import { Navigation } from "@/components/navigation";
import {
  listConfigurationsForCase,
  createConfiguration,
  getConfigurationById,
  prefillConfigurationFromApprovedCase,
} from "@/lib/configurator/configurator-service";
import { ConfiguratorWizard } from "./configurator-wizard";
import { DocumentConfigurationData } from "@/lib/configurator/types";

export const instant = false;

interface ConfiguratorPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ configId?: string; prefill?: string }>;
}

export default async function ConfiguratorPage({
  params,
  searchParams,
}: ConfiguratorPageProps) {
  await connection();
  const { id } = await params;
  const { configId, prefill } = await searchParams;

  const tenant = await getTenantContextOrRedirect();
  const dbStatus = await testDatabaseConnection();

  const caseItem = await getCaseById(tenant, id);
  if (!caseItem) {
    notFound();
  }

  // Check if case has approved documents
  const prisma = (await import("@/lib/db")).getPrismaClient();
  const approvedDocs = prisma
    ? await prisma.document.findMany({
        where: {
          caseId: id,
          organizationId: tenant.organizationId,
          workflowStatus: { in: ["APPROVED", "DRAFT_READY"] },
        },
      })
    : [];
  const hasApprovedExtraction = approvedDocs.length > 0;

  // Resolve or create configuration
  let targetConfigId = configId;

  if (!targetConfigId) {
    const existingConfigs = await listConfigurationsForCase(tenant, id);
    if (existingConfigs.length > 0) {
      targetConfigId = existingConfigs[0].id;
    } else {
      // Create new configuration
      if (prefill === "true" && hasApprovedExtraction) {
        const prefilled = await prefillConfigurationFromApprovedCase(tenant, id);
        targetConfigId = prefilled.id;
      } else {
        const created = await createConfiguration(tenant, id);
        targetConfigId = created.id;
      }
    }
  }

  const config = await getConfigurationById(tenant, targetConfigId);
  const formData = config.formData as unknown as DocumentConfigurationData;

  const generatedVersions = config.generatedVersions.map((v) => ({
    id: v.id,
    version: v.version,
    templateVersionString: v.templateVersionString,
    title: v.title,
    createdAt: v.createdAt,
  }));

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 flex flex-col font-mono tracking-tight">
      <Navigation dbConnected={dbStatus.connected} tenant={tenant} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Breadcrumb Navigation */}
        <div className="flex items-center justify-between">
          <nav className="flex items-center space-x-2 text-xs text-zinc-500 dark:text-zinc-400">
            <Link href="/" className="hover:text-zinc-900 dark:hover:text-white transition">
              Übersicht
            </Link>
            <span>/</span>
            <Link href="/cases" className="hover:text-zinc-900 dark:hover:text-white transition">
              Akten
            </Link>
            <span>/</span>
            <Link
              href={`/cases/${caseItem.id}`}
              className="text-zinc-900 dark:text-white font-bold bg-zinc-200/60 dark:bg-zinc-800 px-2 py-0.5 rounded-[2px]"
            >
              {caseItem.caseNumber}
            </Link>
            <span>/</span>
            <span className="text-zinc-900 dark:text-zinc-100 font-bold uppercase">
              Dokument-Konfigurator
            </span>
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href={`/cases/${caseItem.id}`}
              className="px-3 py-1.5 rounded-[4px] border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-xs font-mono text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
            >
              ← Zurück zur Akte
            </Link>
          </div>
        </div>

        {/* Multi-Step Configurator Wizard */}
        <ConfiguratorWizard
          caseId={caseItem.id}
          caseNumber={caseItem.caseNumber}
          caseTitle={caseItem.title}
          configurationId={config.id}
          initialData={formData}
          initialStep={config.step || 1}
          initialStatus={config.status}
          initialVersion={config.version || 1}
          generatedVersions={generatedVersions}
          hasApprovedExtraction={hasApprovedExtraction}
        />
      </main>
    </div>
  );
}
