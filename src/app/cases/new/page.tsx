import Link from "next/link";
import { connection } from "next/server";
import { getAvailableAssignees } from "@/lib/services/case-service";
import { CaseForm } from "./case-form";
import { Navigation } from "@/components/navigation";
import { testDatabaseConnection } from "@/lib/db";
import { getTenantContextOrRedirect } from "@/lib/auth/tenant";

export const instant = false;

interface NewCasePageProps {
  searchParams: Promise<{
    preset?: string;
  }>;
}

export default async function NewCasePage({ searchParams }: NewCasePageProps) {
  await connection();
  const resolvedSearchParams = await searchParams;

  const tenant = await getTenantContextOrRedirect();
  const [dbStatus, assignees] = await Promise.all([testDatabaseConnection(), getAvailableAssignees(tenant)]);

  return (
    <div className="app-shell min-h-screen bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 flex flex-col font-sans">
      <Navigation dbConnected={dbStatus.connected} tenant={tenant} />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Breadcrumb & Title */}
        <div className="space-y-1.5 pb-2 border-b border-zinc-200 dark:border-zinc-800">
          <nav className="flex items-center space-x-2 text-sm text-zinc-500 dark:text-zinc-400">
            <Link prefetch={true} href="/" className="hover:text-zinc-900 dark:hover:text-white transition">
              Übersicht
            </Link>
            <span>/</span>
            <Link prefetch={true} href="/cases" className="hover:text-zinc-900 dark:hover:text-white transition">
              Aktenverwaltung
            </Link>
            <span>/</span>
            <span className="font-semibold text-zinc-900 dark:text-white">
              Neue Akte anlegen
            </span>
          </nav>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white pt-1">
            Neues Urkundsgeschäft anlegen
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Erfassung für {tenant.organizationName}
          </p>
        </div>

        {/* Form */}
        <CaseForm initialPreset={resolvedSearchParams.preset} assignees={assignees} />
      </main>
    </div>
  );
}
