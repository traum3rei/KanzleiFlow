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
    <div className="app-shell min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col font-sans tracking-tight">
      <Navigation dbConnected={dbStatus.connected} tenant={tenant} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Connection Notice (if not connected) */}
        {!dbStatus.connected && (
          <div className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start space-x-3">
              <span className="font-bold text-sm uppercase px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-800 rounded">[Info]</span>
              <div>
                <h2 className="text-sm font-bold text-zinc-900 dark:text-white ">
                  PostgreSQL-Verbindungskonfiguration erforderlich
                </h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-0.5">
                  Die Anwendung läuft aktuell im lokalen Vorschau-Modus. Hinterlegen Sie DATABASE_URL in <code className="bg-zinc-200 dark:bg-zinc-800 px-1 py-0.5 rounded text-xs">.env.local</code>.
                </p>
              </div>
            </div>
            <div className="shrink-0 text-sm text-zinc-700 dark:text-zinc-300 bg-zinc-200 dark:bg-zinc-800 px-2.5 py-1 rounded-lg">
              Prisma 7 • RLS Enforcement: App-Layer
            </div>
          </div>
        )}

        {/* Dashboard Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white">
              Ihr Notariat im Überblick
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
              {tenant.organizationName} · {tenant.jurisdiction}
            </p>
          </div>
          <div className="flex items-center gap-2">
          <Link
            href="/cases"
            prefetch={true}
            className="inline-flex h-9 items-center justify-center px-3 text-sm font-sans rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors duration-150"
          >
            Alle Akten ({stats.totalCases})
          </Link>

          <Link
            href="/cases/new"
            prefetch={true}
            className="inline-flex h-9 items-center justify-center gap-1.5 px-3 text-sm font-sans font-medium text-white bg-blue-800 hover:bg-blue-900 dark:bg-blue-600 dark:text-white dark:hover:bg-blue-500 rounded-lg transition-colors duration-150"
          >
            + Neue Akte anlegen
          </Link>
        </div>
        </div>

        {/* KPI Metrics Bento Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-zinc-50 dark:bg-zinc-900 p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 flex flex-col justify-between">
            <div className="flex justify-between items-center">
              <span className="text-xs font-sans text-zinc-500 dark:text-zinc-400 ">
                Alle Akten
              </span>
              <span className="px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-sans text-xs">
                Gesamt
              </span>
            </div>
            <p className="text-2xl font-bold text-zinc-900 dark:text-white mt-2">
              {stats.totalCases}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Akten im Notariat
            </p>
          </div>

          <div className="bg-zinc-50 dark:bg-zinc-900 p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 flex flex-col justify-between">
            <div className="flex justify-between items-center">
              <span className="text-xs font-sans text-zinc-500 dark:text-zinc-400 ">
                Beurkundungsreif
              </span>
              <span className="px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-sans text-xs">
                Terminierbar
              </span>
            </div>
            <p className="text-2xl font-bold text-zinc-900 dark:text-white mt-2">
              {stats.readyForNotarization}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Akten mit Status „Beurkundungsreif“
            </p>
          </div>

          <div className="bg-zinc-50 dark:bg-zinc-900 p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 flex flex-col justify-between">
            <div className="flex justify-between items-center">
              <span className="text-xs font-sans text-zinc-500 dark:text-zinc-400 ">
                In Prüfung
              </span>
              <span className="px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-sans text-xs">
                Bearbeitung
              </span>
            </div>
            <p className="text-2xl font-bold text-zinc-900 dark:text-white mt-2">
              {stats.inReview}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Akten in fachlicher Prüfung
            </p>
          </div>

          <div className="bg-zinc-50 dark:bg-zinc-900 p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 flex flex-col justify-between">
            <div className="flex justify-between items-center">
              <span className="text-xs font-sans text-zinc-500 dark:text-zinc-400 ">
                Vollzug / Abschluss
              </span>
              <span className="px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-sans text-xs">
                Beurkundet
              </span>
            </div>
            <p className="text-2xl font-bold text-zinc-900 dark:text-white mt-2">
              {stats.completed}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Beurkundete und abgeschlossene Akten
            </p>
          </div>
        </div>

        {/* Recent Cases Section */}
        <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white ">
                Aktuelle Vorgänge
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Zuletzt aktualisierte Akten
              </p>
            </div>
            <Link
              href="/cases"
              prefetch={true}
              className="text-sm font-sans text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white hover:underline"
            >
              Alle Akten anzeigen →
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800 text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-950">
                <tr>
                  <th className="px-4 py-2.5 text-left font-sans font-bold text-zinc-700 dark:text-zinc-300 tracking-tight w-40">
                    Urkunden-Nr. / AZ
                  </th>
                  <th className="px-4 py-2.5 text-left font-sans font-bold text-zinc-700 dark:text-zinc-300 tracking-tight">
                    Vorgang & Beteiligte
                  </th>
                  <th className="px-4 py-2.5 text-center font-sans font-bold text-zinc-700 dark:text-zinc-300 tracking-tight w-48">
                    Rechtsgebiet
                  </th>
                  <th className="px-4 py-2.5 text-center font-sans font-bold text-zinc-700 dark:text-zinc-300 tracking-tight w-44">
                    Status
                  </th>
                  <th className="px-4 py-2.5 text-left font-sans font-bold text-zinc-700 dark:text-zinc-300 tracking-tight w-48">
                    Zuständigkeit
                  </th>
                  <th className="px-4 py-2.5 text-right font-sans font-bold text-zinc-700 dark:text-zinc-300 tracking-tight w-28">
                    Aktion
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 bg-white dark:bg-zinc-950">
                {stats.recentCases.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-zinc-500">
                      Keine Akten vorhanden. Erstellen Sie eine neue Akte.
                    </td>
                  </tr>
                ) : (
                  stats.recentCases.map((c) => (
                    <tr
                      key={c.id}
                      className="hover:bg-zinc-50 dark:hover:bg-zinc-900/60 transition-colors"
                    >
                      <td className="px-4 py-3 align-middle whitespace-nowrap">
                        <span className="font-sans text-sm font-bold text-zinc-900 dark:text-zinc-100">
                          {c.caseNumber}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <Link
                          href={`/cases/${c.id}`}
                          prefetch={true}
                          className="font-bold text-zinc-900 dark:text-white hover:underline block line-clamp-1"
                        >
                          {c.title}
                        </Link>
                        {c.parties && c.parties.length > 0 && (
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-1">
                            Beteiligte: {c.parties.map((p) => `${p.name} (${p.role})`).join(" • ")}
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
                          <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                            {c.assignedClerk || "Offen"}
                          </span>
                          <span className="text-xs text-zinc-400">
                            {c.notaryName || "Notar"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-middle text-right whitespace-nowrap">
                        <Link
                          href={`/cases/${c.id}`}
                          prefetch={true}
                          className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg border border-zinc-300 dark:border-zinc-700 text-sm font-sans text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800  transition-colors duration-150"
                        >
                          Öffnen →
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Quick Presets Section */}
        <div className="bg-zinc-50 dark:bg-zinc-900 p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 space-y-3">
          <div>
            <h2 className="text-sm font-bold text-zinc-900 dark:text-white ">
              Neue Akte vorbereiten
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Mit passenden Feldern für Ihr Urkundsgeschäft starten
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Link prefetch={true}
              href="/cases/new?preset=real_estate"
              className="p-3 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:border-zinc-500 dark:hover:border-zinc-600 transition group  duration-150"
            >
              <div className="flex items-start gap-2.5">
                
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-white group-hover:underline">
                    Grundstückskaufvertrag
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Kaufvertrag mit Auflassung & Grundschuldbestellung
                  </p>
                </div>
              </div>
            </Link>

            <Link prefetch={true}
              href="/cases/new?preset=inheritance"
              className="p-3 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:border-zinc-500 dark:hover:border-zinc-600 transition group  duration-150"
            >
              <div className="flex items-start gap-2.5">
                
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-white group-hover:underline">
                    Erbscheinsantrag
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Nachlassverzeichnis & eidesstattliche Versicherung
                  </p>
                </div>
              </div>
            </Link>

            <Link prefetch={true}
              href="/cases/new?preset=corporate"
              className="p-3 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:border-zinc-500 dark:hover:border-zinc-600 transition group  duration-150"
            >
              <div className="flex items-start gap-2.5">
                
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-white group-hover:underline">
                    GmbH-Gründung / Register
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Gründungsbeschluss & elektronische Registeranmeldung
                  </p>
                </div>
              </div>
            </Link>
          </div>
        </div>

      </main>
    </div>
  );
}
