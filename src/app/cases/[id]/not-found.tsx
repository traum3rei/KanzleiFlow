import Link from "next/link";
import { Navigation } from "@/components/navigation";

export default function CaseNotFound() {
  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col font-mono tracking-tight">
      <Navigation dbConnected={false} />

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-16 text-center space-y-4">
        <div className="inline-block px-2.5 py-1 rounded-[4px] bg-zinc-100 dark:bg-zinc-800 text-xs font-bold text-zinc-600 dark:text-zinc-400">
          [404: nicht gefunden]
        </div>
        <h1 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
          Akte nicht gefunden
        </h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Die angeforderte Akte existiert nicht oder gehört nicht zu Ihrem berechtigten Notariats-Mandanten.
        </p>
        <div className="pt-4">
          <Link
            href="/cases"
            className="px-3 py-1.5 text-xs font-mono font-medium text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-950 hover:bg-zinc-800 rounded-[4px] active:scale-[0.98] transition-transform duration-150"
          >
            zurück zur aktenverwaltung
          </Link>
        </div>
      </main>
    </div>
  );
}
