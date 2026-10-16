import { connection } from "next/server";
import { isDemoLoginEnabled } from "@/lib/auth/demo";
import { LoginForm } from "./login-form";

export const instant = false;

export default async function LoginPage() {
  await connection();


  return (
    <div className="app-shell min-h-screen bg-white dark:bg-zinc-950 flex flex-col justify-center items-center p-4 sm:p-6 font-sans tracking-tight text-zinc-900 dark:text-zinc-100">
      <main className="w-full max-w-sm bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-zinc-300 dark:border-zinc-800 shadow-sm p-6 sm:p-7 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-9 h-9 rounded bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 flex items-center justify-center text-lg font-bold mx-auto">
            KF
          </div>
          <h1 className="text-sm font-bold tracking-tight text-zinc-900 dark:text-white pt-1">
            KanzleiFlow Anmeldung
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Ihr Zugang zur digitalen Aktenverwaltung
          </p>
        </div>

        {/* Form */}
        <LoginForm allowDemoLogin={isDemoLoginEnabled()} />

        {/* Security Footer Notice */}
        <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 text-center space-y-1">
          <p className="text-xs text-zinc-400">
            Technische Demo · Keine juristische Prüfung.
          </p>
          <p className="text-xs text-zinc-500 font-sans">
            Zugriff nur für berechtigte Mitarbeitende
          </p>
        </div>
      </main>
    </div>
  );
}
