"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  XnpExportType,
  XnpValidationReport,
  XnpExportRecord,
} from "@/lib/integrations/xnp/types";

interface XnpIntegrationSectionProps {
  caseId: string;
  caseNumber: string;
  initialExports?: XnpExportRecord[];
  dataRevision?: string;
}

export function XnpIntegrationSection({
  caseId,
  caseNumber,
  initialExports = [],
  dataRevision,
}: XnpIntegrationSectionProps) {
  const [selectedType, setSelectedType] = useState<XnpExportType>("XNOTAR_GRUNDBUCH_XML");
  const [includeAttachments, setIncludeAttachments] = useState(true);
  const [allowPartialDraft, setAllowPartialDraft] = useState(false);

  const validationRequest = useRef(0);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Validation state
  const [report, setReport] = useState<XnpValidationReport | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  // Export generation state
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  // History state
  const [exportsList, setExportsList] = useState<XnpExportRecord[]>(initialExports);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Fetch validation report for selected type
  const fetchValidation = useCallback(async (type: XnpExportType) => {
    const request = ++validationRequest.current;
    setIsValidating(true);
    setReport(null);
    setValidationError(null);
    try {
      const res = await fetch(`/api/cases/${caseId}/xnp/validate?type=${type}`);
      const data = await res.json();
      if (request !== validationRequest.current) return;
      if (res.ok && data.success && data.report) {
        setReport(data.report);
      } else {
        setValidationError("Exportprüfung fehlgeschlagen. Bitte erneut prüfen.");
      }
    } catch {
      if (request === validationRequest.current) setValidationError("Exportprüfung nicht erreichbar. Bitte erneut prüfen.");
    } finally {
      if (request === validationRequest.current) setIsValidating(false);
    }
  }, [caseId]);

  // Load export history
  const loadHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/xnp/exports`);
      const data = await res.json();
      if (data.success && Array.isArray(data.exports)) {
        setExportsList(data.exports);
      }
    } catch {
      // Ignore background load error
    } finally {
      setIsLoadingHistory(false);
    }
  }, [caseId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchValidation(selectedType);
    }, 0);
    return () => clearTimeout(timer);
  }, [selectedType, fetchValidation, dataRevision]);

  useEffect(() => {
    if (initialExports.length === 0) {
      const timer = setTimeout(() => {
        void loadHistory();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [initialExports.length, loadHistory]);

  // Handle export trigger
  const handleExport = async () => {
    setIsExporting(true);
    setExportMessage(null);

    try {
      const res = await fetch(`/api/cases/${caseId}/xnp/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exportType: selectedType,
          includeAttachments,
          allowPartialDraft,
        }),
      });

      const data = await res.json();

      if (data.success && data.export) {
        setExportMessage({
          type: "success",
          text: `XNP-Paket für ${selectedType} erfolgreich generiert (${Math.round(data.export.fileSize / 1024)} KB).`,
        });
        await loadHistory();
      } else if (res.status === 422) {
        setExportMessage({
          type: "error",
          text: data.message || "Validierung fehlgeschlagen. Bitte Pflichtfelder vervollständigen.",
        });
        if (data.report) setReport(data.report);
      } else {
        setExportMessage({
          type: "error",
          text: data.message || "Fehler beim Erzeugen des Export-Pakets.",
        });
      }
    } catch {
      setExportMessage({
        type: "error",
        text: "Verbindungsfehler beim Anfordern des Exports.",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const getFormatLabel = (type: XnpExportType) => {
    switch (type) {
      case "XNOTAR_GRUNDBUCH_XML":
        return "XNotar · Grundbuch";
      case "UVZ_XML":
        return "Urkundenverzeichnis (UVZ)";
      case "ENOVA_XML":
        return "eNoVA · Veräußerungsanzeige";
    }
  };

  return (
    <div className="bg-white dark:bg-zinc-950 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-6">
      {/* Header with Compatibility Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              XNP-Export vorbereiten
            </h2>
            <span className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-sans font-semibold border border-zinc-300 dark:border-zinc-700">
              Technischer Prototyp
            </span>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            Freigegebene Aktendaten prüfen und als Exportpaket herunterladen.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-sm font-sans font-semibold border border-amber-200 dark:border-amber-800">
            <span>[!]</span>
            <span>Kompatibilität nicht bestätigt</span>
          </span>
        </div>
      </div>

      {/* Compatibility Notice Banner */}
      <div className="p-3.5 rounded-lg bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 text-sm space-y-1.5">
        <div className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center justify-between">
          <span>Kompatibilitäts- und Übertragungshinweis</span>
          <span className="font-sans text-xs text-zinc-500">Stand: BNotK Onlinehilfe Okt. 2025</span>
        </div>
        <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
          Die Exportpakete dienen der technischen Erprobung. Eine vollständige Prüfung gegen offizielle Schemas und ein erfolgreicher Import in XNP sind nicht bestätigt. Vor jeder Verwendung müssen Inhalt und Format fachlich geprüft werden. Es erfolgt keine Übertragung an Behörden.
        </p>
      </div>

      {validationError && <div role="alert" className="text-sm text-rose-700 dark:text-rose-300">{validationError} <button type="button" onClick={() => void fetchValidation(selectedType)} className="underline">Erneut prüfen</button></div>}
      <button type="button" disabled={isValidating || isExporting} onClick={() => void fetchValidation(selectedType)} className="text-sm underline disabled:opacity-50">Daten erneut prüfen</button>
      <p className="text-sm text-zinc-500">Freigegebene Dokumentdaten und erzeugte Vertragsversionen ergänzen die Aktenstammdaten. Neuere vorhandene Angaben haben Vorrang.</p>
      {/* Configuration Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Selection & Controls */}
        <div className="md:col-span-1 space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-zinc-700 dark:text-zinc-300">
              Exportformat
            </label>
            <div className="space-y-2">
              {(["XNOTAR_GRUNDBUCH_XML", "UVZ_XML", "ENOVA_XML"] as XnpExportType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => { if (selectedType === type) return; validationRequest.current++; setReport(null); setIsValidating(true); setSelectedType(type); }}
                  aria-pressed={selectedType === type}
                  disabled={isExporting}
                  className={`w-full text-left p-3 rounded-lg border text-sm transition cursor-pointer ${
                    selectedType === type
                      ? "border-zinc-900 dark:border-zinc-100 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 font-bold shadow-2xs"
                      : "border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                  }`}
                >
                  
                  <div className="text-sm mt-0.5">{getFormatLabel(type)}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-zinc-200 dark:border-zinc-800 text-sm">
            <label className="flex items-center gap-2 cursor-pointer text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={includeAttachments}
                onChange={(e) => setIncludeAttachments(e.target.checked)}
                className="rounded border-zinc-300 dark:border-zinc-700 text-zinc-900 focus:ring-0"
              />
              <span>Dokumente als Anlagen beifügen</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={allowPartialDraft}
                onChange={(e) => setAllowPartialDraft(e.target.checked)}
                className="rounded border-zinc-300 dark:border-zinc-700 text-zinc-900 focus:ring-0"
              />
              <span>Entwurfsexport bei unvollständigen Pflichtfeldern erlauben</span>
            </label>
          </div>

          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting || isValidating || !!validationError || (!report?.isValid && !allowPartialDraft)}
            className="w-full py-2.5 px-4 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-950 font-sans text-sm font-bold transition disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs flex items-center justify-center gap-2"
          >
            {isExporting ? (
              <span>Generiere ZIP-Paket...</span>
            ) : (
              <>
                <span>[↓]</span>
                <span>XNP-Paket generieren (.zip)</span>
              </>
            )}
          </button>

          {exportMessage && (
            <div
              className={`p-3 rounded-lg text-sm font-sans border ${
                exportMessage.type === "success"
                  ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                  : "bg-red-50 dark:bg-red-950/60 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800"
              }`}
            >
              {exportMessage.text}
            </div>
          )}
        </div>

        {/* Middle & Right Column: Validation Checklist & Feasibility */}
        <div className="md:col-span-2 space-y-4">
          {/* Pre-flight Validation Checklist */}
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 bg-zinc-50/50 dark:bg-zinc-900/30 space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  Datenprüfung
                </span>
                {isValidating && <span className="text-xs text-zinc-400 font-sans">Prüfe...</span>}
              </div>

              {report && (
                <span
                  className={`px-2 py-0.5 rounded text-xs font-sans font-bold border ${
                    report.isValid
                      ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800"
                      : "bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-300 border-red-300 dark:border-red-800"
                  }`}
                >
                  {report.isValid ? "TECHNISCHE PRÜFUNG BESTANDEN" : "PFLICHTANGABEN UNVOLLSTÄNDIG"}
                </span>
              )}
            </div>

            {report && (
              <div className="space-y-3 text-sm">
                <p className="text-zinc-600 dark:text-zinc-400">
                  {report.summary}
                </p>

                {report.issues.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    {report.issues.map((issue, idx) => (
                      <div
                        key={idx}
                        className={`p-2 rounded text-xs font-sans flex items-start gap-2 border ${
                          issue.severity === "ERROR"
                            ? "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900"
                            : "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900"
                        }`}
                      >
                        <span className="font-bold shrink-0">
                          {issue.severity === "ERROR" ? "[FEHLER]" : "[WARNUNG]"}
                        </span>
                        <div className="flex-1">
                          <div>{issue.message}</div>
                          <details className="text-xs opacity-80 mt-1"><summary className="cursor-pointer">Technisches Feld</summary>{issue.path}</details>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <details className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 text-sm">
            <summary className="cursor-pointer font-medium">Wie erfolgt die Übergabe an XNP?</summary>
            <p className="mt-3 text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Laden Sie das Paket herunter und lassen Sie es vor der weiteren Verwendung fachlich prüfen.
              Die lokale XNP-Anwendung kann aus dieser Webanwendung nicht direkt angesprochen werden.
              Ein erfolgreicher Import in XNP ist bisher nicht bestätigt.
            </p>
          </details>
        </div>
      </div>

      {/* Export History Table */}
      <div className="space-y-3 pt-4 border-t border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
            Bisherige Exporte ({exportsList.length})
          </h3>
          <button
            type="button"
            onClick={loadHistory}
            disabled={isLoadingHistory}
            className="text-xs font-sans text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 cursor-pointer"
          >
            {isLoadingHistory ? "Lade..." : "Aktualisieren"}
          </button>
        </div>

        {exportsList.length === 0 ? (
          <div className="p-4 rounded-lg bg-zinc-50 dark:bg-zinc-900/40 border border-dashed border-zinc-300 dark:border-zinc-700 text-center text-sm text-zinc-500 font-sans">
            Für Akte {caseNumber} wurden bisher keine XNP-Pakete generiert.
          </div>
        ) : (
          <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800 rounded-lg">
            <table className="w-full text-sm text-left">
              <thead className="bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 font-sans text-xs border-b border-zinc-200 dark:border-zinc-800">
                <tr>
                  <th className="py-2.5 px-3">Dateiname</th>
                  <th className="py-2.5 px-3">Format</th>
                  <th className="py-2.5 px-3">Größe</th>
                  <th className="py-2.5 px-3">SHA-256 Prüfsumme</th>
                  <th className="py-2.5 px-3">Zeitstempel</th>
                  <th className="py-2.5 px-3 text-right">Aktion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 font-sans text-xs">
                {exportsList.map((exp) => (
                  <tr key={exp.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-900/50">
                    <td className="py-2.5 px-3 font-semibold text-zinc-900 dark:text-zinc-100">
                      {exp.fileName}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                        {exp.exportType}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-400">
                      {Math.round(exp.fileSize / 1024)} KB
                    </td>
                    <td className="py-2.5 px-3 text-zinc-500 font-sans text-xs">
                      {exp.fileHash ? exp.fileHash.slice(0, 16) + "..." : "n/a"}
                    </td>
                    <td className="py-2.5 px-3 text-zinc-500">
                      {new Date(exp.createdAt).toLocaleString("de-DE")}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <a
                        href={exp.downloadUrl}
                        download
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 font-bold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition shadow-2xs"
                      >
                        <span>[↓]</span>
                        <span>Download</span>
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
