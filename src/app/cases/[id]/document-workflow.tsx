"use client";

import React, { useState, useTransition, useRef } from "react";
import Link from "next/link";
import {
  DocumentWithExtraction,
} from "@/lib/services/document-service";
import { GeneratedDraftRecord } from "@/lib/services/draft-service";
import {
  uploadDocumentAction,
  loadSampleDocumentAction,
  triggerExtractionAction,
  saveCorrectionsAction,
  approveExtractionAction,
  revertToReviewAction,
  generateDraftAction,
  deleteDocumentAction,
} from "@/app/actions/documents";
import {
  workflowStatusLabels,
  workflowStepNumbers,
} from "@/lib/workflow/state-machine";
import { ExtractedLegalFields } from "@/lib/ai/schema";
import { DocumentWorkflowStatus } from "@/generated/prisma/enums";

interface DocumentWorkflowProps {
  caseId: string;
  caseNumber: string;
  initialDocuments: DocumentWithExtraction[];
  initialDrafts: GeneratedDraftRecord[];
}

export function DocumentWorkflow({
  caseId,
  caseNumber,
  initialDocuments,
  initialDrafts,
}: DocumentWorkflowProps) {
  const [documents, setDocuments] = useState<DocumentWithExtraction[]>(initialDocuments);
  const [drafts, setDrafts] = useState<GeneratedDraftRecord[]>(initialDrafts);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(
    initialDocuments.length > 0 ? initialDocuments[0].id : null
  );

  const [isPending, startTransition] = useTransition();
  const [feedbackMessage, setFeedbackMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  const operationRef = useRef(false);
  const runTransition = (operation: () => Promise<void>) => {
    if (operationRef.current) return;
    operationRef.current = true;
    startTransition(async () => {
      try { await operation(); }
      catch { setFeedbackMessage({ type: "error", text: "Die Verbindung wurde unterbrochen. Ihre Eingaben bleiben erhalten. Bitte versuchen Sie den Vorgang erneut." }); }
      finally { operationRef.current = false; }
    });
  };

  const [copySuccess, setCopySuccess] = useState(false);

  // PDF Viewer toggle state
  const [showPdfViewer, setShowPdfViewer] = useState(false);

  // Document to delete (for confirmation modal)
  const [documentToDelete, setDocumentToDelete] = useState<DocumentWithExtraction | null>(null);

  // Expanded draft preview ID
  const [expandedDraftId, setExpandedDraftId] = useState<string | null>(null);

  // Active document
  const activeDoc = documents.find((d) => d.id === selectedDocId) || documents[0] || null;
  const isPdf = activeDoc
    ? activeDoc.mimeType === "application/pdf" || activeDoc.fileName.toLowerCase().endsWith(".pdf")
    : false;

  // Editable fields state for the review form
  const [editableData, setEditableData] = useState<ExtractedLegalFields | null>(() => {
    if (activeDoc?.extractionResult?.extractedData) {
      return activeDoc.extractionResult.extractedData as ExtractedLegalFields;
    }
    return null;
  });

  const [reviewNotes, setReviewNotes] = useState<string>(() => {
    return activeDoc?.extractionResult?.reviewNotes || "";
  });

  const hasUnsavedCorrections = activeDoc?.workflowStatus === "NEEDS_REVIEW" && (
    JSON.stringify(editableData) !== JSON.stringify(activeDoc.extractionResult?.extractedData) ||
    reviewNotes !== (activeDoc.extractionResult?.reviewNotes || "")
  );

  // Switch document selection
  const handleSelectDoc = (doc: DocumentWithExtraction) => {
    if (hasUnsavedCorrections && !window.confirm("Ungespeicherte Korrekturen verwerfen und Dokument wechseln?")) return;
    setSelectedDocId(doc.id);
    if (doc.extractionResult?.extractedData) {
      setEditableData(doc.extractionResult.extractedData as ExtractedLegalFields);
    } else {
      setEditableData(null);
    }
    setReviewNotes(doc.extractionResult?.reviewNotes || "");
    setFeedbackMessage(null);
  };

  // Upload handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setFeedbackMessage(null);
    const formData = new FormData();
    formData.append("caseId", caseId);
    formData.append("file", file);

    runTransition(async () => {
      const res = await uploadDocumentAction(formData);
      if (res.success && res.data) {
        const newDoc = res.data as DocumentWithExtraction;
        setDocuments((prev) => [newDoc, ...prev]);
        setSelectedDocId(newDoc.id);
        setEditableData(null);
        setShowPdfViewer(true);
        setFeedbackMessage({
          type: "success",
          text: `Dokument '${file.name}' erfolgreich hochgeladen und verifiziert.`,
        });
      } else {
        setFeedbackMessage({
          type: "error",
          text: res.error || "Fehler beim Upload.",
        });
      }
    });
  };

  // Quick load synthetic sample
  const handleLoadSample = (sampleType: "complete" | "with_gaps" | "pdf") => {
    setFeedbackMessage(null);
    runTransition(async () => {
      const res = await loadSampleDocumentAction(caseId, sampleType);
      if (res.success && res.data) {
        const newDoc = res.data as DocumentWithExtraction;
        setDocuments((prev) => [newDoc, ...prev]);
        setSelectedDocId(newDoc.id);
        setEditableData(null);
        if (sampleType === "pdf") {
          setShowPdfViewer(true);
        }
        setFeedbackMessage({
          type: "success",
          text:
            sampleType === "pdf"
              ? "Synthetischer Muster-Kaufvertrag als PDF geladen. Vorschau ist aktiv."
              : sampleType === "complete"
              ? "Synthetischer Muster-Kaufvertrag (Schwabing) als Text geladen."
              : "Synthetischer Mustervertrag mit Lücken geladen.",
        });
      } else {
        setFeedbackMessage({
          type: "error",
          text: res.error || "Beispieldokument konnte nicht geladen werden.",
        });
      }
    });
  };

  // Trigger AI Extraction
  const handleTriggerExtraction = () => {
    if (!activeDoc) return;
    setFeedbackMessage(null);

    runTransition(async () => {
      const res = await triggerExtractionAction(activeDoc.id, caseId);
      if (res.success && res.data) {
        const data = res.data as {
          documentId: string;
          workflowStatus: DocumentWorkflowStatus;
          extractedData: ExtractedLegalFields;
        };

        setDocuments((prev) =>
          prev.map((d) =>
            d.id === activeDoc.id
              ? {
                  ...d,
                  workflowStatus: data.workflowStatus,
                  extractionResult: {
                    ...(d.extractionResult || {
                      id: "res_temp",
                      rawText: null,
                      approvedData: null,
                      reviewNotes: null,
                      reviewedAt: null,
                    }),
                    workflowStatus: data.workflowStatus,
                    extractedData: data.extractedData,
                    missingFields: data.extractedData.missingFields,
                    discrepancies: data.extractedData.discrepancies,
                    confidence: data.extractedData.confidence,
                    modelUsed: "LLM",
                    errorMessage: null,
                  },
                }
              : d
          )
        );

        setEditableData(data.extractedData);
        setFeedbackMessage({
          type: "success",
          text: "KI-Extraktion erfolgreich abgeschlossen. Bitte prüfen und korrigieren Sie die Daten vor der Freigabe.",
        });
      } else {
        setFeedbackMessage({
          type: "error",
          text: res.error || "KI-Extraktion fehlgeschlagen.",
        });
      }
    });
  };

  // Save corrections
  const handleSaveCorrections = () => {
    if (!activeDoc || !editableData) return;
    setFeedbackMessage(null);

    runTransition(async () => {
      const res = await saveCorrectionsAction(
        activeDoc.id,
        caseId,
        editableData,
        reviewNotes
      );

      if (res.success && res.data) {
        const updated = res.data as ExtractedLegalFields;
        setEditableData(updated);
        setDocuments((previous) => previous.map((document) => document.id === activeDoc.id && document.extractionResult
          ? { ...document, extractionResult: { ...document.extractionResult, extractedData: updated, reviewNotes } }
          : document));
        setFeedbackMessage({
          type: "success",
          text: "Korrekturen erfolgreich gespeichert.",
        });
      } else {
        setFeedbackMessage({
          type: "error",
          text: res.error || "Korrekturen konnten nicht gespeichert werden.",
        });
      }
    });
  };

  // Approve extraction
  const handleApprove = () => {
    if (!activeDoc) return;
    setFeedbackMessage(null);

    runTransition(async () => {
      const res = await approveExtractionAction(activeDoc.id, caseId, reviewNotes, editableData ?? undefined);
      if (res.success && res.data) {
        const approved = res.data as ExtractedLegalFields;
        setDocuments((prev) =>
          prev.map((d) =>
            d.id === activeDoc.id
              ? {
                  ...d,
                  workflowStatus: "APPROVED",
                  extractionResult: {
                    ...(d.extractionResult || {
                      id: "res_temp",
                      rawText: null,
                      extractedData: null,
                      missingFields: [],
                      discrepancies: [],
                      confidence: null,
                      modelUsed: null,
                      errorMessage: null,
                    }),
                    workflowStatus: "APPROVED",
                    extractedData: approved,
                    approvedData: approved,
                    reviewNotes,
                    reviewedAt: new Date().toISOString(),
                  },
                }
              : d
          )
        );
        setFeedbackMessage({
          type: "success",
          text: "Extraktionsdaten durch Sachbearbeitung freigegeben. Entwurf kann nun generiert werden.",
        });
      } else {
        setFeedbackMessage({
          type: "error",
          text: res.error || "Freigabe fehlgeschlagen.",
        });
      }
    });
  };

  // Revert back to review (unlock for editing)
  const handleRevertToReview = () => {
    if (!activeDoc) return;
    setFeedbackMessage(null);

    runTransition(async () => {
      const res = await revertToReviewAction(activeDoc.id, caseId);
      if (res.success) {
        setDocuments((prev) =>
          prev.map((d) =>
            d.id === activeDoc.id
              ? {
                  ...d,
                  workflowStatus: "NEEDS_REVIEW",
                  extractionResult: d.extractionResult
                    ? {
                        ...d.extractionResult,
                        workflowStatus: "NEEDS_REVIEW",
                      }
                    : null,
                }
              : d
          )
        );
        setFeedbackMessage({
          type: "info",
          text: "Bearbeitung entsperrt: Alle Felder können nun korrigiert werden. Nach Abschluss bitte erneut freigeben.",
        });
      } else {
        setFeedbackMessage({
          type: "error",
          text: res.error || "Bearbeitung konnte nicht entsperrt werden.",
        });
      }
    });
  };

  // Generate Draft
  const handleGenerateDraft = () => {
    if (!activeDoc) return;
    setFeedbackMessage(null);

    runTransition(async () => {
      const res = await generateDraftAction(activeDoc.id, caseId);
      if (res.success && res.data) {
        const newDraft = res.data as GeneratedDraftRecord;
        setDrafts((prev) => [newDraft, ...prev.filter((d) => d.id !== newDraft.id)]);
        setExpandedDraftId(newDraft.id);
        setDocuments((prev) =>
          prev.map((d) =>
            d.id === activeDoc.id ? { ...d, workflowStatus: "DRAFT_READY" } : d
          )
        );
        setFeedbackMessage({
          type: "success",
          text: `Vorbereitungsvermerk (Version ${newDraft.version}) erfolgreich als Word-Dokument (.docx) generiert und im Notariatsspeicher abgelegt.`,
        });
      } else {
        setFeedbackMessage({
          type: "error",
          text: res.error || "Entwurfsgenerierung fehlgeschlagen.",
        });
      }
    });
  };

  // Delete document handler
  const handleDeleteDocument = (docId: string) => {
    const docTarget = documents.find((d) => d.id === docId);
    const fileName = docTarget?.fileName || "Dokument";
    setFeedbackMessage(null);

    runTransition(async () => {
      const res = await deleteDocumentAction(docId, caseId);
      if (res.success) {
        const remainingDocs = documents.filter((d) => d.id !== docId);
        setDocuments(remainingDocs);
        setDocumentToDelete(null);

        // If the deleted document was the selected one:
        if (selectedDocId === docId || activeDoc?.id === docId) {
          const nextDoc = remainingDocs[0] || null;
          setSelectedDocId(nextDoc ? nextDoc.id : null);
          if (nextDoc?.extractionResult?.extractedData) {
            setEditableData(nextDoc.extractionResult.extractedData as ExtractedLegalFields);
          } else {
            setEditableData(null);
          }
          setReviewNotes(nextDoc?.extractionResult?.reviewNotes || "");
          setShowPdfViewer(false);
        }

        setFeedbackMessage({
          type: "success",
          text: `Dokument '${fileName}' und zugehörige Extraktionsdaten wurden erfolgreich gelöscht.`,
        });
      } else {
        setFeedbackMessage({
          type: "error",
          text: res.error || "Fehler beim Löschen des Dokuments.",
        });
      }
    });
  };

  // Copy draft content
  const handleCopyDraft = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const currentStep = activeDoc ? workflowStepNumbers[activeDoc.workflowStatus] : 1;

  return (
    <div className="bg-white dark:bg-zinc-950 p-6 sm:p-7 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-6">
      {/* Header & Upload Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse" />
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
              Dokumente prüfen und Entwürfe erstellen
            </h2>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Dokument hochladen → Daten extrahieren → Angaben prüfen und freigeben → Word-Entwurf erstellen
          </p>
        </div>

        {/* Action Buttons: File Upload + Quick Sample Demos */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-xs transition">
            <span>↑ Datei hochladen (.txt, .pdf)</span>
            <input
              type="file"
              accept=".txt,.pdf,.md"
              className="sr-only"
              aria-label="Dokument hochladen"
              onChange={handleFileUpload}
              disabled={isPending}
            />
          </label>

          <button
            type="button"
            onClick={() => handleLoadSample("pdf")}
            disabled={isPending}
            className="px-2.5 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-sm font-semibold text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 transition shadow-2xs"
            title="Lädt die echte PDF-Beispieldatei (Schwabinger Kaufvertrag) zur Demonstration"
          >
            + Muster als PDF
          </button>

          <button
            type="button"
            onClick={() => handleLoadSample("complete")}
            disabled={isPending}
            className="px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-sm font-medium text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 transition"
            title="Lädt den vollständigen Schwabinger Kaufvertrag als Text"
          >
            + Muster Schwabing
          </button>

          <button
            type="button"
            onClick={() => handleLoadSample("with_gaps")}
            disabled={isPending}
            className="px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 text-sm font-medium text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 transition"
            title="Lädt einen Entwurf mit Lücken zum Testen von Warnungen"
          >
            + Muster mit Lücken
          </button>
        </div>
      </div>

      {/* Global Feedback Banner */}
      {feedbackMessage && (
        <div
          className={`p-3 rounded-lg text-sm font-medium border flex items-center justify-between ${
            feedbackMessage.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
              : feedbackMessage.type === "error"
              ? "bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800"
              : "bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800"
          }`}
        >
          <span>{feedbackMessage.text}</span>
          <button
            onClick={() => setFeedbackMessage(null)}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 ml-2 font-sans"
          >
            [x]
          </button>
        </div>
      )}

      {/* Document Tab Bar (if multiple documents) */}
      {documents.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-sm border-b border-zinc-200 dark:border-zinc-800">
          <span className="text-zinc-400 font-sans font-bold text-xs  shrink-0 mr-1">
            dokumente ({documents.length}):
          </span>
          {documents.map((d) => {
            const isDocPdf = d.mimeType === "application/pdf" || d.fileName.toLowerCase().endsWith(".pdf");
            const isSelected = d.id === activeDoc?.id;
            return (
              <div
                key={d.id}
                className={`group inline-flex items-center rounded-lg border transition shrink-0 ${
                  isSelected
                    ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-950 dark:text-white border-zinc-300 dark:border-zinc-700 font-bold"
                    : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 border-zinc-200 dark:border-zinc-800"
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleSelectDoc(d)}
                  disabled={isPending}
                  className="px-2.5 py-1 flex items-center gap-1.5 text-left  transition-colors duration-150"
                >
                  <span className="font-sans text-xs text-zinc-500 font-bold">{isDocPdf ? "[pdf]" : "[txt]"}</span>
                  <span className="max-w-[150px] truncate">{d.fileName}</span>
                  <span
                    className={`w-1.5 h-1.5 rounded-[1px] shrink-0 ${
                      d.workflowStatus === "DRAFT_READY"
                        ? "bg-emerald-500"
                        : d.workflowStatus === "APPROVED"
                        ? "bg-zinc-700 dark:bg-zinc-300"
                        : d.workflowStatus === "NEEDS_REVIEW"
                        ? "bg-amber-500"
                        : d.workflowStatus === "EXTRACTION_FAILED"
                        ? "bg-rose-500"
                        : "bg-zinc-400"
                    }`}
                  />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDocumentToDelete(d);
                  }}
                  title={`'${d.fileName}' löschen`}
                  className="pr-2 pl-1 py-1 text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 transition text-xs font-sans"
                  aria-label={`Dokument ${d.fileName} löschen`}
                >
                  [x]
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* If No Documents Yet */}
      {documents.length === 0 ? (
        <div className="py-12 text-center space-y-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-800">
          <div className="text-sm font-sans font-bold text-zinc-400">
            Keine Dokumente
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white ">
              Noch keine Dokumente für Akte {caseNumber} hinterlegt
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
              Laden Sie eine Text- oder PDF-Datei hoch. Für eine erste Erprobung können Sie auch ein Musterdokument verwenden.
            </p>
          </div>
        </div>
      ) : activeDoc ? (
        <div className="space-y-5">
          {/* Active Document Header & Viewer Controls */}
          <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-200/80 dark:border-zinc-800">
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className={`px-2 py-0.5 rounded text-xs font-bold ${
                    isPdf
                      ? "bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
                      : "bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700"
                  }`}
                >
                  {isPdf ? "PDF" : "TXT"}
                </span>
                <span className="font-bold text-sm sm:text-sm text-zinc-900 dark:text-white truncate">
                  {activeDoc.fileName}
                </span>
                <span className="text-xs text-zinc-400 shrink-0">
                  ({(activeDoc.fileSize / 1024).toFixed(1)} KB)
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto shrink-0">
                <button
                  type="button"
                  onClick={() => setShowPdfViewer(!showPdfViewer)}
                  className={`px-2.5 py-1 rounded-lg text-sm font-sans font-medium transition  duration-150 inline-flex items-center gap-1.5 ${
                    showPdfViewer
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
                      : "bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                  }`}
                >
                  <span>{isPdf ? "[pdf]" : "[txt]"}</span>
                  <span>
                    {showPdfViewer
                      ? "vorschau schließen [x]"
                      : isPdf
                      ? "pdf ansehen"
                      : "originaltext ansehen"}
                  </span>
                </button>

                <a
                  href={`/api/documents/${activeDoc.id}/file`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2 py-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm font-sans text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition  duration-150 inline-flex items-center gap-1"
                  title="In separatem Browser-Tab öffnen"
                >
                  <span>[tab ↗]</span>
                </a>

                <a
                  href={`/api/documents/${activeDoc.id}/file?download=true`}
                  className="px-2 py-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm font-sans text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition  duration-150 inline-flex items-center gap-1"
                  title="Datei herunterladen"
                >
                  <span>[download]</span>
                </a>

                <button
                  type="button"
                  onClick={() => setDocumentToDelete(activeDoc)}
                  disabled={isPending}
                  className="px-2 py-1 rounded-lg border border-rose-300 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20 text-sm font-sans text-rose-700 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition  duration-150 inline-flex items-center gap-1"
                  title="Dokument löschen"
                >
                  <span>[löschen]</span>
                </button>
              </div>
            </div>

            {/* Workflow Stepper - Fully Responsive */}
            <div className="space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between text-sm font-sans gap-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-zinc-700 dark:text-zinc-300">
                    verfahrensstand:
                  </span>
                  <span className="px-2 py-0.5 rounded font-bold bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100">
                    {workflowStatusLabels[activeDoc.workflowStatus]}
                  </span>
                </div>
                <span className="text-zinc-400 text-xs">
                  schritt {currentStep} von 6
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 pt-1 font-sans">
                {[
                  { step: 1, label: "Hochgeladen", key: "UPLOADED" },
                  { step: 2, label: "Extraktion", key: "EXTRACTING" },
                  { step: 3, label: "Prüfung", key: "NEEDS_REVIEW" },
                  { step: 4, label: "Freigabe", key: "APPROVED" },
                  { step: 5, label: "Generierung", key: "GENERATING" },
                  { step: 6, label: "Entwurf bereit", key: "DRAFT_READY" },
                ].map((s) => {
                  const isPassed = currentStep > s.step;
                  const isCurrent = currentStep === s.step;
                  const isFailed =
                    (activeDoc.workflowStatus === "EXTRACTION_FAILED" && s.step === 2) ||
                    (activeDoc.workflowStatus === "GENERATION_FAILED" && s.step === 5);

                  return (
                    <div
                      key={s.step}
                      className={`p-2 rounded-lg border text-center space-y-1 transition ${
                        isCurrent
                          ? "bg-zinc-100 dark:bg-zinc-800 border-zinc-400 dark:border-zinc-600 font-bold"
                          : isPassed
                          ? "bg-zinc-50 dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700"
                          : isFailed
                          ? "bg-rose-50/50 dark:bg-rose-950/30 border-rose-300 dark:border-rose-800"
                          : "bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
                      }`}
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <span
                          className={`w-4 h-4 rounded flex items-center justify-center text-xs font-bold ${
                            isFailed
                              ? "bg-rose-600 text-white"
                              : isPassed
                              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
                              : isCurrent
                              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
                              : "bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400"
                          }`}
                        >
                          {isFailed ? "!" : s.step}
                        </span>
                        <span
                          className={`text-xs truncate ${
                            isCurrent
                              ? "text-zinc-900 dark:text-zinc-100 font-bold"
                              : isPassed
                              ? "text-zinc-800 dark:text-zinc-200"
                              : "text-zinc-500 dark:text-zinc-400"
                          }`}
                        >
                          {s.label}
                        </span>
                      </div>
                      <div
                        className={`h-1 rounded ${
                          isFailed
                            ? "bg-rose-600"
                            : isPassed
                            ? "bg-zinc-900 dark:bg-zinc-100"
                            : isCurrent
                            ? "bg-zinc-600 dark:bg-zinc-400 animate-pulse"
                            : "bg-zinc-200 dark:bg-zinc-800"
                        }`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Embedded PDF / Document Viewer Box */}
          {showPdfViewer && (
            <div className="p-4 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 space-y-3 font-sans">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                    {isPdf ? "Original-PDF Dokument" : "Originaltext Dokument"}
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-xs font-sans font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 truncate">
                    {activeDoc.fileName}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm self-start sm:self-auto shrink-0">
                  <a
                    href={`/api/documents/${activeDoc.id}/file`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-zinc-900 dark:text-zinc-100 font-bold hover:underline"
                  >
                    [tab ↗]
                  </a>
                  <span className="text-zinc-300 dark:text-zinc-700">•</span>
                  <button
                    onClick={() => setShowPdfViewer(false)}
                    className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 font-bold"
                  >
                    [x] schließen
                  </button>
                </div>
              </div>

              {isPdf ? (
                <div className="w-full h-[520px] sm:h-[640px] rounded-lg overflow-hidden border border-zinc-300 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900">
                  <iframe
                    src={`/api/documents/${activeDoc.id}/file#toolbar=1&navpanes=0`}
                    className="w-full h-full border-0"
                    title={`PDF-Vorschau: ${activeDoc.fileName}`}
                  />
                </div>
              ) : (
                <div className="max-h-[480px] overflow-y-auto p-4 rounded-lg bg-zinc-950 text-zinc-100 font-sans text-sm whitespace-pre-wrap leading-relaxed border border-zinc-800">
                  {activeDoc.extractionResult?.rawText || "Kein Textinhalt verfügbar."}
                </div>
              )}
            </div>
          )}

          {/* STEP 1: UPLOADED -> Trigger Extraction */}
          {(activeDoc.workflowStatus === "UPLOADED" ||
            activeDoc.workflowStatus === "EXTRACTION_FAILED") && (
            <div className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-3 font-sans">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-white ">
                    Schritt 2: Strukturierte Entitätsextraktion per KI starten
                  </h3>
                  <p className="text-sm text-zinc-500 leading-relaxed">
                    Der Rohtext ({activeDoc.fileSize} Bytes) wurde sicher analysiert. Das System extrahiert Parteien, Grundbuchdaten und finanzielle Konditionen.
                  </p>
                </div>
              </div>

              {activeDoc.workflowStatus === "EXTRACTION_FAILED" && (
                <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-sm text-rose-800 dark:text-rose-300">
                  <span className="font-bold">[fehler] </span>
                  {activeDoc.extractionResult?.errorMessage || "Unbekannter Fehler."}
                </div>
              )}

              <div className="pt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleTriggerExtraction}
                  disabled={isPending}
                  className="px-3 py-1.5 rounded-lg bg-blue-800 hover:bg-blue-900 dark:bg-blue-600 dark:text-white dark:hover:bg-blue-500 text-white text-sm font-sans font-medium  transition-colors duration-150 flex items-center gap-2"
                >
                  {isPending ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white dark:border-zinc-950 border-t-transparent rounded animate-spin" />
                      <span>KI analysiert Notariatstext...</span>
                    </>
                  ) : (
                    <span>KI-Extraktion starten</span>
                  )}
                </button>
                <span className="text-xs text-zinc-400">
                  (Dauer: ca. 1–3 Sekunden)
                </span>
              </div>
            </div>
          )}

          {/* STEP 2: EXTRACTING SPINNER */}
          {activeDoc.workflowStatus === "EXTRACTING" && (
            <div className="p-8 text-center space-y-3 bg-zinc-50 dark:bg-zinc-900/40 rounded-xl border border-zinc-200 dark:border-zinc-800">
              <div className="w-10 h-10 mx-auto border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
                Juristisches LLM analysiert den Sachverhalt...
              </p>
              <p className="text-xs text-zinc-400">
                Strukturierte Validierung gegen deutsches Notariatsschema
              </p>
            </div>
          )}

          {/* STEP 3 & 4: HUMAN REVIEW & CORRECTION FORM */}
          {(activeDoc.workflowStatus === "NEEDS_REVIEW" ||
            activeDoc.workflowStatus === "APPROVED" ||
            activeDoc.workflowStatus === "GENERATING" ||
            activeDoc.workflowStatus === "DRAFT_READY" ||
            activeDoc.workflowStatus === "GENERATION_FAILED") &&
            editableData && (
              <div className="space-y-6">
                {/* Warning / Discrepancy Badges Banner */}
                {(editableData.missingFields.length > 0 ||
                  editableData.discrepancies.length > 0) && (
                  <div className="p-3.5 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 space-y-2 font-sans">
                    <div className="flex items-center gap-2 text-sm font-bold text-zinc-900 dark:text-zinc-100">
                      <span className="px-1.5 py-0.2 rounded bg-zinc-200 dark:bg-zinc-800 text-xs font-bold">[hinweis]</span>
                      <span>Fehlende Pflichtangaben / Auffälligkeiten erkannt</span>
                    </div>
                    <ul className="text-sm text-zinc-700 dark:text-zinc-300 list-disc list-inside space-y-1">
                      {editableData.missingFields.map((m, idx) => (
                        <li key={`miss_${idx}`}>
                          <span className="font-semibold">Offenes Feld:</span> {m}
                        </li>
                      ))}
                      {editableData.discrepancies.map((d, idx) => (
                        <li key={`disc_${idx}`}>
                          <span className="font-semibold">Hinweis:</span> {d}
                        </li>
                      ))}
                    </ul>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-zinc-200 dark:border-zinc-800">
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {activeDoc.workflowStatus === "NEEDS_REVIEW"
                          ? "Sie können fehlende Angaben in den Eingabefeldern unten ergänzen, bevor Sie die Freigabe erteilen."
                          : "Die Eingabefelder sind aktuell gesperrt. Klicken Sie auf [Bearbeitung entsperren], um Korrekturen vorzunehmen."}
                      </p>
                      {(activeDoc.workflowStatus === "APPROVED" ||
                        activeDoc.workflowStatus === "DRAFT_READY") && (
                        <button
                          type="button"
                          onClick={handleRevertToReview}
                          disabled={isPending}
                          className="px-2.5 py-1 rounded-lg bg-blue-800 hover:bg-blue-900 dark:bg-blue-600 dark:text-white dark:hover:bg-blue-500 text-white text-xs font-sans font-bold  transition-colors duration-150 shrink-0"
                        >
                          Bearbeitung entsperren
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Review Form */}
                <div className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-4 font-sans">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3 gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-zinc-900 dark:text-white ">
                        Human-in-the-Loop Datenprüfung
                      </h3>
                      <p className="text-sm text-zinc-500">
                        {activeDoc.workflowStatus === "APPROVED" ||
                        activeDoc.workflowStatus === "DRAFT_READY"
                          ? "Daten wurden freigegeben und für die Entwurfsgenerierung gesperrt."
                          : "Prüfen und korrigieren Sie die extrahierten Angaben vor der finalen Freigabe."}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      {(activeDoc.workflowStatus === "APPROVED" ||
                        activeDoc.workflowStatus === "DRAFT_READY") && (
                        <button
                          type="button"
                          onClick={handleRevertToReview}
                          disabled={isPending}
                          className="px-2.5 py-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-sm font-sans font-medium text-zinc-900 dark:text-zinc-100  transition-colors duration-150 inline-flex items-center gap-1.5 shrink-0"
                          title="Entsperrt die Eingabefelder zur nachträglichen Bearbeitung"
                        >
                          <span>[Bearbeitung entsperren]</span>
                        </button>
                      )}
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-zinc-500">
                          Konfidenz:
                        </span>
                        <span className="px-2 py-0.5 rounded font-sans text-sm font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200">
                          {Math.round(editableData.confidence * 100)}%
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Form Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    {/* Urkundsdaten */}
                    <div className="p-3.5 rounded-lg bg-zinc-50/70 dark:bg-zinc-900/50 border border-zinc-200/70 dark:border-zinc-800/60 space-y-3">
                      <h4 className="font-bold text-zinc-900 dark:text-white  text-xs">
                        Urkundsdaten
                      </h4>

                      <div className="space-y-1">
                        <label htmlFor="review-document-type" className="text-zinc-500 font-medium">Dokumenttyp</label>
                        <input id="review-document-type"
                          type="text"
                          value={editableData.documentType}
                          disabled={isPending || activeDoc.workflowStatus !== "NEEDS_REVIEW"}
                          onChange={(e) =>
                            setEditableData({
                              ...editableData,
                              documentType: e.target.value,
                            })
                          }
                          className="w-full px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white disabled:opacity-75"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-zinc-500 font-medium">Beurkundungsdatum</label>
                        <input aria-label="Beurkundungsdatum"
                          type="date"
                          value={editableData.deedDate || ""}
                          disabled={isPending || activeDoc.workflowStatus !== "NEEDS_REVIEW"}
                          onChange={(e) =>
                            setEditableData({
                              ...editableData,
                              deedDate: e.target.value || null,
                            })
                          }
                          className="w-full px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white disabled:opacity-75"
                        />
                      </div>
                    </div>

                    {/* Grundbuchdaten */}
                    <div className="p-3.5 rounded-lg bg-zinc-50/70 dark:bg-zinc-900/50 border border-zinc-200/70 dark:border-zinc-800/60 space-y-3">
                      <h4 className="font-bold text-zinc-900 dark:text-white  text-xs">
                        Grundbuch & Flurstück
                      </h4>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-zinc-500 font-medium">Gemarkung</label>
                          <input aria-label="Gemarkung"
                            type="text"
                            value={editableData.propertyDetails?.landRegistryDistrict || ""}
                            disabled={isPending || activeDoc.workflowStatus !== "NEEDS_REVIEW"}
                            onChange={(e) =>
                              setEditableData({
                                ...editableData,
                                propertyDetails: {
                                  landRegistryDistrict: e.target.value || null,
                                  sheetNumber: editableData.propertyDetails?.sheetNumber || null,
                                  parcelNumber: editableData.propertyDetails?.parcelNumber || null,
                                  areaSqm: editableData.propertyDetails?.areaSqm || null,
                                  economicUse: editableData.propertyDetails?.economicUse || null,
                                },
                              })
                            }
                            className="w-full px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 disabled:opacity-75"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-zinc-500 font-sans text-xs">
                            Grundbuchblatt {!editableData.propertyDetails?.sheetNumber && <span className="text-amber-600 font-bold">[fehlt]</span>}
                          </label>
                          <input
                            type="text"
                            placeholder="z.B. 4521"
                            value={editableData.propertyDetails?.sheetNumber || ""}
                            disabled={isPending || activeDoc.workflowStatus !== "NEEDS_REVIEW"}
                            onChange={(e) =>
                              setEditableData({
                                ...editableData,
                                propertyDetails: {
                                  landRegistryDistrict: editableData.propertyDetails?.landRegistryDistrict || null,
                                  sheetNumber: e.target.value || null,
                                  parcelNumber: editableData.propertyDetails?.parcelNumber || null,
                                  areaSqm: editableData.propertyDetails?.areaSqm || null,
                                  economicUse: editableData.propertyDetails?.economicUse || null,
                                },
                              })
                            }
                            className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 font-sans disabled:opacity-75"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-zinc-500 font-sans text-xs">
                          Flurstücksnummer {!editableData.propertyDetails?.parcelNumber && <span className="text-amber-600 font-bold">[fehlt]</span>}
                        </label>
                        <input
                          type="text"
                          placeholder="z.B. Flur 14, Flurstück 88/2"
                          value={editableData.propertyDetails?.parcelNumber || ""}
                          disabled={isPending || activeDoc.workflowStatus !== "NEEDS_REVIEW"}
                          onChange={(e) =>
                            setEditableData({
                              ...editableData,
                              propertyDetails: {
                                landRegistryDistrict: editableData.propertyDetails?.landRegistryDistrict || null,
                                sheetNumber: editableData.propertyDetails?.sheetNumber || null,
                                parcelNumber: e.target.value || null,
                                areaSqm: editableData.propertyDetails?.areaSqm || null,
                                economicUse: editableData.propertyDetails?.economicUse || null,
                              },
                            })
                          }
                          className="w-full px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 disabled:opacity-75"
                        />
                      </div>
                    </div>

                    {/* Kaufpreis & Finanzen */}
                    <div className="p-3.5 rounded-lg bg-zinc-50/70 dark:bg-zinc-900/50 border border-zinc-200/70 dark:border-zinc-800/60 space-y-3 md:col-span-2">
                      <h4 className="font-bold text-zinc-900 dark:text-white  text-xs">
                        Kaufpreis & Finanzielle Bedingungen
                      </h4>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <label className="text-zinc-500 font-medium">Kaufpreis (in EUR)</label>
                          <input aria-label="Kaufpreis (in EUR)"
                            type="number"
                            value={editableData.financials?.purchasePrice ?? ""}
                            disabled={isPending || activeDoc.workflowStatus !== "NEEDS_REVIEW"}
                            onChange={(e) =>
                              setEditableData({
                                ...editableData,
                                financials: {
                                  purchasePrice: e.target.value ? Number(e.target.value) : null,
                                  currency: "EUR",
                                  paymentDueDate: editableData.financials?.paymentDueDate || null,
                                  existingEncumbrances: editableData.financials?.existingEncumbrances || [],
                                },
                              })
                            }
                            className="w-full px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 disabled:opacity-75"
                          />
                        </div>

                        <div className="space-y-1 sm:col-span-2">
                          <label className="text-zinc-500 font-medium">Zahlungsfälligkeit</label>
                          <input aria-label="Zahlungsfälligkeit"
                            type="text"
                            placeholder="z.B. 15. November 2026"
                            value={editableData.financials?.paymentDueDate || ""}
                            disabled={isPending || activeDoc.workflowStatus !== "NEEDS_REVIEW"}
                            onChange={(e) =>
                              setEditableData({
                                ...editableData,
                                financials: {
                                  purchasePrice: editableData.financials?.purchasePrice ?? null,
                                  currency: "EUR",
                                  paymentDueDate: e.target.value || null,
                                  existingEncumbrances: editableData.financials?.existingEncumbrances || [],
                                },
                              })
                            }
                            className="w-full px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 disabled:opacity-75"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Beteiligte Parteien */}
                  <div className="space-y-3">
                    <h4 className="font-bold text-zinc-900 dark:text-white  text-xs">
                      Vertragsparteien ({editableData.parties.length})
                    </h4>

                    <div className="space-y-2">
                      {editableData.parties.map((party, pIdx) => (
                        <div
                          key={`party_${pIdx}`}
                          className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-sm"
                        >
                          <div>
                            <span className="text-xs text-zinc-400 block">Rolle</span>
                            <input
                              type="text"
                              value={party.role}
                              disabled={isPending || activeDoc.workflowStatus !== "NEEDS_REVIEW"}
                              onChange={(e) => {
                                const newParties = [...editableData.parties];
                                newParties[pIdx] = { ...party, role: e.target.value };
                                setEditableData({ ...editableData, parties: newParties });
                              }}
                              className="w-full px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 disabled:opacity-75 font-semibold"
                            />
                          </div>

                          <div>
                            <span className="text-xs text-zinc-400 block">Name</span>
                            <input
                              type="text"
                              value={party.name}
                              disabled={isPending || activeDoc.workflowStatus !== "NEEDS_REVIEW"}
                              onChange={(e) => {
                                const newParties = [...editableData.parties];
                                newParties[pIdx] = { ...party, name: e.target.value };
                                setEditableData({ ...editableData, parties: newParties });
                              }}
                              className="w-full px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 disabled:opacity-75"
                            />
                          </div>

                          <div>
                            <span className="text-xs text-zinc-400 block">Anschrift</span>
                            <input
                              type="text"
                              value={party.address || ""}
                              disabled={isPending || activeDoc.workflowStatus !== "NEEDS_REVIEW"}
                              onChange={(e) => {
                                const newParties = [...editableData.parties];
                                newParties[pIdx] = { ...party, address: e.target.value || null };
                                setEditableData({ ...editableData, parties: newParties });
                              }}
                              className="w-full px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 disabled:opacity-75"
                            />
                          </div>

                          <div>
                            <span className="text-xs text-zinc-400 block font-sans">Steuer-ID {!party.taxId && <span className="text-amber-600 font-bold">[fehlt]</span>}</span>
                            <input
                              type="text"
                              placeholder="z.B. 12 345 678 901"
                              value={party.taxId || ""}
                              disabled={isPending || activeDoc.workflowStatus !== "NEEDS_REVIEW"}
                              onChange={(e) => {
                                const newParties = [...editableData.parties];
                                newParties[pIdx] = { ...party, taxId: e.target.value || null };
                                setEditableData({ ...editableData, parties: newParties });
                              }}
                              className="w-full px-2 py-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 font-sans disabled:opacity-75"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Review Notes Input */}
                  <div className="space-y-1">
                    <label className="text-sm font-sans font-medium text-zinc-700 dark:text-zinc-300">
                      Prüfvermerk der Sachbearbeitung (Human-in-the-Loop)
                    </label>
                    <textarea aria-label="Prüfvermerk der Sachbearbeitung (Human-in-the-Loop)"
                      rows={2}
                      value={reviewNotes}
                      disabled={isPending || activeDoc.workflowStatus !== "NEEDS_REVIEW"}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      placeholder="z.B.: Grundbuchblatt im Amtsgericht abgefragt und bestätigt. Steuer-ID der Käuferseite telefonisch verifiziert."
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm font-sans disabled:opacity-75"
                    />
                  </div>

                  {/* Review Action Buttons */}
                  {activeDoc.workflowStatus === "NEEDS_REVIEW" ? (
                    <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 dark:border-zinc-800">
                      <button
                        type="button"
                        onClick={handleSaveCorrections}
                        disabled={isPending}
                        className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm font-sans text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800  transition-colors duration-150"
                      >
                        Korrekturen zwischenspeichern
                      </button>

                      <button
                        type="button"
                        onClick={handleApprove}
                        disabled={isPending}
                        className="px-3.5 py-1.5 rounded-lg bg-blue-800 hover:bg-blue-900 dark:bg-blue-600 dark:text-white dark:hover:bg-blue-500 text-white text-sm font-sans font-medium  transition-colors duration-150 flex items-center gap-1.5"
                      >
                        <span>Geprüfte Daten freigeben</span>
                      </button>
                    </div>
                  ) : (
                    <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 dark:border-zinc-800">
                      <span className="text-xs text-zinc-500 font-sans">
                        Status: Für Entwurfsgenerierung gesperrt ({workflowStatusLabels[activeDoc.workflowStatus]})
                      </span>
                      <button
                        type="button"
                        onClick={handleRevertToReview}
                        disabled={isPending}
                        className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm font-sans font-medium  transition-colors duration-150 flex items-center gap-1.5"
                      >
                        <span>Freigabe aufheben & Daten bearbeiten</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

          {/* STEP 4 & 5: APPROVED -> GENERATE DRAFT */}
          {(activeDoc.workflowStatus === "APPROVED" ||
            activeDoc.workflowStatus === "GENERATION_FAILED") && (
            <div className="p-4 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 space-y-3 font-sans">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-700 dark:text-zinc-300 font-bold text-sm">[freigegeben]</span>
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white ">
                      Extraktionsdaten menschlich geprüft & freigegeben
                    </h3>
                  </div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Die genehmigten Daten sind eingefroren. Sie können nun den deterministischen Vorbereitungsvermerk auf Basis von Notariatstemplate v1.0.0 erzeugen.
                  </p>
                </div>
              </div>

              {activeDoc.workflowStatus === "GENERATION_FAILED" && (
                <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-sm text-rose-800 dark:text-rose-300">
                  Generierung fehlgeschlagen. Bitte erneut versuchen.
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleGenerateDraft}
                  disabled={isPending}
                  className="px-3 py-1.5 rounded-lg bg-blue-800 hover:bg-blue-900 dark:bg-blue-600 dark:text-white dark:hover:bg-blue-500 text-white text-sm font-sans font-medium  transition-colors duration-150 flex items-center gap-2"
                >
                  {isPending ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white dark:border-zinc-950 border-t-transparent rounded animate-spin" />
                      <span>Dokument wird deterministisch generiert...</span>
                    </>
                  ) : (
                    <span>Entwurf generieren (Template v1.0.0)</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleRevertToReview}
                  disabled={isPending}
                  className="px-3 py-1.5 rounded-lg border border-zinc-400 dark:border-zinc-600 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm font-sans font-medium  transition-colors duration-150 inline-flex items-center gap-1.5"
                >
                  <span>Freigabe aufheben & bearbeiten</span>
                </button>

                <Link prefetch={true}
                  href={`/cases/${caseId}/configurator?prefill=true`}
                  className="px-3 py-1.5 rounded-lg border border-zinc-400 dark:border-zinc-600 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm font-sans font-medium  transition-colors duration-150 inline-flex items-center gap-1.5"
                >
                  <span>[+]</span>
                  <span>In Konfigurator übernehmen</span>
                </Link>
              </div>
            </div>
          )}

          {/* STEP 6: DRAFT READY & VERSIONED DOCUMENT LIFECYCLE */}
          {drafts.filter((d) => d.documentId === activeDoc?.id).length > 0 && (
            <div className="p-5 rounded-xl border border-blue-200 dark:border-blue-800/60 bg-blue-50/20 dark:bg-blue-950/20 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-blue-100 dark:border-blue-900/50 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <h3 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-white">
                      Generierte Word-Entwürfe (.docx) & Dokumenten-Historie ({drafts.filter((d) => d.documentId === activeDoc?.id).length})
                    </h3>
                  </div>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Revisionssicher versioniert • Deterministisch aus freigegebenem Datenschnappschuss generiert
                  </p>
                </div>

                {/* Actions: Revert to Review & Regenerate New Version */}
                <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto shrink-0">
                  <button
                    type="button"
                    onClick={handleRevertToReview}
                    disabled={isPending}
                    className="px-3 py-1.5 rounded-lg border border-zinc-400 dark:border-zinc-600 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm font-sans font-medium  transition-colors duration-150 inline-flex items-center gap-1.5"
                    title="Entsperrt die Datenfelder, um fehlende Pflichtangaben vor dem nächsten Entwurf zu korrigieren"
                  >
                    <span>Bearbeitung entsperren</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleGenerateDraft}
                    disabled={isPending}
                    className="px-3 py-1.5 rounded-lg bg-blue-800 hover:bg-blue-900 dark:bg-blue-600 dark:text-white dark:hover:bg-blue-500 text-white text-sm font-sans font-medium  transition-colors duration-150 inline-flex items-center gap-1.5"
                    title="Erzeugt eine neue Version auf Basis der freigegebenen Daten"
                  >
                    {isPending ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white dark:border-zinc-950 border-t-transparent rounded animate-spin" />
                        <span>Wird generiert...</span>
                      </>
                    ) : (
                      <span>
                        + Neue Version generieren (v
                        {(drafts.filter((d) => d.documentId === activeDoc?.id)[0]?.version ?? 1) + 1})
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* Version History Cards */}
              <div className="space-y-3 font-sans">
                {drafts
                  .filter((d) => d.documentId === activeDoc?.id)
                  .map((draft, idx) => {
                    const isLatest = idx === 0;
                    const isExpanded = expandedDraftId === draft.id;

                    return (
                      <div
                        key={draft.id}
                        className={`p-3.5 rounded-lg border transition ${
                          isLatest
                            ? "bg-white dark:bg-zinc-900 border-zinc-400 dark:border-zinc-600 shadow-xs"
                            : "bg-zinc-50 dark:bg-zinc-900/60 border-zinc-200 dark:border-zinc-800"
                        }`}
                      >
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                          <div className="space-y-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`px-1.5 py-0.2 rounded text-xs font-bold ${
                                  isLatest
                                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
                                    : "bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                                }`}
                              >
                                v{draft.version} {isLatest && "• aktuell"}
                              </span>
                              <span className="px-1.5 py-0.2 rounded text-xs font-sans bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                                template v{draft.templateVersion}
                              </span>
                              <span className="text-zinc-400 text-sm">
                                {new Date(draft.createdAt).toLocaleString("de-DE")} Uhr
                              </span>
                            </div>

                            <h4 className="text-sm font-bold text-zinc-900 dark:text-white truncate">
                              {draft.title}
                            </h4>
                          </div>

                          {/* Action Buttons: DOCX, TXT, Preview, Copy */}
                          <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto shrink-0 font-sans">
                            <a
                              href={`/api/drafts/${draft.id}/download?format=docx`}
                              download
                              className="px-2.5 py-1 rounded-lg bg-blue-800 hover:bg-blue-900 dark:bg-blue-600 dark:text-white dark:hover:bg-blue-500 text-white text-sm font-medium  transition-colors duration-150 inline-flex items-center gap-1.5"
                              title="Offizielles Microsoft Word Dokument herunterladen"
                            >
                              <span>[docx laden]</span>
                            </a>

                            <a
                              href={`/api/drafts/${draft.id}/download?format=txt`}
                              download
                              className="px-2.5 py-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700  transition-colors duration-150 inline-flex items-center gap-1"
                              title="Textfassung (.txt) herunterladen"
                            >
                              <span>[txt laden]</span>
                            </a>

                            <button
                              type="button"
                              onClick={() => setExpandedDraftId(isExpanded ? null : draft.id)}
                              className="px-2.5 py-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700  transition-colors duration-150"
                            >
                              {isExpanded ? "vorschau schließen [^]" : "textvorschau [v]"}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleCopyDraft(draft.content)}
                              className="px-2.5 py-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700  transition-colors duration-150"
                              title="Entwurfstext in Zwischenablage kopieren"
                            >
                              {copySuccess ? "[kopiert]" : "kopieren"}
                            </button>
                          </div>
                        </div>

                        {/* Collapsible Monospace Preview */}
                        {isExpanded && (
                          <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-800 space-y-2 animate-in fade-in duration-150">
                            <div className="flex flex-wrap items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 gap-2 font-sans">
                              <span>
                                Datenschnappschuss • Vorbereitungsvermerk nach § 17 BeurkG
                              </span>
                              <span className="text-zinc-400">ID: {draft.id}</span>
                            </div>
                            <div className="p-3 rounded-lg bg-zinc-950 text-zinc-100 font-sans text-xs leading-relaxed max-h-80 overflow-y-auto whitespace-pre border border-zinc-800 selection:bg-zinc-700 selection:text-white">
                              {draft.content}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* Delete Confirmation Modal */}
      {documentToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150 font-sans"
        >
          <div
            className="bg-white dark:bg-zinc-950 rounded-lg border border-zinc-300 dark:border-zinc-800 shadow-2xl max-w-md w-full p-6 space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold text-sm shrink-0">
                [!]
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white ">
                  Dokument unwiderruflich löschen?
                </h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  Möchten Sie das Dokument <strong className="text-zinc-900 dark:text-white break-all font-semibold">„{documentToDelete.fileName}“</strong> wirklich entfernen?
                </p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-700 dark:text-zinc-300 space-y-1">
              <p className="font-bold">Folgen der Löschung:</p>
              <ul className="list-disc list-inside space-y-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                <li>Die physische Datei wird vom Server gelöscht.</li>
                <li>Zugehörige KI-Extraktionsdaten werden unwiderruflich bereinigt.</li>
                <li>Ein revisionssicherer Audit-Eintrag wird protokolliert.</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setDocumentToDelete(null)}
                disabled={isPending}
                className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm font-sans text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800  transition-colors duration-150"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={() => handleDeleteDocument(documentToDelete.id)}
                disabled={isPending}
                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-sans font-medium  transition-colors duration-150 inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {isPending ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded animate-spin" />
                    <span>Wird gelöscht...</span>
                  </>
                ) : (
                  <span>Endgültig löschen</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
