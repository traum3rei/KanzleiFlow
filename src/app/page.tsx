import Link from "next/link";
import { connection } from "next/server";
import { getTenantContextOrRedirect } from "@/lib/auth/tenant";
import { getDashboardStats } from "@/lib/services/case-service";
import { testDatabaseConnection } from "@/lib/db";
import { StatusBadge, MatterTypeBadge } from "@/components/status-badge";
import { Navigation } from "@/components/navigation";

export const instant = false;

export default async function DashboardPage() {
  await connection();

  const tenant = await getTenantContextOrRedirect();
  const stats = await getDashboardStats(tenant);
  const dbStatus = await testDatabaseConnection();

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col font-mono tracking-tight">
      <Navigation dbConnected={dbStatus.connected} tenant={tenant} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Connection Notice (if not connected) */}
        {!dbStatus.connected && (
          <div className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-[4px] p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start space-x-3">
              <span className="font-bold text-xs uppercase px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-800 rounded-[2px]">[info]</span>
              <div>
                <h2 className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
                  PostgreSQL verbindungskonfiguration erforderlich
                </h2>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
                  Die Anwendung läuft aktuell im lokalen Vorschau-Modus. Hinterlegen Sie DATABASE_URL in <code className="bg-zinc-200 dark:bg-zinc-800 px-1 py-0.5 rounded-[2px] text-[11px]">.env.local</code>.
                </p>
              </div>
            </div>
            <div className="shrink-0 text-xs text-zinc-700 dark:text-zinc-300 bg-zinc-200 dark:bg-zinc-800 px-2.5 py-1 rounded-[4px]">
              prisma 7 • rls enforcement: app-layer
            </div>
          </div>
        )}

        {/* Dashboard Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white uppercase">
              notariats-cockpit
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              {tenant.organizationName} • amtsbereich bayern ({tenant.jurisdiction})
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/cases"
              className="px-3 py-1.5 text-xs font-mono rounded-[4px] border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 active:scale-[0.98] transition-transform duration-150"
            >
              alle akten ({stats.totalCases})
            </Link>
            <Link
              href="/cases/new"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-medium text-white bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200 rounded-[4px] active:scale-[0.98] transition-transform duration-150"
            >
              <span>+ neue akte anlegen</span>
            </Link>
          </div>
        </div>

        {/* KPI Metrics Bento Grid (Asymmetric) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-zinc-50 dark:bg-zinc-900 p-4 rounded-[4px] border border-zinc-200 dark:border-zinc-800 flex flex-col justify-between">
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                laufende akten
              </span>
              <span className="px-1.5 py-0.5 rounded-[2px] bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-mono text-[10px]">
                gesamt
              </span>
            </div>
            <p className="text-2xl font-bold text-zinc-900 dark:text-white mt-2">
              {stats.totalCases}
            </p>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1">
              urkundenrolle 2026
            </p>
          </div>

          <div className="bg-zinc-50 dark:bg-zinc-900 p-4 rounded-[4px] border border-zinc-200 dark:border-zinc-800 flex flex-col justify-between">
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                beurkundungsreif
              </span>
              <span className="px-1.5 py-0.5 rounded-[2px] bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-mono text-[10px]">
                terminierbar
              </span>
            </div>
            <p className="text-2xl font-bold text-zinc-900 dark:text-white mt-2">
              {stats.readyForNotarization}
            </p>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1">
              entwürfe durch parteien freigegeben
            </p>
          </div>

          <div className="bg-zinc-50 dark:bg-zinc-900 p-4 rounded-[4px] border border-zinc-200 dark:border-zinc-800 flex flex-col justify-between">
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                in prüfung
              </span>
              <span className="px-1.5 py-0.5 rounded-[2px] bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-mono text-[10px]">
                bearbeitung
              </span>
            </div>
            <p className="text-2xl font-bold text-zinc-900 dark:text-white mt-2">
              {stats.inReview}
            </p>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1">
              grundbuch- & registerprüfungen
            </p>
          </div>

          <div className="bg-zinc-50 dark:bg-zinc-900 p-4 rounded-[4px] border border-zinc-200 dark:border-zinc-800 flex flex-col justify-between">
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                vollzug / abschluss
              </span>
              <span className="px-1.5 py-0.5 rounded-[2px] bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-mono text-[10px]">
                beurkundet
              </span>
            </div>
            <p className="text-2xl font-bold text-zinc-900 dark:text-white mt-2">
              {stats.completed}
            </p>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1">
              urkunden vollzogen oder archiviert
            </p>
          </div>
        </div>

        {/* Quick Presets Section */}
        <div className="bg-zinc-50 dark:bg-zinc-900 p-4 rounded-[4px] border border-zinc-200 dark:border-zinc-800 space-y-3">
          <div>
            <h2 className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
              vorlagen-schnellstart
            </h2>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              vorkonfigurierte urkundsgeschäfte eröffnen
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Link
              href="/cases/new?preset=real_estate"
              className="p-3 rounded-[4px] border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:border-zinc-500 dark:hover:border-zinc-600 transition group active:scale-[0.98] duration-150"
            >
              <div className="flex items-start gap-2.5">
                <span className="text-[10px] font-bold px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded-[2px] text-zinc-700 dark:text-zinc-300">
                  [immo]
                </span>
                <div>
                  <h3 className="text-xs font-bold text-zinc-900 dark:text-white group-hover:underline">
                    grundstückskaufvertrag
                  </h3>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                    kaufvertrag mit auflassung & grundschuldbestellung
                  </p>
                </div>
              </div>
            </Link>

            <Link
              href="/cases/new?preset=inheritance"
              className="p-3 rounded-[4px] border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:border-zinc-500 dark:hover:border-zinc-600 transition group active:scale-[0.98] duration-150"
            >
              <div className="flex items-start gap-2.5">
                <span className="text-[10px] font-bold px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded-[2px] text-zinc-700 dark:text-zinc-300">
                  [erbe]
                </span>
                <div>
                  <h3 className="text-xs font-bold text-zinc-900 dark:text-white group-hover:underline">
                    erbscheinsantrag
                  </h3>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                    nachlassverzeichnis & eidesstattliche versicherung
                  </p>
                </div>
              </div>
            </Link>

            <Link
              href="/cases/new?preset=corporate"
              className="p-3 rounded-[4px] border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:border-zinc-500 dark:hover:border-zinc-600 transition group active:scale-[0.98] duration-150"
            >
              <div className="flex items-start gap-2.5">
                <span className="text-[10px] font-bold px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded-[2px] text-zinc-700 dark:text-zinc-300">
                  [gmbh]
                </span>
                <div>
                  <h3 className="text-xs font-bold text-zinc-900 dark:text-white group-hover:underline">
                    gmbh-gründung / register
                  </h3>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                    gründungsbeschluss & elektronische registeranmeldung
                  </p>
                </div>
              </div>
            </Link>
          </div>
        </div>

        {/* Recent Cases Section */}
        <div className="bg-white dark:bg-zinc-900 rounded-[4px] border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <div>
              <h2 className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
                aktuelle vorgänge
              </h2>
              <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                letzte bearbeitungen in der urkundenrolle
              </p>
            </div>
            <Link
              href="/cases"
              className="text-xs font-mono text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white hover:underline"
            >
              alle akten anzeigen →
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800 text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-950">
                <tr>
                  <th className="px-4 py-2.5 text-left font-mono font-bold text-zinc-600 dark:text-zinc-300 uppercase tracking-wider w-40">
                    aktenzeichen
                  </th>
                  <th className="px-4 py-2.5 text-left font-mono font-bold text-zinc-600 dark:text-zinc-300 uppercase tracking-wider">
                    vorgang & beteiligte
                  </th>
                  <th className="px-4 py-2.5 text-center font-mono font-bold text-zinc-600 dark:text-zinc-300 uppercase tracking-wider w-48">
                    rechtsgebiet
                  </th>
                  <th className="px-4 py-2.5 text-center font-mono font-bold text-zinc-600 dark:text-zinc-300 uppercase tracking-wider w-44">
                    status
                  </th>
                  <th className="px-4 py-2.5 text-left font-mono font-bold text-zinc-600 dark:text-zinc-300 uppercase tracking-wider w-48">
                    sachbearbeitung
                  </th>
                  <th className="px-4 py-2.5 text-right font-mono font-bold text-zinc-600 dark:text-zinc-300 uppercase tracking-wider w-28">
                    aktion
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 bg-white dark:bg-zinc-950">
                {stats.recentCases.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-xs text-zinc-500">
                      keine akten vorhanden. erstellen sie eine neue akte.
                    </td>
                  </tr>
                ) : (
                  stats.recentCases.map((c) => (
                    <tr
                      key={c.id}
                      className="hover:bg-zinc-50 dark:hover:bg-zinc-900/60 transition-colors"
                    >
                      <td className="px-4 py-3 align-middle whitespace-nowrap">
                        <span className="font-mono text-xs font-bold text-zinc-900 dark:text-zinc-100">
                          {c.caseNumber}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <Link
                          href={`/cases/${c.id}`}
                          className="font-bold text-zinc-900 dark:text-white hover:underline block line-clamp-1"
                        >
                          {c.title}
                        </Link>
                        {c.parties && c.parties.length > 0 && (
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-1">
                            beteiligte: {c.parties.map((p) => `${p.name} (${p.role})`).join(" • ")}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 align-middle text-center whitespace-nowrap">
                        <MatterTypeBadge matterType={c.matterType} />
                      </td>
                      <td className="px-4 py-3 align-middle text-center whitespace-nowrap">
                        <StatusBadge status={c.status} />
                      </td>
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
                      <td className="px-4 py-3 align-middle text-right whitespace-nowrap">
                        <Link
                          href={`/cases/${c.id}`}
                          className="inline-flex items-center justify-center px-2.5 py-1 rounded-[4px] border border-zinc-300 dark:border-zinc-700 text-xs font-mono text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 active:scale-[0.98] transition-transform duration-150"
                        >
                          öffnen →
                        </Link>
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
