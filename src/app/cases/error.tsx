"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function CasesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Cases Error Boundary caught:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col items-center justify-center p-4 font-mono tracking-tight">
      <div className="max-w-md w-full bg-zinc-50 dark:bg-zinc-900 p-6 rounded-[4px] border border-zinc-200 dark:border-zinc-800 text-center space-y-4">
        <div className="inline-block px-2 py-0.5 rounded-[2px] bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-400 text-xs font-bold uppercase">
          [systemfehler]
        </div>
        <h2 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
          Fehler beim Laden der Akten
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {error.message || "Es ist ein unerwarteter Fehler beim Abrufen der Daten aufgetreten."}
        </p>
        <div className="flex justify-center space-x-2 pt-2">
          <button
            onClick={() => reset()}
            className="px-3 py-1.5 text-xs font-mono font-medium rounded-[4px] bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 hover:bg-zinc-800 active:scale-[0.98] transition-transform duration-150"
          >
            erneut versuchen
          </button>
          <Link
            href="/"
            className="px-3 py-1.5 text-xs font-mono rounded-[4px] border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 active:scale-[0.98] transition-transform duration-150"
          >
            zurück zur übersicht
          </Link>
        </div>
      </div>
    </div>
  );
}
