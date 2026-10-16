import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getTenantContextOrRedirect, TenantIsolationError } from "@/lib/auth/tenant";
import { getCaseById, getAvailableAssignees } from "@/lib/services/case-service";
import { CaseForm } from "../../new/case-form";

export const instant = false;

export default async function EditCasePage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const tenant = await getTenantContextOrRedirect();
  const [record, assignees] = await Promise.all([
    getCaseById(tenant, id).catch((error: unknown) => { if (error instanceof TenantIsolationError) notFound(); throw error; }), getAvailableAssignees(tenant),
  ]);
  if (!record) notFound();
  const availableAssignees = Array.from(new Set([...assignees, ...(record.assignedClerk ? [record.assignedClerk] : [])]));
  return (
    <>
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="space-y-3">
          <Link prefetch={true} href={`/cases/${id}`} className="text-sm text-zinc-600 dark:text-zinc-300 hover:underline">Zurück zur Akte</Link>
          <h1>Akte bearbeiten</h1>
          <p className="text-sm text-zinc-500">{record.caseNumber} · {record.title}</p>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">Änderungen werden erst mit „Änderungen speichern“ übernommen. Bereits erzeugte Dokumentversionen und Exportpakete bleiben erhalten.</p>
        </div>
        {tenant.userRole === "VIEWER"
          ? <p role="alert">Sie haben Lesezugriff und können diese Akte nicht bearbeiten.</p>
          : <CaseForm key={record.id} initialCase={record} assignees={availableAssignees} />}
      </main>
    </>
  );
}
