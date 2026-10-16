"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteCaseAction } from "@/app/actions/cases";

interface DeleteCaseButtonProps {
  caseId: string;
  caseNumber: string;
  caseTitle: string;
  variant?: "danger-outline" | "button" | "compact";
  redirectTo?: string;
  className?: string;
}

function TrashIcon() {
  return (
    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

export function DeleteCaseButton({
  caseId,
  caseNumber,
  caseTitle,
  variant = "danger-outline",
  redirectTo,
  className = "",
}: DeleteCaseButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const router = useRouter();

  const handleDelete = () => {
    setErrorMessage(null);
    startTransition(async () => {
      const result = await deleteCaseAction(caseId);
      if (result.success) {
        setIsOpen(false);
        if (redirectTo) {
          router.push(redirectTo);
        } else {
          router.refresh();
        }
      } else {
        setErrorMessage(result.error || "Fehler beim Löschen der Akte.");
      }
    });
  };

  return (
    <>
      {variant === "danger-outline" && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-rose-300 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20 text-sm font-sans font-medium text-rose-700 dark:text-rose-400 hover:bg-rose-100/70 dark:hover:bg-rose-900/40  transition-colors duration-150 ${className}`}
          title="Akte löschen"
        >
          <TrashIcon />
          <span>Akte löschen</span>
        </button>
      )}

      {variant === "compact" && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className={`inline-flex items-center justify-center p-1.5 rounded-lg border border-transparent text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-300 dark:hover:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-950/30  transition-colors duration-150 text-sm ${className}`}
          title="Akte löschen"
          aria-label="Akte löschen"
        >
          <TrashIcon />
        </button>
      )}

      {variant === "button" && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className={`inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-sans font-medium  transition-colors duration-150 ${className}`}
        >
          <TrashIcon />
          <span>Akte löschen</span>
        </button>
      )}

      {/* Confirmation Modal */}
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => !isPending && setIsOpen(false)}
        >
          <div
            className="bg-white dark:bg-zinc-950 rounded-[6px] border border-zinc-300 dark:border-zinc-800 shadow-2xl max-w-md w-full p-6 space-y-5 animate-in zoom-in-95 duration-150 font-sans"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3.5">
              <div className="w-9 h-9 rounded-lg bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <AlertIcon />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                  Akte unwiderruflich löschen?
                </h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  Möchten Sie die Akte{" "}
                  <strong className="text-zinc-900 dark:text-white font-semibold">
                    {caseNumber}
                  </strong>{" "}
                  („{caseTitle}“) wirklich entfernen?
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 text-sm text-rose-900 dark:text-rose-200 space-y-1.5">
              <p className="font-bold text-rose-700 dark:text-rose-300">
                Folgen der Löschung:
              </p>
              <ul className="list-disc list-inside space-y-1 text-xs text-rose-800 dark:text-rose-300/90 leading-relaxed">
                <li>Alle hochgeladenen Dokumente werden physisch vom Speicher gelöscht.</li>
                <li>Zugehörige KI-Extraktionsergebnisse werden unwiderruflich bereinigt.</li>
                <li>Alle generierten Entwurfsversionen (.docx & .txt) werden entfernt.</li>
                <li>Die Löschung wird als technisches Ereignis protokolliert.</li>
              </ul>
            </div>

            {errorMessage && (
              <div className="p-3 rounded-lg bg-rose-100 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-sm font-semibold">
                {errorMessage}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                disabled={isPending}
                className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm font-sans text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800  transition-colors duration-150 disabled:opacity-50"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-sans font-medium  transition-colors duration-150 inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {isPending ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded animate-spin" />
                    <span>Wird gelöscht...</span>
                  </>
                ) : (
                  <>
                    <TrashIcon />
                    <span>Endgültig löschen</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
