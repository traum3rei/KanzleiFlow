import { Suspense } from "react";
import { connection } from "next/server";
import { Navigation } from "@/components/navigation";
import { getTenantContextOrRedirect } from "@/lib/auth/tenant";
import { testDatabaseConnection } from "@/lib/db";

async function WorkspaceNavigation() {
  await connection();
  const [tenant, health] = await Promise.all([getTenantContextOrRedirect(), testDatabaseConnection()]);
  return <Navigation tenant={tenant} dbConnected={health.connected} />;
}

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <div className="app-shell min-h-screen flex flex-col text-zinc-900 dark:text-zinc-100">
    <Suspense fallback={<header aria-busy="true" aria-label="Navigation wird geladen" className="h-16 shrink-0 border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="max-w-7xl h-full mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-3">
        <span className="w-9 h-9 rounded-lg bg-blue-800 dark:bg-blue-600 text-white inline-flex items-center justify-center text-sm font-bold">KF</span>
        <span className="text-sm font-bold">KanzleiFlow</span>
      </div>
    </header>}>
      <WorkspaceNavigation />
    </Suspense>
    {children}
  </div>;
}
