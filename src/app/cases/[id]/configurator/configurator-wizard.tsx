"use client";

import { useState, useTransition, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DocumentConfigurationData,
  ConfiguredParty,
  ConfiguredTerms,
  RulesEvaluationResult,
} from "@/lib/configurator/types";
import { REAL_ESTATE_CLAUSES, REAL_ESTATE_TEMPLATE_VERSION } from "@/lib/configurator/clauses";
import { evaluateConfiguration } from "@/lib/configurator/rules-engine";
import {
  saveConfigurationAction,
  generateConfiguredDraftAction,
  prefillConfigurationAction,
} from "@/app/actions/configurator";

interface GeneratedVersionSummary {
  id: string;
  version: number;
  templateVersionString: string;
  title: string;
  createdAt: string | Date;
}

interface ConfiguratorWizardProps {
  caseId: string;
  caseNumber: string;
  caseTitle: string;
  configurationId: string;
  initialData: DocumentConfigurationData;
  initialStep?: number;
  initialStatus?: string;
  initialVersion?: number;
  generatedVersions: GeneratedVersionSummary[];
  hasApprovedExtraction: boolean;
}

export function ConfiguratorWizard({
  caseId,
  caseNumber,
  caseTitle,
  configurationId,
  initialData,
  initialStep = 1,
  initialVersion = 1,
  generatedVersions: initialVersions = [],
  hasApprovedExtraction,
}: ConfiguratorWizardProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<number>(initialStep || 1);
  const versionRef = useRef(initialVersion || 1);
  const dataRef = useRef(initialData);
  const dirtyRef = useRef(false);
  const pendingRef = useRef<{ data: DocumentConfigurationData; step: number } | null>(null);
  const savingRef = useRef<Promise<boolean> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const operationRef = useRef(false);
  const [formData, setFormData] = useState<DocumentConfigurationData>(initialData);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [generatedVersions, setGeneratedVersions] = useState<GeneratedVersionSummary[]>(initialVersions);
  const [isPending, startTransition] = useTransition();

  // Evaluate rules on current state
  const evaluation: RulesEvaluationResult = evaluateConfiguration(
    formData,
    formData.selectedClauseCodes || []
  );

  // Only one save may use a version at a time. Coalesce edits made while saving.
  const flushSave = useCallback(async (): Promise<boolean> => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (savingRef.current) return savingRef.current;
    const operation = (async () => {
      while (pendingRef.current) {
        const snapshot = pendingRef.current;
        pendingRef.current = null;
        setSaveStatus("saving");
        try {
          const res = await saveConfigurationAction(configurationId, snapshot.data, snapshot.step, versionRef.current);
          if (!res.success || !res.data) throw new Error(res.error || "Speichern fehlgeschlagen.");
          const payload = res.data as { updated: { version: number } };
          versionRef.current = payload.updated.version;
        } catch (error) {
          // Preserve the latest edits for an explicit retry; never overwrite a conflict.
          pendingRef.current ??= snapshot;
          setSaveStatus("error");
          setErrorMessage(error instanceof Error ? error.message : "Speichern fehlgeschlagen. Bitte erneut versuchen.");
          return false;
        }
      }
      dirtyRef.current = false;
      setSaveStatus("saved");
      setErrorMessage(null);
      return true;
    })();
    savingRef.current = operation;
    try { return await operation; }
    finally { savingRef.current = null; }
  }, [configurationId]);

  const triggerSave = (data: DocumentConfigurationData, step: number) => {
    dirtyRef.current = true;
    pendingRef.current = { data, step };
    setSaveStatus("saving");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { void flushSave(); }, 600);
  };

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) { event.preventDefault(); event.returnValue = ""; }
    };
    // Finish saving before following internal navigation.
    const beforeNavigate = (event: MouseEvent) => {
      if (dirtyRef.current && event.target instanceof Element && event.target.closest("a[href]")) {
        event.preventDefault();
        event.stopPropagation();
        const anchor = event.target.closest("a[href]") as HTMLAnchorElement;
        const href = anchor.href;
        void flushSave().then((saved) => { if (saved) router.push(href); });
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", beforeNavigate, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", beforeNavigate, true);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [flushSave, router]);

  const updateData = (updater: (prev: DocumentConfigurationData) => DocumentConfigurationData) => {
    if (operationRef.current) return;
    const next = updater(dataRef.current);
    dataRef.current = next;
    setFormData(next);
    triggerSave(next, currentStep);
  };

  const goToStep = (step: number) => {
    setCurrentStep(step);
    triggerSave(dataRef.current, step);
  };

  // Parties Handlers (Step 1)
  const addParty = (role: ConfiguredParty["role"]) => {
    updateData((prev) => ({
      ...prev,
      parties: [
        ...prev.parties,
        {
          id: `p_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          role,
          name: "",
          address: "",
          actingForSelf: true,
          maritalStatus: "ledig",
        },
      ],
    }));
  };

  const removeParty = (id: string) => {
    updateData((prev) => ({
      ...prev,
      parties: prev.parties.filter((p) => p.id !== id),
    }));
  };

  const updateParty = (id: string, updates: Partial<ConfiguredParty>) => {
    updateData((prev) => ({
      ...prev,
      parties: prev.parties.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    }));
  };

  // Clause Toggle (Step 4)
  const toggleClause = (code: string) => {
    updateData((prev) => {
      const current = new Set(prev.selectedClauseCodes || []);
      if (current.has(code)) {
        current.delete(code);
      } else {
        current.add(code);
      }
      return {
        ...prev,
        selectedClauseCodes: Array.from(current),
      };
    });
  };

  // 1-Click Import from AI extraction
  const handleImportApprovedData = () => {
    if (!confirm("Möchten Sie die freigegebenen KI-Extraktionsdaten in diese Konfiguration importieren? Bisherige Eingaben werden aktualisiert.")) {
      return;
    }
    if (operationRef.current) return;
    operationRef.current = true;
    setErrorMessage(null);
    startTransition(async () => {
      try {
      if (!(await flushSave())) return;
      const res = await prefillConfigurationAction(caseId);
      if (res.success && res.data) {
        const imported = res.data as { id: string };
        router.push(`/cases/${caseId}/configurator?configId=${imported.id}`);
        router.refresh();
      } else {
        setErrorMessage(res.error || "Import fehlgeschlagen.");
      }
      } catch { setErrorMessage("Datenübernahme fehlgeschlagen. Bitte erneut versuchen."); }
      finally { operationRef.current = false; }
    });
  };

  // Draft Generation (Step 6)
  const handleGenerateDraft = () => {
    if (!evaluation.canGenerateDraft) {
      setErrorMessage("Entwurfsgenerierung nicht zulässig. Bitte beheben Sie zunächst alle markierten Validierungsfehler.");
      return;
    }

    if (operationRef.current) return;
    operationRef.current = true;
    setErrorMessage(null);
    startTransition(async () => {
      try {
      if (!(await flushSave())) return;
      const res = await generateConfiguredDraftAction(configurationId);
      if (res.success && res.data) {
        const genData = res.data as { versionId: string; version: number; title: string };
        setGeneratedVersions((prev) => [
          {
            id: genData.versionId,
            version: genData.version,
            title: genData.title,
            templateVersionString: REAL_ESTATE_TEMPLATE_VERSION,
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ]);
        setCurrentStep(6);
      } else {
        setErrorMessage(res.error || "Fehler bei der Dokumentgenerierung.");
      }
      } catch { setErrorMessage("Entwurf konnte nicht erstellt werden. Bitte erneut versuchen."); }
      finally { operationRef.current = false; }
    });
  };

  const stepLabels = [
    "1. Beteiligte",
    "2. Grundstück",
    "3. Kaufpreis",
    "4. Regelungen",
    "5. Prüfung",
    "6. Entwurf",
  ];

  return (
    <div className="space-y-6 font-sans tracking-tight text-zinc-900 dark:text-zinc-100">
      {/* Top Banner & Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 text-sm font-semibold">
              Immobilienkaufvertrag
            </span>
            <span className="text-sm text-zinc-500">v{REAL_ESTATE_TEMPLATE_VERSION}</span>
            <span className="text-zinc-300 dark:text-zinc-700">•</span>
            <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300">
              {caseNumber} — {caseTitle}
            </span>
          </div>
          <h2 className="text-sm font-bold mt-1 text-zinc-900 dark:text-white">
            Vertragsentwurf vorbereiten
          </h2>
        </div>

        <div className="flex items-center gap-3">
          {hasApprovedExtraction && (
            <button
              type="button"
              onClick={handleImportApprovedData}
              disabled={isPending}
              className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-sm text-zinc-800 dark:text-zinc-200  transition-transform flex items-center gap-1.5"
              title="Daten aus freigegebener KI-Extraktion übernehmen"
            >

              <span>KI-Daten übernehmen</span>
            </button>
          )}

          <div role="status" aria-live="polite" className="text-sm text-zinc-500">
            {saveStatus === "saving" && <span className="text-zinc-500">Wird gespeichert …</span>}
            {saveStatus === "saved" && <span className="text-emerald-600 dark:text-emerald-400 font-bold">Gespeichert</span>}
            {saveStatus === "error" && <span className="text-rose-600 font-bold">Speichern fehlgeschlagen</span>}
            {saveStatus === "idle" && <span className="text-zinc-400">Änderungen werden automatisch gespeichert</span>}
          </div>
        </div>
      </div>

      {errorMessage && (
        <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-sm text-rose-800 dark:text-rose-300">
          <span className="font-bold">Vorgang fehlgeschlagen: </span>
          {errorMessage}
          {saveStatus === "error" && <button type="button" onClick={() => void flushSave()} className="ml-3 underline font-semibold">Speichern erneut versuchen</button>}
        </div>
      )}

      <fieldset disabled={isPending} className="space-y-6 min-w-0 border-0 p-0">
      <legend className="sr-only">Vertragsdaten und Entwurf</legend>
      {/* Step Progress Navigation Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {stepLabels.map((label, idx) => {
          const stepNum = idx + 1;
          const isCurrent = currentStep === stepNum;
          const isPassed = currentStep > stepNum;

          // Check if step has errors
          const stepErrors = evaluation.errors.filter((e) => e.step === stepNum);
          const hasErrors = stepErrors.length > 0 && (currentStep >= 5 || isPassed);

          return (
            <button
              key={stepNum}
              type="button"
              aria-current={isCurrent ? "step" : undefined}
              onClick={() => goToStep(stepNum)}
              className={`p-2.5 rounded-lg border text-left transition  ${
                isCurrent
                  ? "bg-blue-800 text-white dark:bg-blue-600 dark:text-white border-blue-800 dark:border-blue-600 font-semibold"
                  : hasErrors
                  ? "bg-rose-50/50 dark:bg-rose-950/30 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-300"
                  : isPassed
                  ? "bg-zinc-50 dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200"
                  : "bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-500"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm leading-snug">{label}</span>
                {hasErrors && (
                  <span className="text-xs px-1 py-0.2 rounded bg-rose-600 text-white font-bold shrink-0 ml-1">
                    !
                  </span>
                )}
                {!hasErrors && isPassed && (
                  <span className="text-xs text-zinc-400 font-bold shrink-0 ml-1">[ok]</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* STEP CONTENT CONTAINER */}
      <div className="p-6 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 space-y-6">
        {/* ================================================================= */}
        {/* STEP 1: BETEILIGTE */}
        {/* ================================================================= */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-3">
              <div>
                <h3 className="text-sm font-semibold">Schritt 1: Beteiligte der Urkunde</h3>
                <p className="text-sm text-zinc-500 mt-0.5">
                  Erfassung von Verkäufern, Käufern, deren Anschriften, Steuer-IDs und Vertretungsverhältnissen.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => addParty("Verkäufer")}
                  className="px-2.5 py-1 rounded-lg border border-zinc-300 dark:border-zinc-700 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900 "
                >
                  + Verkäufer
                </button>
                <button
                  type="button"
                  onClick={() => addParty("Käufer")}
                  className="px-2.5 py-1 rounded-lg border border-zinc-300 dark:border-zinc-700 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900 "
                >
                  + Käufer
                </button>
              </div>
            </div>

            {formData.parties.length === 0 ? (
              <div className="p-8 text-center text-sm text-zinc-400 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg">
                Keine Beteiligten angelegt. Klicken Sie oben auf „+ Verkäufer“ oder „+ Käufer“.
              </div>
            ) : (
              <div className="space-y-4">
                {formData.parties.map((party, idx) => (
                  <div
                    key={party.id}
                    className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 space-y-3"
                  >
                    <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={party.role}
                          onChange={(e) =>
                            updateParty(party.id, { role: e.target.value as ConfiguredParty["role"] })
                          }
                          className="px-2 py-0.5 rounded bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm font-bold"
                        >
                          <option value="Verkäufer">Verkäufer</option>
                          <option value="Käufer">Käufer</option>
                          <option value="Beteiligter">Sonstiger Beteiligter</option>
                        </select>
                        <span className="text-sm text-zinc-400 font-bold">#{idx + 1}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeParty(party.id)}
                        className="text-sm text-rose-600 hover:text-rose-700 font-bold"
                      >
                        [Entfernen]
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                      <div className="space-y-1">
                        <label className="font-bold text-zinc-600 dark:text-zinc-400">Vollständiger Name *</label>
                        <input aria-label="Vollständiger Name *"
                          type="text"
                          value={party.name || ""}
                          onChange={(e) => updateParty(party.id, { name: e.target.value })}
                          placeholder="z.B. Dr. Barbara Lindner"
                          className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:border-zinc-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="font-bold text-zinc-600 dark:text-zinc-400">Straße & Hausnummer *</label>
                        <input aria-label="Straße & Hausnummer *"
                          type="text"
                          value={party.address || ""}
                          onChange={(e) => updateParty(party.id, { address: e.target.value })}
                          placeholder="z.B. Königinstr. 12"
                          className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:border-zinc-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="font-bold text-zinc-600 dark:text-zinc-400">PLZ & Ort</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={party.postalCode || ""}
                            onChange={(e) => updateParty(party.id, { postalCode: e.target.value })}
                            placeholder="80539"
                            className="w-20 px-2 py-1.5 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700"
                          />
                          <input
                            type="text"
                            value={party.city || ""}
                            onChange={(e) => updateParty(party.id, { city: e.target.value })}
                            placeholder="München"
                            className="flex-1 px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="font-bold text-zinc-600 dark:text-zinc-400">Steuer-ID (IdNr)</label>
                        <input aria-label="Steuer-ID (IdNr)"
                          type="text"
                          value={party.taxId || ""}
                          onChange={(e) => updateParty(party.id, { taxId: e.target.value })}
                          placeholder="z.B. 12 345 678 901"
                          className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="font-bold text-zinc-600 dark:text-zinc-400">Geburtsdatum</label>
                        <input aria-label="Geburtsdatum"
                          type="date"
                          value={party.birthDate || ""}
                          onChange={(e) => updateParty(party.id, { birthDate: e.target.value })}
                          className="w-full px-2 py-1.5 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="font-bold text-zinc-600 dark:text-zinc-400">Familienstand / Güterstand</label>
                        <select aria-label="Familienstand / Güterstand"
                          value={party.maritalStatus || "ledig"}
                          onChange={(e) =>
                            updateParty(party.id, { maritalStatus: e.target.value as ConfiguredParty["maritalStatus"] })
                          }
                          className="w-full px-2 py-1.5 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700"
                        >
                          <option value="ledig">Ledig</option>
                          <option value="verheiratet">Verheiratet (Zugewinngemeinschaft)</option>
                          <option value="Gütertrennung">Gütertrennung (Ehevertrag)</option>
                          <option value="Gütergemeinschaft">Gütergemeinschaft</option>
                          <option value="geschieden">Geschieden</option>
                        </select>
                      </div>
                    </div>

                    <div className="pt-2 flex items-center gap-4 text-sm">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={party.actingForSelf ?? true}
                          onChange={(e) => updateParty(party.id, { actingForSelf: e.target.checked })}
                          className="rounded"
                        />
                        <span>Handelt im eigenen Namen (keine Vertretung)</span>
                      </label>

                      {!party.actingForSelf && (
                        <div className="flex-1">
                          <input
                            type="text"
                            value={party.representativeName || ""}
                            onChange={(e) => updateParty(party.id, { representativeName: e.target.value })}
                            placeholder="Name des Vertreters / Vollmachtsnachweis"
                            className="w-full px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* STEP 2: GRUNDSTÜCK */}
        {/* ================================================================= */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <div className="border-b border-zinc-200 dark:border-zinc-800 pb-3">
              <h3 className="text-sm font-semibold">Schritt 2: Kaufgegenstand & Grundbuchbeschrieb</h3>
              <p className="text-sm text-zinc-500 mt-0.5">
                Angaben zum Grundbuchbezirk, Blatt, Flurstück, Anschrift sowie vorhandenen Belastungen.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
              <div className="space-y-1">
                <label className="font-bold text-zinc-600 dark:text-zinc-400">Grundbuchbezirk / Amtsgericht *</label>
                <input aria-label="Grundbuchbezirk / Amtsgericht *"
                  type="text"
                  value={formData.property.landRegistryDistrict || ""}
                  onChange={(e) =>
                    updateData((prev) => ({
                      ...prev,
                      property: { ...prev.property, landRegistryDistrict: e.target.value },
                    }))
                  }
                  placeholder="z.B. München-Schwabing"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-zinc-600 dark:text-zinc-400">Grundbuchblatt-Nummer *</label>
                <input aria-label="Grundbuchblatt-Nummer *"
                  type="text"
                  value={formData.property.sheetNumber || ""}
                  onChange={(e) =>
                    updateData((prev) => ({
                      ...prev,
                      property: { ...prev.property, sheetNumber: e.target.value },
                    }))
                  }
                  placeholder="z.B. 4521"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-zinc-600 dark:text-zinc-400">Gemarkung</label>
                <input aria-label="Gemarkung"
                  type="text"
                  value={formData.property.cadastralDistrict || ""}
                  onChange={(e) =>
                    updateData((prev) => ({
                      ...prev,
                      property: { ...prev.property, cadastralDistrict: e.target.value },
                    }))
                  }
                  placeholder="z.B. Schwabing"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-zinc-600 dark:text-zinc-400">Flurstücksnummer / Flur *</label>
                <input aria-label="Flurstücksnummer / Flur *"
                  type="text"
                  value={formData.property.parcelNumber || ""}
                  onChange={(e) =>
                    updateData((prev) => ({
                      ...prev,
                      property: { ...prev.property, parcelNumber: e.target.value },
                    }))
                  }
                  placeholder="z.B. Flur 14, Flurstück 88/2"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700"
                />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label className="font-bold text-zinc-600 dark:text-zinc-400">Lagebezeichnung / Straßenadresse *</label>
                <input aria-label="Lagebezeichnung / Straßenadresse *"
                  type="text"
                  value={formData.property.streetAddress || ""}
                  onChange={(e) =>
                    updateData((prev) => ({
                      ...prev,
                      property: { ...prev.property, streetAddress: e.target.value },
                    }))
                  }
                  placeholder="z.B. Kaiserstraße 18, 80801 München"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-zinc-600 dark:text-zinc-400">Grundstücksgröße (m²)</label>
                <input aria-label="Grundstücksgröße (m²)"
                  type="number"
                  value={formData.property.plotAreaSqm || ""}
                  onChange={(e) =>
                    updateData((prev) => ({
                      ...prev,
                      property: { ...prev.property, plotAreaSqm: Number(e.target.value) || null },
                    }))
                  }
                  placeholder="850"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700"
                />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label className="font-bold text-zinc-600 dark:text-zinc-400">Wirtschaftsart / Bebauung</label>
                <input aria-label="Wirtschaftsart / Bebauung"
                  type="text"
                  value={formData.property.economicUse || ""}
                  onChange={(e) =>
                    updateData((prev) => ({
                      ...prev,
                      property: { ...prev.property, economicUse: e.target.value },
                    }))
                  }
                  placeholder="z.B. Wohnbaufläche, Einfamilienhaus mit Garage"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700"
                />
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* STEP 3: KAUFPREIS */}
        {/* ================================================================= */}
        {currentStep === 3 && (
          <div className="space-y-6">
            <div className="border-b border-zinc-200 dark:border-zinc-800 pb-3">
              <h3 className="text-sm font-semibold">Schritt 3: Kaufpreis & Zahlungsmodalitäten</h3>
              <p className="text-sm text-zinc-500 mt-0.5">
                Festlegung des Kaufpreises, Zahlungswege (Direktzahlung / Anderkonto) und Finanzierungsvollmachten.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
              <div className="space-y-1">
                <label className="font-bold text-zinc-600 dark:text-zinc-400">Kaufpreis (in EUR) *</label>
                <input aria-label="Kaufpreis (in EUR) *"
                  type="number"
                  value={formData.purchasePrice.amount || ""}
                  onChange={(e) =>
                    updateData((prev) => ({
                      ...prev,
                      purchasePrice: { ...prev.purchasePrice, amount: Number(e.target.value) || 0 },
                    }))
                  }
                  placeholder="1850000"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-zinc-600 dark:text-zinc-400">Fälligkeitsstichtag</label>
                <input aria-label="Fälligkeitsstichtag"
                  type="date"
                  value={formData.purchasePrice.paymentDueDate || ""}
                  onChange={(e) =>
                    updateData((prev) => ({
                      ...prev,
                      purchasePrice: { ...prev.purchasePrice, paymentDueDate: e.target.value },
                    }))
                  }
                  className="w-full px-2 py-1.5 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700"
                />
              </div>

              <div className="space-y-1 sm:col-span-3">
                <label className="font-bold text-zinc-600 dark:text-zinc-400">Fälligkeitsbedingungen (Notarielle Mitteilung)</label>
                <textarea aria-label="Fälligkeitsbedingungen (Notarielle Mitteilung)"
                  rows={2}
                  value={formData.purchasePrice.paymentConditionsDescription || ""}
                  onChange={(e) =>
                    updateData((prev) => ({
                      ...prev,
                      purchasePrice: { ...prev.purchasePrice, paymentConditionsDescription: e.target.value },
                    }))
                  }
                  placeholder="Fälligkeitsmitteilung nach Vormerkung, Lastenfreistellung und Verzicht auf Vorkaufsrechte."
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700"
                />
              </div>

              {/* Notaranderkonto Checkbox & Reason */}
              <div className="sm:col-span-3 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer font-bold">
                  <input
                    type="checkbox"
                    checked={formData.purchasePrice.useEscrowAccount}
                    onChange={(e) =>
                      updateData((prev) => ({
                        ...prev,
                        purchasePrice: { ...prev.purchasePrice, useEscrowAccount: e.target.checked },
                      }))
                    }
                    className="rounded"
                  />
                  <span>Abwicklung über Notaranderkonto gem. § 54a BeurkG</span>
                </label>

                {formData.purchasePrice.useEscrowAccount && (
                  <div className="space-y-1 pl-6 pt-1">
                    <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400">
                      Berechtigtes Sicherungsinteresse gem. § 54a Abs. 2 BeurkG *
                    </label>
                    <input aria-label="Berechtigtes Sicherungsinteresse gem. § 54a Abs. 2 BeurkG *"
                      type="text"
                      value={formData.purchasePrice.escrowReason || ""}
                      onChange={(e) =>
                        updateData((prev) => ({
                          ...prev,
                          purchasePrice: { ...prev.purchasePrice, escrowReason: e.target.value },
                        }))
                      }
                      placeholder="z.B. Vorzeitige Kaufpreiszahlung vor Vorliegen aller Löschungsbewilligungen der Grundpfandgläubiger"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-sm"
                    />
                  </div>
                )}
              </div>

              {/* Bank Details */}
              <div className="sm:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800">
                <div className="space-y-1">
                  <label className="font-bold text-zinc-600 dark:text-zinc-400">Empfänger-IBAN (Verkäufer)</label>
                  <input aria-label="Empfänger-IBAN (Verkäufer)"
                    type="text"
                    value={formData.purchasePrice.sellerBankDetails?.iban || ""}
                    onChange={(e) =>
                      updateData((prev) => ({
                        ...prev,
                        purchasePrice: {
                          ...prev.purchasePrice,
                          sellerBankDetails: {
                            ...prev.purchasePrice.sellerBankDetails,
                            iban: e.target.value,
                          },
                        },
                      }))
                    }
                    placeholder="DE89 7002 0270 0012 3456 78"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-zinc-600 dark:text-zinc-400">Kreditinstitut (Bank)</label>
                  <input aria-label="Kreditinstitut (Bank)"
                    type="text"
                    value={formData.purchasePrice.sellerBankDetails?.bankName || ""}
                    onChange={(e) =>
                      updateData((prev) => ({
                        ...prev,
                        purchasePrice: {
                          ...prev.purchasePrice,
                          sellerBankDetails: {
                            ...prev.purchasePrice.sellerBankDetails,
                            bankName: e.target.value,
                          },
                        },
                      }))
                    }
                    placeholder="z.B. HypoVereinsbank München"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700"
                  />
                </div>
              </div>

              {/* Financing Section */}
              <div className="sm:col-span-3 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer font-bold">
                  <input
                    type="checkbox"
                    checked={formData.purchasePrice.financingRequired}
                    onChange={(e) =>
                      updateData((prev) => ({
                        ...prev,
                        purchasePrice: { ...prev.purchasePrice, financingRequired: e.target.checked },
                      }))
                    }
                    className="rounded"
                  />
                  <span>Käufer finanziert mit Grundschuldbestellung vor Eigentumsumschreibung (Belastungsvollmacht)</span>
                </label>

                {formData.purchasePrice.financingRequired && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-6 pt-1">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400">Darlehensbetrag (EUR)</label>
                      <input aria-label="Darlehensbetrag (EUR)"
                        type="number"
                        value={formData.purchasePrice.financingAmount || ""}
                        onChange={(e) =>
                          updateData((prev) => ({
                            ...prev,
                            purchasePrice: { ...prev.purchasePrice, financingAmount: Number(e.target.value) || null },
                          }))
                        }
                        placeholder="1400000"
                        className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400">Finanzierende Bank / Gläubigerin</label>
                      <input aria-label="Finanzierende Bank / Gläubigerin"
                        type="text"
                        value={formData.purchasePrice.financingBankName || ""}
                        onChange={(e) =>
                          updateData((prev) => ({
                            ...prev,
                            purchasePrice: { ...prev.purchasePrice, financingBankName: e.target.value },
                          }))
                        }
                        placeholder="z.B. Bayerische Landesbank"
                        className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* STEP 4: REGELUNGEN (CLAUSE SELECTION & RULES) */}
        {/* ================================================================= */}
        {currentStep === 4 && (
          <div className="space-y-6">
            <div className="border-b border-zinc-200 dark:border-zinc-800 pb-3">
              <h3 className="text-sm font-semibold">Schritt 4: Vertragliche Regelungen & Klauselauswahl</h3>
              <p className="text-sm text-zinc-500 mt-0.5">
                Auswahl modularer Vertragsklauseln. Die Regeln-Engine prüft automatisch Abhängigkeiten und Inkompatibilitäten.
              </p>
            </div>

            {/* Incompatible Pairs Alert */}
            {evaluation.incompatibleClausePairs.length > 0 && (
              <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-sm text-rose-800 dark:text-rose-300 space-y-1">
                <span className="font-bold">[inkompatibilität]</span>
                {evaluation.incompatibleClausePairs.map((pair, idx) => (
                  <p key={idx}>{pair.reason}</p>
                ))}
              </div>
            )}

            {/* Unsatisfied Dependencies Alert */}
            {evaluation.unsatisfiedDependencies.length > 0 && (
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-300 space-y-1">
                <span className="font-bold">[abhängigkeit fehlt]</span>
                {evaluation.unsatisfiedDependencies.map((dep, idx) => (
                  <p key={idx}>{dep.reason}</p>
                ))}
              </div>
            )}

            <div className="space-y-3">
              {REAL_ESTATE_CLAUSES.map((clause) => {
                const isSelected = (formData.selectedClauseCodes || []).includes(clause.code);

                // Check clause dependency / incompatibility status
                const hasUnsatisfiedDep = evaluation.unsatisfiedDependencies.some(
                  (d) => d.clauseCode === clause.code
                );
                const hasIncompatibility = evaluation.incompatibleClausePairs.some(
                  (p) => p.clauseA === clause.code || p.clauseB === clause.code
                );

                return (
                  <div
                    key={clause.code}
                    className={`p-3.5 rounded-lg border transition ${
                      isSelected
                        ? hasIncompatibility || hasUnsatisfiedDep
                          ? "border-rose-300 bg-rose-50/20 dark:border-rose-800 dark:bg-rose-950/20"
                          : "border-zinc-400 dark:border-zinc-600 bg-zinc-50/80 dark:bg-zinc-900/40"
                        : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 opacity-80"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <label className="flex items-start gap-3 cursor-pointer flex-1">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleClause(clause.code)}
                          className="mt-0.5 rounded"
                        />
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-bold text-zinc-900 dark:text-white">
                              {clause.title}
                            </span>
                            <span className="text-xs px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                              {clause.category}
                            </span>
                            {clause.isDefault && (
                              <span className="text-xs text-zinc-400 font-bold">[standard]</span>
                            )}
                          </div>
                          <p className="text-sm text-zinc-500 leading-relaxed">{clause.description}</p>
                        </div>
                      </label>
                    </div>

                    {/* Additional Options for Special Clauses */}
                    {isSelected && clause.code === "CLAUSE_TENANCY" && (
                      <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-800 text-sm space-y-2">
                        <div className="flex items-center gap-4">
                          <label className="font-bold">Mietstatus:</label>
                          <select aria-label="Mietstatus:"
                            value={formData.terms.tenancyStatus}
                            onChange={(e) =>
                              updateData((prev) => ({
                                ...prev,
                                terms: {
                                  ...prev.terms,
                                  tenancyStatus: e.target.value as ConfiguredTerms["tenancyStatus"],
                                },
                              }))
                            }
                            className="px-2 py-1 rounded bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700"
                          >
                            <option value="rented">Vollvermietet</option>
                            <option value="partially_rented">Teilweise vermietet</option>
                            <option value="free">Bezugsfrei (Widerspruch!)</option>
                          </select>
                        </div>
                        <input
                          type="text"
                          value={formData.terms.tenancyDetails || ""}
                          onChange={(e) =>
                            updateData((prev) => ({
                              ...prev,
                              terms: { ...prev.terms, tenancyDetails: e.target.value },
                            }))
                          }
                          placeholder="Mieter, Nettokaltmiete 1.800 EUR/Monat, Kautionssparbuch 5.400 EUR übertragen"
                          className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* STEP 5: PRÜFUNG (VALIDATION & AUDIT SUMMARY) */}
        {/* ================================================================= */}
        {currentStep === 5 && (
          <div className="space-y-6">
            <div className="border-b border-zinc-200 dark:border-zinc-800 pb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Schritt 5: Prüfung & Validierungsübersicht</h3>
                <p className="text-sm text-zinc-500 mt-0.5">
                  Technische Vollständigkeitsprüfung. Vorlage und Klauseln müssen notariell geprüft werden.
                </p>
              </div>
              <span
                className={`px-2 py-0.5 rounded text-sm font-semibold ${
                  evaluation.canGenerateDraft
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300"
                    : "bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300"
                }`}
              >
                {evaluation.canGenerateDraft ? "[bereit zur generierung]" : "[pflichtangaben unvollständig]"}
              </span>
            </div>

            {/* Errors List */}
            {evaluation.errors.length > 0 && (
              <div className="p-4 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 space-y-2 text-sm">
                <div className="font-bold text-rose-900 dark:text-rose-200">
                  Erforderliche Korrekturen ({evaluation.errors.length}):
                </div>
                <ul className="list-disc list-inside space-y-1 text-rose-800 dark:text-rose-300">
                  {evaluation.errors.map((err, i) => (
                    <li key={i} className="flex items-center justify-between">
                      <span>{err.message}</span>
                      <button
                        type="button"
                        onClick={() => goToStep(err.step)}
                        className="underline text-xs font-bold ml-2 shrink-0"
                      >
                        [zu Schritt {err.step}]
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Warnings List */}
            {evaluation.warnings.length > 0 && (
              <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 space-y-2 text-sm">
                <div className="font-bold text-amber-900 dark:text-amber-200">
                  Hinweise / Nicht zwingende Ausfüllfelder ({evaluation.warnings.length}):
                </div>
                <ul className="list-disc list-inside space-y-1 text-amber-800 dark:text-amber-300">
                  {evaluation.warnings.map((warn, i) => (
                    <li key={i}>{warn.message}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Structured Summary Table */}
            <div className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 space-y-3 text-sm">
              <h4 className="font-semibold  text-zinc-900 dark:text-white border-b border-zinc-200 dark:border-zinc-800 pb-2">
                Zusammenfassung der Vertragsdaten
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <span className="font-bold text-zinc-500 block mb-1">Beteiligte ({formData.parties.length}):</span>
                  {formData.parties.map((p) => (
                    <div key={p.id} className="text-zinc-800 dark:text-zinc-200 text-sm">
                      • [{p.role}] {p.name || "(Name fehlt)"} — {p.address || "(Anschrift fehlt)"}
                    </div>
                  ))}
                </div>

                <div>
                  <span className="font-bold text-zinc-500 block mb-1">Kaufgegenstand:</span>
                  <div className="text-zinc-800 dark:text-zinc-200 text-sm">
                    • Grundbuch: {formData.property.landRegistryDistrict || "-"}, Blatt {formData.property.sheetNumber || "-"}
                  </div>
                  <div className="text-zinc-800 dark:text-zinc-200 text-sm">
                    • Flurstück: {formData.property.parcelNumber || "-"}
                  </div>
                  <div className="text-zinc-800 dark:text-zinc-200 text-sm">
                    • Lage: {formData.property.streetAddress || "-"}
                  </div>
                </div>

                <div>
                  <span className="font-bold text-zinc-500 block mb-1">Finanzielles:</span>
                  <div className="text-zinc-800 dark:text-zinc-200 text-sm">
                    • Kaufpreis: {formData.purchasePrice.amount ? `${formData.purchasePrice.amount.toLocaleString("de-DE")} EUR` : "-"}
                  </div>
                  <div className="text-zinc-800 dark:text-zinc-200 text-sm">
                    • Abwicklung: {formData.purchasePrice.useEscrowAccount ? "Notaranderkonto" : "Direktzahlung"}
                  </div>
                </div>

                <div>
                  <span className="font-bold text-zinc-500 block mb-1">
                    Ausgewählte Klauseln ({formData.selectedClauseCodes?.length || 0}):
                  </span>
                  <div className="text-zinc-500 text-xs leading-relaxed">
                    {(formData.selectedClauseCodes || []).join(", ")}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* STEP 6: ENTWURF & DOCX GENERIERUNG */}
        {/* ================================================================= */}
        {currentStep === 6 && (
          <div className="space-y-6">
            <div className="border-b border-zinc-200 dark:border-zinc-800 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Schritt 6: Entwurfsgenerierung & DOCX-Download</h3>
                <p className="text-sm text-zinc-500 mt-0.5">
                  Erstellen Sie einen Word-Entwurf mit dauerhaft gespeicherten Vertragsdaten. Eine notarielle Prüfung ist erforderlich.
                </p>
              </div>

              <button
                type="button"
                onClick={handleGenerateDraft}
                disabled={isPending || !evaluation.canGenerateDraft}
                className="px-4 py-2 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 hover:bg-zinc-800 font-bold text-sm  transition-transform flex items-center gap-2 disabled:opacity-50"
              >
                {isPending ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white dark:border-zinc-950 border-t-transparent rounded animate-spin" />
                    <span>generiert word-entwurf...</span>
                  </>
                ) : (
                  <span>Word-Entwurf erstellen</span>
                )}
              </button>
            </div>

            {/* Versions History */}
            {generatedVersions.length > 0 ? (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold  text-zinc-600 dark:text-zinc-400">
                  Generierte Dokumentversionen ({generatedVersions.length}):
                </h4>

                <div className="space-y-2">
                  {generatedVersions.map((v) => (
                    <div
                      key={v.id}
                      className="p-3.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 text-xs font-bold">
                            Version {v.version}
                          </span>
                          <span className="text-sm font-bold text-zinc-900 dark:text-white">{v.title}</span>
                          <span className="text-xs text-zinc-400">Vorlage v{v.templateVersionString}</span>
                        </div>
                        <p className="text-xs text-zinc-500">
                          Erstellt am {new Date(v.createdAt).toLocaleString("de-DE")} • Unveränderbarer Snapshot gesichert
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <a
                          href={`/api/configurator/versions/${v.id}/download`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 hover:bg-zinc-800 font-bold text-sm  transition-transform flex items-center gap-1.5"
                        >
                          <span>[download .docx]</span>
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-sm text-zinc-400 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg">
                Noch kein Entwurf vorhanden. Nach erfolgreicher Prüfung können Sie hier den ersten Word-Entwurf erstellen.
              </div>
            )}
          </div>
        )}

        {/* Bottom Navigation Buttons */}
        <div className="flex items-center justify-between pt-4 border-t border-zinc-200 dark:border-zinc-800">
          <div>
            {currentStep > 1 && (
              <button
                type="button"
                onClick={() => goToStep(currentStep - 1)}
                className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900 "
              >
                ← Zurück zu {stepLabels[currentStep - 2]}
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link prefetch={true}
              href={`/cases/${caseId}`}
              className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              Akte öffnen
            </Link>

            {currentStep < 6 && (
              <button
                type="button"
                onClick={() => goToStep(currentStep + 1)}
                className="px-3 py-1.5 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 text-sm font-bold "
              >
                Weiter zu {stepLabels[currentStep]} →
              </button>
            )}
          </div>
        </div>
      </div>
      </fieldset>
    </div>
  );
}
