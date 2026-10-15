import Link from "next/link";
import { connection } from "next/server";
import { getTenantContextOrRedirect } from "@/lib/auth/tenant";
import { getCases, getCaseStatusCounts } from "@/lib/services/case-service";
import { testDatabaseConnection } from "@/lib/db";
import { CaseStatus, caseStatusLabels } from "@/lib/validations/case";
import { StatusBadge, MatterTypeBadge } from "@/components/status-badge";
import { Navigation } from "@/components/navigation";
import { DeleteCaseButton } from "@/components/delete-case-button";

export const instant = false;

interface CasesPageProps {
  searchParams: Promise<{
    status?: string;
    search?: string;
  }>;
}

export default async function CasesPage({ searchParams }: CasesPageProps) {
  await connection();
  const resolvedSearchParams = await searchParams;
  const statusFilter = resolvedSearchParams.status as CaseStatus | undefined;
  const searchQuery = resolvedSearchParams.search || "";

  const tenant = await getTenantContextOrRedirect();
  const cases = await getCases(tenant, {
    status: statusFilter,
    search: searchQuery,
  });
  const statusCounts = await getCaseStatusCounts(tenant);
  const dbStatus = await testDatabaseConnection();

  const statusTabs: { value?: CaseStatus; label: string; count: number }[] = [
    { value: undefined, label: "gesamt", count: statusCounts.ALL || 0 },
    { value: "READY_FOR_NOTARIZATION", label: caseStatusLabels.READY_FOR_NOTARIZATION, count: statusCounts.READY_FOR_NOTARIZATION || 0 },
    { value: "IN_REVIEW", label: caseStatusLabels.IN_REVIEW, count: statusCounts.IN_REVIEW || 0 },
    { value: "DRAFT", label: caseStatusLabels.DRAFT, count: statusCounts.DRAFT || 0 },
    { value: "NOTARIZED", label: caseStatusLabels.NOTARIZED, count: statusCounts.NOTARIZED || 0 },
    { value: "COMPLETED", label: caseStatusLabels.COMPLETED, count: statusCounts.COMPLETED || 0 },
  ];

  const isFiltered = Boolean(statusFilter || searchQuery);

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col font-mono tracking-tight">
      <Navigation dbConnected={dbStatus.connected} tenant={tenant} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-5">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3 border-b border-zinc-200 dark:border-zinc-800">
          <div>
            <h1 className="text-base font-bold tracking-tight text-zinc-900 dark:text-white uppercase">
              aktenverwaltung
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              urkundenrolle & vorgänge im {tenant.organizationName}
            </p>
          </div>
          <Link
            href="/cases/new"
            className="inline-flex items-center justify-center px-3 py-1.5 text-xs font-mono font-medium text-white bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200 rounded-[4px] active:scale-[0.98] transition-transform duration-150 self-start sm:self-auto gap-1.5"
          >
            <span>+ neue akte anlegen</span>
          </Link>
        </div>

        {/* Filter & Search Surface */}
        <div className="bg-zinc-50 dark:bg-zinc-900 p-3.5 rounded-[4px] border border-zinc-200 dark:border-zinc-800 space-y-3">
          {/* Status Tabs Bar */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {statusTabs.map((tab) => {
              const isSelected = statusFilter === tab.value;
              const url = tab.value
                ? `/cases?status=${tab.value}${searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ""}`
                : `/cases${searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : ""}`;

              return (
                <Link
                  key={tab.label}
                  href={url}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] text-xs font-mono transition active:scale-[0.98] duration-150 whitespace-nowrap ${
                    isSelected
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 font-bold"
                      : "bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`inline-flex items-center justify-center px-1.5 py-0.2 rounded-[2px] text-[10px] font-mono ${
                      isSelected
                        ? "bg-zinc-700 text-zinc-100 dark:bg-zinc-300 dark:text-zinc-900 font-bold"
                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                    }`}
                  >
                    {tab.count}
                  </span>
                </Link>
              );
            })}
          </div>

          {/* Search Row */}
          <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <form method="GET" className="flex-1 flex items-center gap-2 max-w-xl">
              <div className="relative flex-1">
                <input
                  type="text"
                  name="search"
                  defaultValue={searchQuery}
                  placeholder="nach aktenzeichen (z. b. 2026-UR), betreff oder beteiligten suchen..."
                  className="w-full px-3 py-1.5 rounded-[4px] border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-xs font-mono focus:outline-hidden focus:border-zinc-500 transition"
                />
                {statusFilter && (
                  <input type="hidden" name="status" value={statusFilter} />
                )}
              </div>
              <button
                type="submit"
                className="px-3 py-1.5 text-xs font-mono rounded-[4px] bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 hover:bg-zinc-800 active:scale-[0.98] transition-transform duration-150"
              >
                suchen
              </button>
            </form>

            <div className="flex items-center justify-between sm:justify-end gap-3 text-xs font-mono text-zinc-500 dark:text-zinc-400">
              <span>{cases.length} {cases.length === 1 ? "akte gefunden" : "akten gefunden"}</span>
              {isFiltered && (
                <Link
                  href="/cases"
                  className="text-xs font-mono text-zinc-900 dark:text-zinc-100 hover:underline inline-flex items-center gap-1"
                >
                  <span>[x] filter zurücksetzen</span>
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Case List Table */}
        <div className="bg-white dark:bg-zinc-900 rounded-[4px] border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800 text-xs font-mono">
              <thead className="bg-zinc-50 dark:bg-zinc-950">
                <tr>
                  <th className="px-4 py-2.5 text-left font-bold text-zinc-600 dark:text-zinc-300 uppercase tracking-wider w-40">
                    urkunden-nr. / az
                  </th>
                  <th className="px-4 py-2.5 text-left font-bold text-zinc-600 dark:text-zinc-300 uppercase tracking-wider">
                    vorgang & beteiligte
                  </th>
                  <th className="px-4 py-2.5 text-center font-bold text-zinc-600 dark:text-zinc-300 uppercase tracking-wider w-48">
                    rechtsgebiet
                  </th>
                  <th className="px-4 py-2.5 text-center font-bold text-zinc-600 dark:text-zinc-300 uppercase tracking-wider w-44">
                    status
                  </th>
                  <th className="px-4 py-2.5 text-left font-bold text-zinc-600 dark:text-zinc-300 uppercase tracking-wider w-48">
                    zuständigkeit
                  </th>
                  <th className="px-4 py-2.5 text-right font-bold text-zinc-600 dark:text-zinc-300 uppercase tracking-wider w-36">
                    aktion
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 bg-white dark:bg-zinc-950">
                {cases.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center">
                      <div className="max-w-sm mx-auto text-center space-y-2">
                        <div className="text-xs font-bold text-zinc-400">
                          [keine datensätze]
                        </div>
                        <h3 className="text-xs font-bold text-zinc-900 dark:text-white uppercase">
                          keine akten für diesen filter gefunden
                        </h3>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                          {isFiltered
                            ? "Passen Sie die Filterkriterien an oder setzen Sie den Suchbegriff zurück."
                            : "Legen Sie Ihre erste notarielle Akte an, um den Urkundenprozess zu starten."}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  cases.map((c) => (
                    <tr
                      key={c.id}
                      className="hover:bg-zinc-50 dark:hover:bg-zinc-900/60 transition-colors"
                    >
                      {/* Urkundenrolle / Aktenzeichen */}
                      <td className="px-4 py-3 align-middle whitespace-nowrap">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-bold text-zinc-900 dark:text-zinc-100">
                            {c.caseNumber}
                          </span>
                          <span className="text-[10px] text-zinc-400">
                            {new Date(c.createdAt).toLocaleDateString("de-DE")}
                          </span>
                        </div>
                      </td>

                      {/* Title & Parties */}
                      <td className="px-4 py-3 align-middle">
                        <div className="space-y-0.5">
                          <Link
                            href={`/cases/${c.id}`}
                            className="font-bold text-zinc-900 dark:text-white hover:underline block line-clamp-1"
                          >
                            {c.title}
                          </Link>

                          {c.description && (
                            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-1">
                              {c.description}
                            </p>
                          )}

                          {c.parties && c.parties.length > 0 && (
                            <div className="text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1 flex-wrap pt-0.5">
                              <span className="font-medium text-zinc-700 dark:text-zinc-300">beteiligte:</span>
                              {c.parties.map((p, idx) => (
                                <span key={idx} className="inline-flex items-center gap-1">
                                  <span>{p.name}</span>
                                  <span className="text-[10px] text-zinc-400">({p.role})</span>
                                  {idx < c.parties.length - 1 && <span className="text-zinc-300 dark:text-zinc-700 mx-0.5">•</span>}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Matter Type */}
                      <td className="px-4 py-3 align-middle text-center whitespace-nowrap">
                        <MatterTypeBadge matterType={c.matterType} />
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 align-middle text-center whitespace-nowrap">
                        <StatusBadge status={c.status} />
                      </td>

                      {/* Responsibility */}
                      <td className="px-4 py-3 align-middle whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                            {c.assignedClerk || "offen"}
                          </span>
                          <span className="text-[10px] text-zinc-400">
                            {c.notaryName || "notar"}
                          </span>
                        </div>
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3 align-middle text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          <Link
                            href={`/cases/${c.id}`}
                            className="inline-flex items-center justify-center px-2.5 py-1 rounded-[4px] border border-zinc-300 dark:border-zinc-700 text-xs font-mono text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 active:scale-[0.98] transition-transform duration-150"
                          >
                            öffnen →
                          </Link>
                          <DeleteCaseButton
                            caseId={c.id}
                            caseNumber={c.caseNumber}
                            caseTitle={c.title}
                            variant="compact"
                          />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
