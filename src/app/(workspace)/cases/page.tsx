import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getTenantContextOrRedirect } from "@/lib/auth/tenant";
import {
  getCases,
  countCases,
  getCaseStatusCounts,
  getAvailableAssignees,
} from "@/lib/services/case-service";
import {
  CaseStatus,
  CaseStatusEnum,
  MatterTypeEnum,
  MatterType,
  caseStatusLabels,
  matterTypeLabels,
} from "@/lib/validations/case";
import { StatusBadge, MatterTypeBadge } from "@/components/status-badge";
import { DeleteCaseButton } from "@/components/delete-case-button";

export const instant = false;

interface CasesPageProps {
  searchParams: Promise<{
    status?: string;
    search?: string;
    rechtsgebiet?: string;
    zustaendigkeit?: string;
    page?: string;
    pageSize?: string;
  }>;
}

export default async function CasesPage({ searchParams }: CasesPageProps) {
  await connection();
  const resolvedSearchParams = await searchParams;

  const statusFilter = CaseStatusEnum.safeParse(resolvedSearchParams.status).data;
  const searchQuery = resolvedSearchParams.search?.trim() || "";
  const rechtsgebietFilter = MatterTypeEnum.safeParse(resolvedSearchParams.rechtsgebiet).data;
  const zustaendigkeitFilter = resolvedSearchParams.zustaendigkeit?.trim() || undefined;

  const rawPage = parseInt(resolvedSearchParams.page || "1", 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;

  const rawPageSize = parseInt(resolvedSearchParams.pageSize || "25", 10);
  const pageSize = [25, 50, 100].includes(rawPageSize) ? rawPageSize : 25;

  const skip = (page - 1) * pageSize;

  const tenant = await getTenantContextOrRedirect();

  const [cases, totalCount, statusCounts, availableAssignees] = await Promise.all([
    getCases(tenant, {
      status: statusFilter,
      search: searchQuery,
      matterType: rechtsgebietFilter,
      responsibility: zustaendigkeitFilter,
      take: pageSize,
      skip,
    }),
    countCases(tenant, {
      status: statusFilter,
      search: searchQuery,
      matterType: rechtsgebietFilter,
      responsibility: zustaendigkeitFilter,
    }),
    getCaseStatusCounts(tenant),
    getAvailableAssignees(tenant),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  if (page > totalPages) {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (searchQuery) params.set("search", searchQuery);
    if (rechtsgebietFilter) params.set("rechtsgebiet", rechtsgebietFilter);
    if (zustaendigkeitFilter) params.set("zustaendigkeit", zustaendigkeitFilter);
    params.set("page", String(totalPages));
    params.set("pageSize", String(pageSize));
    redirect(`/cases?${params}`);
  }
  const currentPage = page;
  const startItem = totalCount === 0 ? 0 : skip + 1;
  const endItem = Math.min(totalCount, skip + cases.length);

  // Helper to build URL with query params preserved
  const buildFilterUrl = (overrides: {
    status?: string | null;
    search?: string | null;
    rechtsgebiet?: string | null;
    zustaendigkeit?: string | null;
    page?: number;
    pageSize?: number;
  }) => {
    const params = new URLSearchParams();

    const st = overrides.status !== undefined ? overrides.status : statusFilter;
    if (st) params.set("status", st);

    const s = overrides.search !== undefined ? overrides.search : searchQuery;
    if (s) params.set("search", s);

    const rg = overrides.rechtsgebiet !== undefined ? overrides.rechtsgebiet : rechtsgebietFilter;
    if (rg) params.set("rechtsgebiet", rg);

    const z = overrides.zustaendigkeit !== undefined ? overrides.zustaendigkeit : zustaendigkeitFilter;
    if (z) params.set("zustaendigkeit", z);

    const ps = overrides.pageSize !== undefined ? overrides.pageSize : pageSize;
    if (ps !== 25) params.set("pageSize", String(ps));

    const p = overrides.page !== undefined ? overrides.page : 1;
    if (p > 1) params.set("page", String(p));

    const qs = params.toString();
    return `/cases${qs ? `?${qs}` : ""}`;
  };

  const statusTabs: { value?: CaseStatus; label: string; count: number }[] = [
    { value: undefined, label: "Alle", count: statusCounts.ALL || 0 },
    { value: "READY_FOR_NOTARIZATION", label: caseStatusLabels.READY_FOR_NOTARIZATION, count: statusCounts.READY_FOR_NOTARIZATION || 0 },
    { value: "IN_REVIEW", label: caseStatusLabels.IN_REVIEW, count: statusCounts.IN_REVIEW || 0 },
    { value: "DRAFT", label: caseStatusLabels.DRAFT, count: statusCounts.DRAFT || 0 },
    { value: "NOTARIZED", label: caseStatusLabels.NOTARIZED, count: statusCounts.NOTARIZED || 0 },
    { value: "COMPLETED", label: caseStatusLabels.COMPLETED, count: statusCounts.COMPLETED || 0 },
  ];

  const isFiltered = Boolean(statusFilter || searchQuery || rechtsgebietFilter || zustaendigkeitFilter || page > 1);

  // Generate pagination window
  const getPageNumbers = () => {
    const pages: (number | "...")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push("...");

      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (currentPage < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-5">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3 border-b border-zinc-200 dark:border-zinc-800">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white">
              Aktenverwaltung
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
              Demo-Aktenliste & Vorgänge im {tenant.organizationName}
            </p>
          </div>
          <Link
            href="/cases/new"
            prefetch={true}
            className="inline-flex items-center justify-center px-3 py-1.5 text-sm font-sans font-medium text-white bg-blue-800 hover:bg-blue-900 dark:bg-blue-600 dark:text-white dark:hover:bg-blue-500 rounded-lg  transition-colors duration-150 self-start sm:self-auto gap-1.5"
          >
            <span>+ Neue Akte anlegen</span>
          </Link>
        </div>

        {/* Filter & Search Surface */}
        <div className="bg-zinc-50 dark:bg-zinc-900 p-3.5 rounded-lg border border-zinc-200 dark:border-zinc-800 space-y-3">
          {/* Status Tabs Bar */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {statusTabs.map((tab) => {
              const isSelected = statusFilter === tab.value;
              const url = buildFilterUrl({
                status: tab.value || null,
                page: 1,
              });

              return (
                <Link
                  key={tab.label}
                  href={url}
                  prefetch={true}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-sans transition  duration-150 whitespace-nowrap ${
                    isSelected
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 font-bold"
                      : "bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`inline-flex items-center justify-center px-1.5 py-0.2 rounded text-xs font-sans ${
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

          {/* Search & Advanced Filters Form */}
          <form method="GET" action="/cases" className="space-y-3 pt-2 border-t border-zinc-200 dark:border-zinc-800">
            {/* Preserved Status and PageSize */}
            {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
            {pageSize !== 25 && <input type="hidden" name="pageSize" value={pageSize} />}

            <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center">
              {/* Search Query */}
              <div className="md:col-span-4 relative">
                <input
                  type="text"
                  name="search"
                  aria-label="Akten durchsuchen"
                  defaultValue={searchQuery}
                  placeholder="Nach Aktenzeichen (z. B. 2026-UR), Betreff oder Beteiligten suchen..."
                  className="w-full px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm font-sans focus:outline-hidden focus:border-zinc-500 transition"
                />
              </div>

              {/* Filter Rechtsgebiet */}
              <div className="md:col-span-3">
                <select
                  name="rechtsgebiet"
                  defaultValue={rechtsgebietFilter || ""}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm font-sans text-zinc-800 dark:text-zinc-200 focus:outline-hidden focus:border-zinc-500 transition"
                  aria-label="Rechtsgebiet filtern"
                >
                  <option value="">Alle Rechtsgebiete</option>
                  {(Object.keys(matterTypeLabels) as MatterType[]).map((mt) => (
                    <option key={mt} value={mt}>
                      {matterTypeLabels[mt]}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filter Zuständigkeit */}
              <div className="md:col-span-3">
                <select
                  name="zustaendigkeit"
                  defaultValue={zustaendigkeitFilter || ""}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm font-sans text-zinc-800 dark:text-zinc-200 focus:outline-hidden focus:border-zinc-500 transition"
                  aria-label="Zuständigkeit filtern"
                >
                  <option value="">Alle Zuständigkeiten</option>
                  <option value="UNASSIGNED">Offen (Nicht zugewiesen)</option>
                  {availableAssignees.map((assignee) => (
                    <option key={assignee} value={assignee}>
                      {assignee}
                    </option>
                  ))}
                </select>
              </div>

              {/* Submit Button */}
              <div className="md:col-span-2 flex items-center">
                <button
                  type="submit"
                  className="w-full px-3 py-1.5 text-sm font-sans font-medium rounded-lg bg-blue-800 text-white dark:bg-blue-600 dark:text-white hover:bg-blue-900 dark:hover:bg-blue-500  transition-colors duration-150 text-center"
                >
                  Filtern
                </button>
              </div>
            </div>

            {/* Filter Summary and Reset */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm font-sans text-zinc-500 dark:text-zinc-400 pt-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                  {totalCount} {totalCount === 1 ? "Akte gefunden" : "Akten gefunden"}
                </span>

                {rechtsgebietFilter && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs">
                    Rechtsgebiet: {matterTypeLabels[rechtsgebietFilter] || rechtsgebietFilter}
                  </span>
                )}

                {zustaendigkeitFilter && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs">
                    Zuständigkeit: {zustaendigkeitFilter === "UNASSIGNED" ? "Offen" : zustaendigkeitFilter}
                  </span>
                )}
              </div>

              {isFiltered && (
                <Link
                  href="/cases"
                  prefetch={true}
                  className="text-sm font-sans text-zinc-900 dark:text-zinc-100 hover:underline inline-flex items-center gap-1"
                >
                  <span>[x] Filter zurücksetzen</span>
                </Link>
              )}
            </div>
          </form>
        </div>

        {/* Case List Table */}
        <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800 text-sm font-sans">
              <thead className="bg-zinc-50 dark:bg-zinc-950">
                <tr>
                  <th className="px-4 py-2.5 text-left font-bold text-zinc-700 dark:text-zinc-300 tracking-tight w-40">
                    Urkunden-Nr. / AZ
                  </th>
                  <th className="px-4 py-2.5 text-left font-bold text-zinc-700 dark:text-zinc-300 tracking-tight">
                    Vorgang & Beteiligte
                  </th>
                  <th className="px-4 py-2.5 text-center font-bold text-zinc-700 dark:text-zinc-300 tracking-tight w-48">
                    Rechtsgebiet
                  </th>
                  <th className="px-4 py-2.5 text-center font-bold text-zinc-700 dark:text-zinc-300 tracking-tight w-44">
                    Status
                  </th>
                  <th className="px-4 py-2.5 text-left font-bold text-zinc-700 dark:text-zinc-300 tracking-tight w-48">
                    Zuständigkeit
                  </th>
                  <th className="px-4 py-2.5 text-right font-bold text-zinc-700 dark:text-zinc-300 tracking-tight w-36">
                    Aktion
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 bg-white dark:bg-zinc-950">
                {cases.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center">
                      <div className="max-w-sm mx-auto text-center space-y-2">
                        <div className="text-sm font-bold text-zinc-400">
                          [Keine Datensätze]
                        </div>
                        <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                          Keine Akten für diesen Filter gefunden
                        </h3>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
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
                      {/* Demo-Aktenliste / Aktenzeichen */}
                      <td className="px-4 py-3 align-middle whitespace-nowrap">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-bold text-zinc-900 dark:text-zinc-100">
                            {c.caseNumber}
                          </span>
                          <span className="text-xs text-zinc-400">
                            {new Date(c.createdAt).toLocaleDateString("de-DE")}
                          </span>
                        </div>
                      </td>

                      {/* Title & Parties */}
                      <td className="px-4 py-3 align-middle">
                        <div className="space-y-0.5">
                          <Link
                            href={`/cases/${c.id}`}
                            prefetch={true}
                            className="font-bold text-zinc-900 dark:text-white hover:underline block line-clamp-1"
                          >
                            {c.title}
                          </Link>

                          {c.description && (
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-1">
                              {c.description}
                            </p>
                          )}

                          {c.parties && c.parties.length > 0 && (
                            <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1 flex-wrap pt-0.5">
                              <span className="font-medium text-zinc-700 dark:text-zinc-300">Beteiligte:</span>
                              {c.parties.map((p, idx) => (
                                <span key={idx} className="inline-flex items-center gap-1">
                                  <span>{p.name}</span>
                                  <span className="text-xs text-zinc-400">({p.role})</span>
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
                          <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                            {c.assignedClerk || "Offen"}
                          </span>
                          <span className="text-xs text-zinc-400">
                            {c.notaryName || "Notar"}
                          </span>
                        </div>
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3 align-middle text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          <Link
                            href={`/cases/${c.id}`}
                            prefetch={true}
                            className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg border border-zinc-300 dark:border-zinc-700 text-sm font-sans text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800  transition-colors duration-150"
                          >
                            Öffnen →
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

          {/* Pagination Controls Footer */}
          <div className="px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm font-sans">
            {/* Range info & Page Size selection */}
            <div className="flex items-center gap-3 text-zinc-600 dark:text-zinc-400">
              <span>
                Zeige <strong className="text-zinc-900 dark:text-zinc-100 font-bold">{startItem}–{endItem}</strong> von{" "}
                <strong className="text-zinc-900 dark:text-zinc-100 font-bold">{totalCount}</strong> Akten
                {totalPages > 1 && ` (Seite ${currentPage} von ${totalPages})`}
              </span>

              <span className="text-zinc-300 dark:text-zinc-700">|</span>

              <div className="flex items-center gap-1 text-xs">
                <span className="text-zinc-400">Pro Seite:</span>
                {[25, 50, 100].map((size) => (
                  <Link
                    key={size}
                    href={buildFilterUrl({ pageSize: size, page: 1 })}
                    prefetch={true}
                    className={`px-1.5 py-0.5 rounded transition ${
                      pageSize === size
                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 font-bold"
                        : "hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                    }`}
                  >
                    {size}
                  </Link>
                ))}
              </div>
            </div>

            {/* Previous / Page numbers / Next buttons */}
            {totalPages > 1 && (
              <div className="flex items-center gap-1.5 self-center sm:self-auto">
                {/* Previous Page Button */}
                {currentPage > 1 ? (
                  <Link
                    href={buildFilterUrl({ page: currentPage - 1 })}
                    prefetch={true}
                    className="px-2.5 py-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition "
                  >
                    ← Vorherige
                  </Link>
                ) : (
                  <span className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-400 dark:text-zinc-600 cursor-not-allowed bg-zinc-100/50 dark:bg-zinc-900/50">
                    ← Vorherige
                  </span>
                )}

                {/* Page Number Pills */}
                <div className="hidden md:flex items-center gap-1">
                  {getPageNumbers().map((pNum, idx) => {
                    if (pNum === "...") {
                      return (
                        <span key={`ellipsis-${idx}`} className="px-1.5 text-zinc-400">
                          ...
                        </span>
                      );
                    }
                    const isCurrent = pNum === currentPage;
                    return (
                      <Link
                        key={pNum}
                        href={buildFilterUrl({ page: pNum })}
                        prefetch={true}
                        className={`min-w-[28px] h-7 px-1.5 flex items-center justify-center rounded-lg text-sm font-sans transition ${
                          isCurrent
                            ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 font-bold"
                            : "border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                        }`}
                      >
                        {pNum}
                      </Link>
                    );
                  })}
                </div>

                {/* Next Page Button */}
                {currentPage < totalPages ? (
                  <Link
                    href={buildFilterUrl({ page: currentPage + 1 })}
                    prefetch={true}
                    className="px-2.5 py-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition "
                  >
                    Nächste →
                  </Link>
                ) : (
                  <span className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-400 dark:text-zinc-600 cursor-not-allowed bg-zinc-100/50 dark:bg-zinc-900/50">
                    Nächste →
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
