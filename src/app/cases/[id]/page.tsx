import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getTenantContextOrRedirect } from "@/lib/auth/tenant";
import { getCaseById } from "@/lib/services/case-service";
import { getDocumentsForCase } from "@/lib/services/document-service";
import { getDraftsForCase } from "@/lib/services/draft-service";
import { getPrismaClient, testDatabaseConnection } from "@/lib/db";
import { StatusBadge, MatterTypeBadge } from "@/components/status-badge";
import { Navigation } from "@/components/navigation";
import { DeleteCaseButton } from "@/components/delete-case-button";
import { DocumentWorkflow } from "./document-workflow";

export const instant = false;

interface CaseDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function CaseDetailPage({ params }: CaseDetailPageProps) {
  await connection();
  const { id } = await params;
  const tenant = await getTenantContextOrRedirect();
  const dbStatus = await testDatabaseConnection();

  const caseItem = await getCaseById(tenant, id);

  if (!caseItem) {
    notFound();
  }

  const [documents, drafts] = await Promise.all([
    getDocumentsForCase(tenant, id),
    getDraftsForCase(tenant, id),
  ]);

  const prisma = getPrismaClient();
  const auditLogs = prisma
    ? await prisma.auditEvent.findMany({
        where: {
          organizationId: tenant.organizationId,
          OR: [
            { entityId: id },
            { entityId: { in: documents.map((d) => d.id) } },
            { entityId: { in: drafts.map((d) => d.id) } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 8,
      })
    : [];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 flex flex-col font-sans">
      <Navigation dbConnected={dbStatus.connected} tenant={tenant} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Breadcrumb & Navigation Bar */}
        <div className="flex items-center justify-between">
          <nav className="flex items-center space-x-2 text-xs text-slate-500 dark:text-slate-400">
            <Link href="/" className="hover:text-slate-900 dark:hover:text-white transition">
              Übersicht
            </Link>
            <span>/</span>
            <Link href="/cases" className="hover:text-slate-900 dark:hover:text-white transition">
              Aktenverwaltung
            </Link>
            <span>/</span>
            <span className="font-mono text-slate-900 dark:text-white font-bold bg-slate-200/60 dark:bg-slate-800 px-2 py-0.5 rounded">
              {caseItem.caseNumber}
            </span>
          </nav>

          <div className="flex items-center gap-2.5">
            <Link
              href={`/cases/${caseItem.id}/configurator`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 text-xs font-mono font-bold hover:bg-zinc-800 dark:hover:bg-zinc-200 active:scale-[0.98] transition-transform shadow-2xs"
            >
              <span>[+]</span>
              <span>Dokument-Konfigurator</span>
            </Link>
            <DeleteCaseButton
              caseId={caseItem.id}
              caseNumber={caseItem.caseNumber}
              caseTitle={caseItem.title}
              redirectTo="/cases"
            />
            <Link
              href="/cases"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-xs font-mono font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition shadow-2xs"
            >
              <span>←</span>
              <span>Zurück zur Liste</span>
            </Link>
          </div>
        </div>

        {/* Case Header Card */}
        <div className="bg-white dark:bg-slate-950 p-6 sm:p-7 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="px-3 py-1 rounded-md font-mono text-xs font-extrabold bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 tracking-tight">
                  {caseItem.caseNumber}
                </span>
                <StatusBadge status={caseItem.status} />
                <MatterTypeBadge matterType={caseItem.matterType} />
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                {caseItem.title}
              </h1>
            </div>

            <div className="shrink-0 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 px-3.5 py-2 rounded-lg border border-slate-200/80 dark:border-slate-800">
              <span className="block font-medium">Angelegt in Urkundenrolle:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {new Date(caseItem.createdAt).toLocaleDateString("de-DE", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
              </span>
            </div>
          </div>

          {/* Key Facts Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-5 border-t border-slate-100 dark:border-slate-800/80">
            <div className="p-3.5 rounded-lg bg-slate-50/70 dark:bg-slate-900/50 border border-slate-200/70 dark:border-slate-800/60">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block uppercase tracking-wider">
                Zuständiger Notar
              </span>
              <span className="text-sm font-bold text-slate-900 dark:text-white mt-0.5 block">
                {caseItem.notaryName || "Dr. Johannes Weiss"}
              </span>
            </div>

            <div className="p-3.5 rounded-lg bg-slate-50/70 dark:bg-slate-900/50 border border-slate-200/70 dark:border-slate-800/60">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block uppercase tracking-wider">
                Sachbearbeitung
              </span>
              <span className="text-sm font-bold text-slate-900 dark:text-white mt-0.5 block">
                {caseItem.assignedClerk || "Stefanie Bauer"}
              </span>
            </div>

            <div className="p-3.5 rounded-lg bg-slate-50/70 dark:bg-slate-900/50 border border-slate-200/70 dark:border-slate-800/60">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block uppercase tracking-wider">
                Beurkundungstermin
              </span>
              <span className="text-sm font-bold text-slate-900 dark:text-white mt-0.5 block">
                {caseItem.targetDate
                  ? new Date(caseItem.targetDate).toLocaleString("de-DE", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }) + " Uhr"
                  : "Noch nicht terminiert"}
              </span>
            </div>

            <div className="p-3.5 rounded-lg bg-slate-50/70 dark:bg-slate-900/50 border border-slate-200/70 dark:border-slate-800/60">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block uppercase tracking-wider">
                Mandant / Notariat
              </span>
              <span className="text-sm font-bold text-slate-900 dark:text-white mt-0.5 block truncate">
                {tenant.organizationName}
              </span>
            </div>
          </div>
        </div>

        {/* 2-Column Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main 2-Span Column: Details, Parties, Documents */}
          <div className="lg:col-span-2 space-y-6">
            {/* Description & Matter Details */}
            <div className="bg-white dark:bg-slate-950 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Sachverhalt & Notizen zur Urkunde
                </h2>
                <span className="text-xs text-slate-400 font-medium">Vertragsgegenstand</span>
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed pt-1">
                {caseItem.description || "Keine gesonderten Sachverhaltsangaben für diese Akte hinterlegt."}
              </p>
            </div>

            {/* Parties List */}
            <div className="bg-white dark:bg-slate-950 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Beteiligte & Parteien ({caseItem.parties.length})
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Identitätsfeststellung & Legitimation nach § 10 BeurkG
                  </p>
                </div>
              </div>

              {caseItem.parties.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  Bisher keine Beteiligten für diese Akte erfasst.
                </div>
              ) : (
                <div className="space-y-3">
                  {caseItem.parties.map((p, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-lg bg-slate-50/70 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800 space-y-2.5"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold text-xs flex items-center justify-center shrink-0">
                            {p.name.charAt(0) || "P"}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-900 dark:text-white">
                              {p.name}
                            </p>
                            {p.address && (
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                {p.address}
                              </p>
                            )}
                          </div>
                        </div>

                        <span className="self-start sm:self-auto px-2.5 py-1 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 shrink-0">
                          {p.role}
                        </span>
                      </div>

                      {/* Notarial Party Metadata */}
                      {(p.taxId || p.birthDate || p.email || p.phone || p.maritalStatus || p.nationality) && (
                        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-800/60 text-[11px] text-slate-600 dark:text-slate-400">
                          {p.taxId && (
                            <span className="bg-slate-200/70 dark:bg-slate-800 px-2 py-0.5 rounded font-mono font-medium text-slate-800 dark:text-slate-300">
                              Steuer-ID: {p.taxId}
                            </span>
                          )}
                          {p.birthDate && (
                            <span className="bg-slate-200/70 dark:bg-slate-800 px-2 py-0.5 rounded">
                              Geb.: {p.birthDate}
                            </span>
                          )}
                          {p.maritalStatus && (
                            <span className="bg-slate-200/70 dark:bg-slate-800 px-2 py-0.5 rounded">
                              Familienstand: {p.maritalStatus}
                            </span>
                          )}
                          {p.nationality && (
                            <span className="bg-slate-200/70 dark:bg-slate-800 px-2 py-0.5 rounded">
                              Staatsang.: {p.nationality}
                            </span>
                          )}
                          {p.email && (
                            <span className="text-zinc-700 dark:text-zinc-300 font-mono text-[11px]">
                              mail: {p.email}
                            </span>
                          )}
                          {p.phone && (
                            <span className="text-zinc-500 dark:text-zinc-400 font-mono text-[11px]">
                              tel: {p.phone}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Property / Land Registry Section */}
            {caseItem.propertyDetails && (caseItem.propertyDetails.landRegistryDistrict || caseItem.propertyDetails.sheetNumber || caseItem.propertyDetails.parcelNumber || caseItem.propertyDetails.areaSqm || caseItem.propertyDetails.economicUse) && (
              <div className="bg-white dark:bg-slate-950 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      Grundbuch- & Liegenschaftsdaten
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Katasteramtliche Bezeichnung nach § 28 GBO
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 text-xs font-semibold border border-emerald-200 dark:border-emerald-800">
                    Bestandsverzeichnis
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                  {caseItem.propertyDetails.landRegistryDistrict && (
                    <div className="p-3 rounded-lg bg-slate-50/70 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800">
                      <span className="text-slate-500 dark:text-slate-400 block font-medium">Gemarkung</span>
                      <span className="font-bold text-slate-900 dark:text-white mt-0.5 block">{caseItem.propertyDetails.landRegistryDistrict}</span>
                    </div>
                  )}
                  {caseItem.propertyDetails.sheetNumber && (
                    <div className="p-3 rounded-lg bg-slate-50/70 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800">
                      <span className="text-slate-500 dark:text-slate-400 block font-medium">Grundbuchblatt</span>
                      <span className="font-bold font-mono text-slate-900 dark:text-white mt-0.5 block">Blatt {caseItem.propertyDetails.sheetNumber}</span>
                    </div>
                  )}
                  {caseItem.propertyDetails.parcelNumber && (
                    <div className="p-3 rounded-lg bg-slate-50/70 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800">
                      <span className="text-slate-500 dark:text-slate-400 block font-medium">Flurstück / Flurnummer</span>
                      <span className="font-bold text-slate-900 dark:text-white mt-0.5 block">
                        {caseItem.propertyDetails.parcelNumber}
                      </span>
                    </div>
                  )}
                  {caseItem.propertyDetails.areaSqm != null && (
                    <div className="p-3 rounded-lg bg-slate-50/70 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800">
                      <span className="text-slate-500 dark:text-slate-400 block font-medium">Amtliche Fläche</span>
                      <span className="font-bold text-slate-900 dark:text-white mt-0.5 block">{caseItem.propertyDetails.areaSqm} m²</span>
                    </div>
                  )}
                  {caseItem.propertyDetails.economicUse && (
                    <div className="p-3 rounded-lg bg-slate-50/70 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800 sm:col-span-2">
                      <span className="text-slate-500 dark:text-slate-400 block font-medium">Wirtschaftsart / Nutzungsart</span>
                      <span className="font-bold text-slate-900 dark:text-white mt-0.5 block">{caseItem.propertyDetails.economicUse}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Financial Details & Mortgages */}
            {caseItem.financials && (caseItem.financials.dealValue != null || caseItem.financials.paymentDueDate || caseItem.financials.existingEncumbrances) && (
              <div className="bg-white dark:bg-slate-950 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      Kaufpreis, Gegenleistung & Belastungen
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Fälligkeitsbedingungen & Vorlasten (Abt. II & III)
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 text-xs font-semibold border border-blue-200 dark:border-blue-800">
                    Finanzabwicklung
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  {caseItem.financials.dealValue != null && (
                    <div className="p-3 rounded-lg bg-slate-50/70 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800">
                      <span className="text-slate-500 dark:text-slate-400 block font-medium">Kaufpreis / Geschäftswert</span>
                      <span className="text-base font-extrabold text-slate-900 dark:text-white mt-0.5 block">
                        {caseItem.financials.dealValue.toLocaleString("de-DE")} {caseItem.financials.currency || "EUR"}
                      </span>
                    </div>
                  )}
                  {caseItem.financials.paymentDueDate && (
                    <div className="p-3 rounded-lg bg-slate-50/70 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800">
                      <span className="text-slate-500 dark:text-slate-400 block font-medium">Fälligkeit</span>
                      <span className="font-bold text-slate-900 dark:text-white mt-0.5 block">
                        {caseItem.financials.paymentDueDate}
                      </span>
                    </div>
                  )}
                  {caseItem.financials.existingEncumbrances && (
                    <div className="p-3 rounded-lg bg-slate-50/70 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800 sm:col-span-2">
                      <span className="text-slate-500 dark:text-slate-400 block font-medium">
                        Vorlasten Abteilung II & III / Freistellungsauflagen
                      </span>
                      <p className="font-medium text-slate-900 dark:text-white mt-1 whitespace-pre-wrap">
                        {caseItem.financials.existingEncumbrances}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Special Details (Corporate / Inheritance) */}
            {caseItem.specialDetails && (caseItem.specialDetails.commercialRegister || caseItem.specialDetails.registerCourt || caseItem.specialDetails.shareCapital != null || caseItem.specialDetails.deceasedDate) && (
              <div className="bg-white dark:bg-slate-950 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      Register-, Gesellschafts- & Erbrechtsangaben
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Sonderangaben & gesellschaftsrechtliche Nachweise
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-400 text-xs font-semibold border border-purple-200 dark:border-purple-800">
                    Sonderdaten
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  {caseItem.specialDetails.commercialRegister && (
                    <div className="p-3 rounded-lg bg-slate-50/70 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800">
                      <span className="text-slate-500 dark:text-slate-400 block font-medium">Handelsregisternummer</span>
                      <span className="font-bold font-mono text-slate-900 dark:text-white mt-0.5 block">{caseItem.specialDetails.commercialRegister}</span>
                    </div>
                  )}
                  {caseItem.specialDetails.registerCourt && (
                    <div className="p-3 rounded-lg bg-slate-50/70 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800">
                      <span className="text-slate-500 dark:text-slate-400 block font-medium">Registergericht</span>
                      <span className="font-bold text-slate-900 dark:text-white mt-0.5 block">{caseItem.specialDetails.registerCourt}</span>
                    </div>
                  )}
                  {caseItem.specialDetails.shareCapital != null && (
                    <div className="p-3 rounded-lg bg-slate-50/70 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800">
                      <span className="text-slate-500 dark:text-slate-400 block font-medium">Stammkapital</span>
                      <span className="font-bold text-slate-900 dark:text-white mt-0.5 block">
                        {caseItem.specialDetails.shareCapital.toLocaleString("de-DE")} EUR
                      </span>
                    </div>
                  )}
                  {caseItem.specialDetails.deceasedDate && (
                    <div className="p-3 rounded-lg bg-slate-50/70 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800">
                      <span className="text-slate-500 dark:text-slate-400 block font-medium">Sterbedatum</span>
                      <span className="font-bold text-slate-900 dark:text-white mt-0.5 block">{caseItem.specialDetails.deceasedDate}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Document Processing & AI Extraction Workflow */}
            <DocumentWorkflow
              caseId={caseItem.id}
              caseNumber={caseItem.caseNumber}
              initialDocuments={documents}
              initialDrafts={drafts}
            />
          </div>

          {/* Sidebar Column: Procedural Stepper & Audit Log */}
          <div className="space-y-6">
            {/* Procedure Stepper */}
            <div className="bg-white dark:bg-slate-950 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
              <h2 className="text-base font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-3">
                Verfahrensstand
              </h2>

              <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-zinc-200 dark:before:bg-zinc-800 text-xs font-mono">
                {/* Step 1 */}
                <div className="relative">
                  <span className="absolute -left-6 top-0.5 w-4 h-4 rounded-[2px] bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 flex items-center justify-center text-[10px] font-bold">
                    1
                  </span>
                  <div>
                    <p className="font-bold text-zinc-900 dark:text-white">Urkundenrolle angelegt</p>
                    <p className="text-zinc-400 text-[11px] mt-0.5">Stammdaten & Aktenzeichen erfasst</p>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="relative">
                  <span
                    className={`absolute -left-6 top-0.5 w-4 h-4 rounded-[2px] flex items-center justify-center text-[10px] font-bold ${
                      caseItem.status !== "DRAFT"
                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
                        : "bg-zinc-300 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400"
                    }`}
                  >
                    2
                  </span>
                  <div>
                    <p className="font-bold text-zinc-900 dark:text-white">Grundbuch- & Beteiligtenprüfung</p>
                    <p className="text-zinc-400 text-[11px] mt-0.5">Vorprüfung der Rechtsverhältnisse</p>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="relative">
                  <span
                    className={`absolute -left-6 top-0.5 w-4 h-4 rounded-[2px] flex items-center justify-center text-[10px] font-bold ${
                      caseItem.status === "READY_FOR_NOTARIZATION" ||
                      caseItem.status === "NOTARIZED" ||
                      caseItem.status === "COMPLETED"
                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
                        : "bg-zinc-300 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400"
                    }`}
                  >
                    3
                  </span>
                  <div>
                    <p className="font-bold text-zinc-900 dark:text-white">Beurkundungsreife erteilt</p>
                    <p className="text-zinc-400 text-[11px] mt-0.5">Vertragsentwurf freigegeben</p>
                  </div>
                </div>

                {/* Step 4 */}
                <div className="relative">
                  <span
                    className={`absolute -left-6 top-0.5 w-4 h-4 rounded-[2px] flex items-center justify-center text-[10px] font-bold ${
                      caseItem.status === "NOTARIZED" || caseItem.status === "COMPLETED"
                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
                        : "bg-zinc-300 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400"
                    }`}
                  >
                    4
                  </span>
                  <div>
                    <p className="font-bold text-zinc-900 dark:text-white">Urkunde unterzeichnet</p>
                    <p className="text-zinc-400 text-[11px] mt-0.5">Beurkundung nach § 13 BeurkG</p>
                  </div>
                </div>

                {/* Step 5 */}
                <div className="relative">
                  <span
                    className={`absolute -left-6 top-0.5 w-4 h-4 rounded-[2px] flex items-center justify-center text-[10px] font-bold ${
                      caseItem.status === "COMPLETED"
                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
                        : "bg-zinc-300 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400"
                    }`}
                  >
                    5
                  </span>
                  <div>
                    <p className="font-bold text-zinc-900 dark:text-white">Vollzug & Archivierung</p>
                    <p className="text-zinc-400 text-[11px] mt-0.5">Grundbuchumschreibung erfolgt</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Compliance & Audit Log */}
            <div className="bg-white dark:bg-slate-950 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
              <h2 className="text-base font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-3">
                Revisionsprotokoll (Audit Trail)
              </h2>

              <div className="space-y-3.5 text-xs max-h-80 overflow-y-auto pr-1">
                {auditLogs.length > 0 ? (
                  auditLogs.map((log) => (
                    <div
                      key={log.id}
                      className="border-l-2 border-indigo-500 pl-3 py-0.5 space-y-0.5"
                    >
                      <p className="font-bold text-slate-800 dark:text-slate-200 font-mono text-[11px]">
                        {log.action}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {new Date(log.createdAt).toLocaleString("de-DE")} • {log.entityType}
                      </p>
                    </div>
                  ))
                ) : (
                  <>
                    <div className="border-l-2 border-indigo-500 pl-3 py-0.5 space-y-1">
                      <p className="font-bold text-slate-800 dark:text-slate-200">
                        Urkundsgeschäft initiiert
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {new Date(caseItem.createdAt).toLocaleString("de-DE")} • {caseItem.notaryName || "System"}
                      </p>
                    </div>

                    {caseItem.updatedAt !== caseItem.createdAt && (
                      <div className="border-l-2 border-slate-300 dark:border-slate-700 pl-3 py-0.5 space-y-1">
                        <p className="font-bold text-slate-800 dark:text-slate-200">
                          Aktualisierung des Verfahrensstands
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {new Date(caseItem.updatedAt).toLocaleString("de-DE")}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
