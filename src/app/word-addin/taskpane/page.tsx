"use client";

import { loadOfficeLibrary } from "@/lib/addin/office-loader";
import React, { useState, useEffect, useCallback } from "react";
import {
  insertFieldAsContentControl,
  insertPartiesSection,
  insertPropertySection,
  insertFinancialsSection,
  insertCaseSummaryHeader,
  WordPartyItem,
  WordPropertyDetails,
  WordFinancialDetails,
  WordCaseMetadata,
} from "@/lib/addin/word-service";

interface TenantInfo {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  jurisdiction: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string;
}

interface CaseListItem {
  id: string;
  caseNumber: string;
  title: string;
  matterType: string;
  status: string;
  notaryName?: string | null;
  assignedClerk?: string | null;
  createdAt: string;
}

interface CaseDetailData {
  metadata: WordCaseMetadata & {
    matterType: string;
    status: string;
    targetDateIso: string | null;
    isVerified: boolean;
  };
  parties: WordPartyItem[];
  property: WordPropertyDetails;
  financials: WordFinancialDetails;
  verification: {
    hasApprovedExtraction: boolean;
    approvedDocumentsCount: number;
    status: string;
    isAuthoritative: boolean;
  };
}

export default function WordAddinTaskpanePage() {
  const [isOfficeReady, setIsOfficeReady] = useState(false);
  const [isWordHost, setIsWordHost] = useState(false);

  // Authentication state
  const [token, setToken] = useState<string | null>(null);
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Login form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginPending, setLoginPending] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Case list state
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [casesLoading, setCasesLoading] = useState(false);

  // Case detail state
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [caseDetail, setCaseDetail] = useState<CaseDetailData | null>(null);
  const [caseDetailLoading, setCaseDetailLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"METADATA" | "PARTIES" | "PROPERTY" | "FINANCIALS">("METADATA");

  // Insertion state & feedback
  const [isInserting, setIsInserting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  // 1. Initialize Office.js on mount
  const handleOfficeReady = useCallback(() => {
    if (typeof window !== "undefined" && (window as unknown as { Office?: typeof Office }).Office) {
      const OfficeGlobal = (window as unknown as { Office: typeof Office }).Office;
      OfficeGlobal.onReady((info) => {
        setIsOfficeReady(true);
        setIsWordHost(info.host === OfficeGlobal.HostType.Word);
      });
    }
  }, []);

  useEffect(() => {
    let active = true;
    void loadOfficeLibrary().then(() => { if (active) handleOfficeReady(); }).catch(() => {
      if (active) setFeedback({ type: "error", text: "Word-Anbindung nicht erreichbar. Bitte prüfen Sie die Verbindung und öffnen Sie das Add-in erneut in Word." });
    });
    return () => { active = false; };
  }, [handleOfficeReady]);

  // 2. Auth initialization on mount
  useEffect(() => {
    let isCancelled = false;

    const initAuth = async () => {
      await Promise.resolve();
      if (isCancelled) return;

      const savedToken = typeof window !== "undefined" ? localStorage.getItem("kanzleiflow_addin_token") : null;
      if (!savedToken) {
        setAuthLoading(false);
        return;
      }

      setToken(savedToken);

      try {
        const res = await fetch("/api/addin/auth/me", {
          headers: { Authorization: `Bearer ${savedToken}` },
        });
        const data = await res.json();
        if (isCancelled) return;
        if (data.success && data.tenant) {
          setTenant(data.tenant);
        } else {
          localStorage.removeItem("kanzleiflow_addin_token");
          setToken(null);
          setTenant(null);
        }
      } catch {
        if (!isCancelled) {
          localStorage.removeItem("kanzleiflow_addin_token");
          setToken(null);
        }
      } finally {
        if (!isCancelled) {
          setAuthLoading(false);
        }
      }
    };

    void initAuth();
    return () => {
      isCancelled = true;
    };
  }, []);

  // 3. Logout action
  const handleLogout = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("kanzleiflow_addin_token");
    }
    setToken(null);
    setTenant(null);
    setSelectedCaseId(null);
    setCaseDetail(null);
  }, []);

  // 4. Load cases when authenticated
  const loadCases = useCallback(async (authToken: string, search = "", status = "") => {
    setCasesLoading(true);
    setFeedback(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (status) params.set("status", status);

      const res = await fetch(`/api/addin/cases?${params.toString()}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json();
      if (data.success && data.cases) {
        setCases(data.cases);
      } else if (res.status === 401) {
        handleLogout();
        setLoginError("Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.");
      }
    } catch {
      setFeedback({ type: "error", text: "Fehler beim Laden der Akten." });
    } finally {
      setCasesLoading(false);
    }
  }, [handleLogout]);

  useEffect(() => {
    if (!token) return;
    const timer = setTimeout(() => {
      void loadCases(token, searchQuery, statusFilter);
    }, 0);
    return () => clearTimeout(timer);
  }, [token, searchQuery, statusFilter, loadCases]);

  // 5. Load case detail
  const loadCaseDetail = async (caseId: string) => {
    if (!token) return;
    setSelectedCaseId(caseId);
    setCaseDetailLoading(true);
    setFeedback(null);

    try {
      const res = await fetch(`/api/addin/cases/${caseId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success && data.data) {
        setCaseDetail(data.data);
      } else if (res.status === 401) {
        handleLogout();
      } else {
        setFeedback({ type: "error", text: data.message || "Akte konnte nicht geladen werden." });
      }
    } catch {
      setFeedback({ type: "error", text: "Netzwerkfehler beim Laden der Akte." });
    } finally {
      setCaseDetailLoading(false);
    }
  };

  // 6. Auth actions
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginPending(true);
    setLoginError(null);

    try {
      const res = await fetch("/api/addin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const data = await res.json();

      if (data.success && data.token) {
        localStorage.setItem("kanzleiflow_addin_token", data.token);
        setToken(data.token);
        setTenant(data.tenant);
      } else {
        setLoginError(data.message || "Anmeldung fehlgeschlagen.");
      }
    } catch {
      setLoginError("Verbindungsfehler beim Notariat-Server.");
    } finally {
      setLoginPending(false);
    }
  };

  const handleFillDemo = () => {
    setLoginEmail("j.weiss@notariat-weiss-partner.de");
    setLoginPassword("notar-geheim-2026");
  };

  // 6. Insertion & Audit logging
  const logAudit = async (caseId: string, fieldKey: string, fieldLabel: string) => {
    if (!token) return;
    try {
      await fetch("/api/addin/audit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          caseId,
          actionType: "WORD_ADDIN_DATA_INSERTED",
          fieldKey,
          fieldLabel,
        }),
      });
    } catch {
      // Audit failure does not block UI
    }
  };

  const handleInsertField = async (
    fieldKey: string,
    fieldLabel: string,
    value: string | undefined | null,
    isVerified = true
  ) => {
    if (isInserting || !caseDetail) return;
    setIsInserting(true);
    setFeedback(null);

    const res = await insertFieldAsContentControl(
      caseDetail.metadata.caseNumber,
      fieldKey,
      fieldLabel,
      value,
      { isVerified, unverifiedDisclaimer: true }
    );

    if (res.success) {
      setFeedback({
        type: "success",
        text: res.message || `Feld „${fieldLabel}“ eingefügt.`,
      });
      if (selectedCaseId) {
        logAudit(selectedCaseId, fieldKey, fieldLabel);
      }
    } else {
      setFeedback({ type: "error", text: res.error || "Fehler beim Einfügen in Word." });
    }
    setIsInserting(false);
  };

  const handleInsertSection = async (sectionType: "PARTIES" | "PROPERTY" | "FINANCIALS" | "HEADER") => {
    if (isInserting || !caseDetail) return;
    setIsInserting(true);
    setFeedback(null);

    let res;
    let label = "";

    if (sectionType === "PARTIES") {
      res = await insertPartiesSection(caseDetail.parties, caseDetail.metadata.caseNumber);
      label = "Vertragsparteien";
    } else if (sectionType === "PROPERTY") {
      res = await insertPropertySection(caseDetail.property, caseDetail.metadata.caseNumber);
      label = "Grundbuchdaten";
    } else if (sectionType === "FINANCIALS") {
      res = await insertFinancialsSection(caseDetail.financials, caseDetail.metadata.caseNumber);
      label = "Kaufpreisdaten";
    } else {
      res = await insertCaseSummaryHeader(caseDetail.metadata);
      label = "Aktenauszug-Kopf";
    }

    if (res.success) {
      setFeedback({
        type: "success",
        text: res.message || `Abschnitt „${label}“ erfolgreich eingefügt.`,
      });
      if (selectedCaseId) {
        logAudit(selectedCaseId, sectionType.toLowerCase(), label);
      }
    } else {
      setFeedback({ type: "error", text: res.error || "Fehler beim Einfügen in Word." });
    }
    setIsInserting(false);
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans tracking-tight text-sm flex flex-col">


      {/* Top Navigation & Status Bar */}
      <header className="p-3 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 flex items-center justify-center font-bold text-sm shrink-0">
            §
          </div>
          <div className="min-w-0">
            <span className="font-bold text-zinc-900 dark:text-white block leading-tight truncate">
              KanzleiFlow Word-Assistent
            </span>
            <span className="text-xs text-zinc-500 truncate block">
              {tenant ? tenant.organizationName : "Notariats-Schnittstelle"}
            </span>
          </div>
        </div>

        {tenant && (
          <div className="flex items-center gap-1.5 shrink-0">
            {selectedCaseId && (
              <button
                type="button"
                onClick={() => {
                  setSelectedCaseId(null);
                  setCaseDetail(null);
                  setFeedback(null);
                }}
                className="px-2 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800 transition "
                title="Zurück zur Aktenliste"
              >
                ← Akten
              </button>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="p-1 rounded border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition text-xs"
              title="Abmelden"
            >
              Abmelden
            </button>
          </div>
        )}
      </header>

      {/* Office Host Indicator Banner */}
      <div className="px-3 py-1 bg-zinc-100 dark:bg-zinc-900/60 border-b border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400 flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isWordHost ? "bg-emerald-500" : isOfficeReady ? "bg-amber-500" : "bg-zinc-400"
            }`}
          />
          <span>{isWordHost ? "Microsoft Word aktiv" : "Vorschau-Modus (Simulation)"}</span>
        </span>
        <span className="font-sans text-[9px] text-zinc-400">Office.js v1.1</span>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-2.5 mx-3 mt-3 rounded border text-xs leading-snug flex items-start justify-between gap-2 ${
            feedback.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200"
              : feedback.type === "error"
              ? "bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200"
              : "bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200"
          }`}
        >
          <span className="flex-1">{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-zinc-400 hover:text-zinc-700 font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 p-3 space-y-3">
        {authLoading ? (
          <div className="py-12 text-center text-zinc-500 space-y-2">
            <span className="w-5 h-5 border-2 border-zinc-600 border-t-transparent rounded-full inline-block animate-spin" />
            <p className="text-sm">Sitzung wird überprüft...</p>
          </div>
        ) : !token ? (
          /* ================= LOGIN VIEW ================= */
          <div className="space-y-4 pt-2">
            <div className="p-3 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-1.5">
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
                Notariat-Anmeldung
              </h2>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Melden Sie sich mit Ihrem KanzleiFlow-Konto an, um Urkundenstammdaten direkt in dieses Word-Dokument einzufügen.
              </p>
            </div>

            {/* Quick Demo Fill Helper */}
            <div className="p-2.5 rounded bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-300 dark:border-zinc-700 flex items-center justify-between">
              <div>
                <span className="font-bold text-xs block">Demo-Schnellanmeldung:</span>
                <span className="text-xs text-zinc-500">Dr. Johannes Weiss (Notar)</span>
              </div>
              <button
                type="button"
                onClick={handleFillDemo}
                className="px-2 py-0.5 rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 text-xs "
              >
                Ausfüllen
              </button>
            </div>

            {loginError && (
              <div className="p-2.5 rounded bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs">
                {loginError}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-3">
              <div>
                <label className="block text-xs font-bold mb-1 text-zinc-700 dark:text-zinc-300">
                  Dienstliche E-Mail-Adresse
                </label>
                <input
                  type="email"
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="notar@kanzlei.de"
                  className="w-full px-2.5 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm focus:outline-hidden focus:border-zinc-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold mb-1 text-zinc-700 dark:text-zinc-300">
                  Passwort
                </label>
                <input
                  type="password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-2.5 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm focus:outline-hidden focus:border-zinc-500"
                />
              </div>

              <button
                type="submit"
                disabled={loginPending}
                className="w-full py-1.5 px-3 rounded bg-blue-800 hover:bg-blue-900 dark:bg-blue-600 dark:text-white dark:hover:bg-blue-500 text-white text-sm font-bold  transition-transform flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {loginPending ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white dark:border-zinc-950 border-t-transparent rounded-full animate-spin" />
                    <span>Wird angemeldet...</span>
                  </>
                ) : (
                  <span>Anmelden →</span>
                )}
              </button>
            </form>
          </div>
        ) : !selectedCaseId ? (
          /* ================= CASE LIST VIEW ================= */
          <div className="space-y-3">
            <div className="space-y-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Aktenzeichen oder Betreff suchen..."
                className="w-full px-2.5 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm focus:outline-hidden focus:border-zinc-500"
              />

              {/* Status Filter Pills */}
              <div className="flex gap-1 overflow-x-auto pb-1 text-xs">
                {[
                  { value: "", label: "Alle" },
                  { value: "READY_FOR_NOTARIZATION", label: "Beurkundungsreif" },
                  { value: "IN_REVIEW", label: "In Prüfung" },
                  { value: "DRAFT", label: "Entwurf" },
                ].map((pill) => (
                  <button
                    key={pill.value}
                    type="button"
                    onClick={() => setStatusFilter(pill.value)}
                    className={`px-2 py-0.5 rounded whitespace-nowrap transition ${
                      statusFilter === pill.value
                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 font-bold"
                        : "bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    }`}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>
            </div>

            {/* List */}
            {casesLoading ? (
              <div className="py-8 text-center text-zinc-500">
                <span className="w-4 h-4 border-2 border-zinc-600 border-t-transparent rounded-full inline-block animate-spin mr-2 align-middle" />
                <span>Akten werden geladen...</span>
              </div>
            ) : cases.length === 0 ? (
              <div className="py-8 text-center bg-white dark:bg-zinc-900 rounded border border-zinc-200 dark:border-zinc-800 p-4 space-y-1">
                <p className="font-bold text-sm text-zinc-700 dark:text-zinc-300">[Keine Akten gefunden]</p>
                <p className="text-xs text-zinc-500">
                  {searchQuery || statusFilter
                    ? "Passen Sie die Filter an oder setzen Sie den Suchbegriff zurück."
                    : "Keine Akten in diesem Notariat vorhanden."}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <span className="text-xs text-zinc-500 font-bold block">
                  {cases.length} {cases.length === 1 ? "Akte gefunden" : "Akten gefunden"}
                </span>

                {cases.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => loadCaseDetail(c.id)}
                    className="p-2.5 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-400 dark:hover:border-zinc-600 transition cursor-pointer space-y-1.5 active:scale-[0.99]"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-bold text-zinc-900 dark:text-white">
                        {c.caseNumber}
                      </span>
                      <span className="text-xs px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                        {c.status === "READY_FOR_NOTARIZATION"
                          ? "Beurkundungsreif"
                          : c.status === "IN_REVIEW"
                          ? "In Prüfung"
                          : c.status}
                      </span>
                    </div>

                    <p className="font-medium text-xs text-zinc-800 dark:text-zinc-200 line-clamp-1">
                      {c.title}
                    </p>

                    <div className="flex items-center justify-between text-xs text-zinc-500 pt-0.5 border-t border-zinc-100 dark:border-zinc-800/60">
                      <span>{c.assignedClerk || "Offen"}</span>
                      <span className="text-zinc-900 dark:text-white font-bold hover:underline">
                        Auswählen →
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* ================= CASE DETAIL & INSERTION VIEW ================= */
          <div className="space-y-3">
            {caseDetailLoading || !caseDetail ? (
              <div className="py-8 text-center text-zinc-500">
                <span className="w-4 h-4 border-2 border-zinc-600 border-t-transparent rounded-full inline-block animate-spin mr-2 align-middle" />
                <span>Aktenstammdaten werden geladen...</span>
              </div>
            ) : (
              <>
                {/* Case Header Card */}
                <div className="p-3 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-sm text-zinc-900 dark:text-white">
                      {caseDetail.metadata.caseNumber}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded font-bold ${
                        caseDetail.verification.isAuthoritative
                          ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800"
                          : "bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800"
                      }`}
                    >
                      {caseDetail.verification.isAuthoritative ? "Geprüfter Datenbestand" : "Entwurf / Vorläufig"}
                    </span>
                  </div>

                  <p className="text-sm text-zinc-800 dark:text-zinc-200 font-medium">
                    {caseDetail.metadata.title}
                  </p>

                  <div className="text-xs text-zinc-500 grid grid-cols-2 gap-1 pt-1 border-t border-zinc-100 dark:border-zinc-800">
                    <span>Notar: {caseDetail.metadata.notaryName}</span>
                    <span>Sachbearbeiter: {caseDetail.metadata.assignedClerk}</span>
                  </div>
                </div>

                {/* Quick Insert Header Button */}
                <button
                  type="button"
                  onClick={() => handleInsertSection("HEADER")}
                  disabled={isInserting}
                  className="w-full py-1.5 px-2.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-bold text-zinc-800 dark:text-zinc-200  transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <span>[+]</span>
                  <span>Aktenkopf als Tabelle einfügen</span>
                </button>

                {/* Section Navigation Tabs */}
                <div className="grid grid-cols-4 gap-1 text-xs">
                  {[
                    { id: "METADATA", label: "Stamm" },
                    { id: "PARTIES", label: `Parteien (${caseDetail.parties.length})` },
                    { id: "PROPERTY", label: "Grundbuch" },
                    { id: "FINANCIALS", label: "Kaufpreis" },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id as typeof activeTab)}
                      className={`py-1.5 px-1 text-center rounded transition ${
                        activeTab === tab.id
                          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 font-bold"
                          : "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Section Content */}
                <div className="p-3 bg-white dark:bg-zinc-900 rounded border border-zinc-200 dark:border-zinc-800 space-y-3">
                  {/* --- TAB 1: METADATA --- */}
                  {activeTab === "METADATA" && (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center pb-1 border-b border-zinc-100 dark:border-zinc-800">
                        <span className="font-bold text-xs">Verfahrens-Stammdaten</span>
                      </div>

                      {[
                        { key: "caseNumber", label: "Aktenzeichen / Urkunden-Nr.", val: caseDetail.metadata.caseNumber },
                        { key: "title", label: "Vorgangsbezeichnung", val: caseDetail.metadata.title },
                        { key: "matterType", label: "Rechtsgebiet", val: caseDetail.metadata.matterTypeLabel },
                        { key: "targetDate", label: "Beurkundungstermin", val: caseDetail.metadata.targetDate || "[Noch nicht terminiert]" },
                        { key: "notaryName", label: "Zuständiger Notar", val: caseDetail.metadata.notaryName },
                        { key: "assignedClerk", label: "Sachbearbeitung", val: caseDetail.metadata.assignedClerk },
                      ].map((item) => (
                        <div key={item.key} className="flex items-center justify-between gap-2 py-1 text-xs border-b border-zinc-100/60 dark:border-zinc-800/40">
                          <div className="min-w-0">
                            <span className="text-xs text-zinc-500 block">{item.label}</span>
                            <span className="font-bold truncate block">{item.val}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleInsertField(item.key, item.label, item.val, caseDetail.metadata.isVerified)}
                            disabled={isInserting}
                            className="px-2 py-0.5 rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 text-xs shrink-0  hover:bg-zinc-800 disabled:opacity-50"
                            title="Als Word Content Control an Cursor-Position einfügen"
                          >
                            Einfügen
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* --- TAB 2: PARTIES --- */}
                  {activeTab === "PARTIES" && (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center pb-1 border-b border-zinc-100 dark:border-zinc-800">
                        <span className="font-bold text-xs">Beteiligte & Parteien</span>
                        <button
                          type="button"
                          onClick={() => handleInsertSection("PARTIES")}
                          disabled={isInserting || caseDetail.parties.length === 0}
                          className="px-2 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-xs font-bold text-zinc-800 dark:text-zinc-200  disabled:opacity-50"
                        >
                          Alle als Tabelle einfügen
                        </button>
                      </div>

                      {caseDetail.parties.length === 0 ? (
                        <p className="text-zinc-500 text-xs py-3 text-center">
                          Keine Beteiligten in dieser Akte hinterlegt.
                        </p>
                      ) : (
                        caseDetail.parties.map((p, idx) => (
                          <div key={idx} className="p-2 rounded bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-xs">{p.name || "[Name offen]"}</span>
                              <span className="text-xs font-sans px-1 rounded bg-zinc-200 dark:bg-zinc-800">{p.role}</span>
                            </div>

                            <p className="text-xs text-zinc-500 truncate">{p.address || "Keine Anschrift"}</p>

                            <div className="flex items-center gap-1.5 flex-wrap pt-1 text-xs">
                              <button
                                type="button"
                                onClick={() => handleInsertField(`party_${idx}_name`, `Name (${p.role})`, p.name, p.isVerified)}
                                disabled={isInserting}
                                className="px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 text-zinc-800 dark:text-zinc-200 text-[9px]"
                              >
                                Name
                              </button>
                              <button
                                type="button"
                                onClick={() => handleInsertField(`party_${idx}_address`, `Anschrift (${p.role})`, p.address, p.isVerified)}
                                disabled={isInserting}
                                className="px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 text-zinc-800 dark:text-zinc-200 text-[9px]"
                              >
                                Anschrift
                              </button>
                              {p.taxId && (
                                <button
                                  type="button"
                                  onClick={() => handleInsertField(`party_${idx}_taxId`, `Steuer-ID (${p.role})`, p.taxId, p.isVerified)}
                                  disabled={isInserting}
                                  className="px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 text-zinc-800 dark:text-zinc-200 text-[9px]"
                                >
                                  IdNr
                                </button>
                              )}
                              {p.maritalStatus && (
                                <button
                                  type="button"
                                  onClick={() => handleInsertField(`party_${idx}_status`, `Familienstand (${p.role})`, p.maritalStatus, p.isVerified)}
                                  disabled={isInserting}
                                  className="px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 text-zinc-800 dark:text-zinc-200 text-[9px]"
                                >
                                  Güterstand
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* --- TAB 3: PROPERTY --- */}
                  {activeTab === "PROPERTY" && (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center pb-1 border-b border-zinc-100 dark:border-zinc-800">
                        <span className="font-bold text-xs">Grundbuch & Flurstück</span>
                        <button
                          type="button"
                          onClick={() => handleInsertSection("PROPERTY")}
                          disabled={isInserting}
                          className="px-2 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-xs font-bold text-zinc-800 dark:text-zinc-200  disabled:opacity-50"
                        >
                          Als Tabelle einfügen
                        </button>
                      </div>

                      {[
                        { key: "district", label: "Gemarkung", val: caseDetail.property.district },
                        { key: "sheetNumber", label: "Grundbuchblatt", val: caseDetail.property.sheetNumber },
                        { key: "parcelNumber", label: "Flurstück / Flurnummer", val: caseDetail.property.parcelNumber },
                        { key: "areaSqm", label: "Fläche in m²", val: caseDetail.property.areaSqm },
                        { key: "economicUse", label: "Wirtschaftsart", val: caseDetail.property.economicUse },
                      ].map((item) => (
                        <div key={item.key} className="flex items-center justify-between gap-2 py-1 text-xs border-b border-zinc-100/60 dark:border-zinc-800/40">
                          <div className="min-w-0">
                            <span className="text-xs text-zinc-500 block">{item.label}</span>
                            <span className={`font-bold truncate block ${!item.val ? "text-zinc-400 font-normal" : ""}`}>
                              {item.val || "[Nicht angegeben]"}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleInsertField(item.key, item.label, item.val, caseDetail.property.isVerified)}
                            disabled={isInserting || !item.val}
                            className="px-2 py-0.5 rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 text-xs shrink-0  disabled:opacity-40"
                          >
                            Einfügen
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* --- TAB 4: FINANCIALS --- */}
                  {activeTab === "FINANCIALS" && (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center pb-1 border-b border-zinc-100 dark:border-zinc-800">
                        <span className="font-bold text-xs">Kaufpreis & Fälligkeit</span>
                        <button
                          type="button"
                          onClick={() => handleInsertSection("FINANCIALS")}
                          disabled={isInserting}
                          className="px-2 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-xs font-bold text-zinc-800 dark:text-zinc-200  disabled:opacity-50"
                        >
                          Als Tabelle einfügen
                        </button>
                      </div>

                      {[
                        { key: "dealValue", label: "Kaufpreis / Geschäftswert", val: caseDetail.financials.dealValue },
                        { key: "dueDate", label: "Zahlungsfälligkeit", val: caseDetail.financials.dueDate },
                        { key: "encumbrances", label: "Bestehende Belastungen", val: caseDetail.financials.encumbrances },
                      ].map((item) => (
                        <div key={item.key} className="flex items-center justify-between gap-2 py-1 text-xs border-b border-zinc-100/60 dark:border-zinc-800/40">
                          <div className="min-w-0">
                            <span className="text-xs text-zinc-500 block">{item.label}</span>
                            <span className={`font-bold truncate block ${!item.val ? "text-zinc-400 font-normal" : ""}`}>
                              {item.val || "[Nicht vereinbart]"}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleInsertField(item.key, item.label, item.val, caseDetail.financials.isVerified)}
                            disabled={isInserting || !item.val}
                            className="px-2 py-0.5 rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 text-xs shrink-0  disabled:opacity-40"
                          >
                            Einfügen
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </main>

      {/* Footer Notice */}
      <footer className="p-2.5 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 text-xs text-zinc-400 text-center">
        <span>KanzleiFlow • Office.js Word Integration • Technischer Prototyp</span>
      </footer>
    </div>
  );
}
