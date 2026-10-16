"use client";

import { useActionState, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createCaseAction, updateCaseAction, CreateCaseActionState } from "@/app/actions/cases";
import type { CaseRecord } from "@/lib/services/case-service";
import {
  MatterType,
  matterTypeLabels,
  CaseStatus,
  caseStatusLabels,
  Party,
  PropertyDetailsInput,
  FinancialDetailsInput,
  SpecialDetailsInput,
} from "@/lib/validations/case";

const initialState: CreateCaseActionState = {
  success: false,
};

interface CaseFormProps {
  initialPreset?: string;
  initialCase?: CaseRecord;
  assignees?: string[];
}

interface FormPresetData {
  matterType: MatterType;
  title: string;
  caseNumber: string;
  description: string;
  parties: Party[];
  propertyDetails: PropertyDetailsInput;
  financials: FinancialDetailsInput;
  specialDetails: SpecialDetailsInput;
}

function getPresetData(presetName: string): FormPresetData {
  const suggestedAZ = "";

  if (presetName === "real_estate") {
    return {
      matterType: "REAL_ESTATE",
      title: "Grundstückskaufvertrag Flur 22, Gemarkung Bogenhausen",
      caseNumber: suggestedAZ,
      description: "Kaufvertrag mit Auflassungsvormerkung und Finanzierungsgrundschuld über 1.200.000 EUR. Übergabe zum 01.12.2026 vereinbart.",
      parties: [
        {
          role: "Verkäuferin",
          name: "Erika Mustermann",
          address: "Königinstr. 15, 80539 München",
          birthDate: "1975-06-12",
          taxId: "12 345 678 901",
          email: "erika.mustermann@example.de",
          phone: "+49 89 210200",
          maritalStatus: "verheiratet (Gütertrennung)",
        },
        {
          role: "Käufer",
          name: "Dr. Thomas Weber",
          address: "Hauptmarkt 2, 90403 Nürnberg",
          birthDate: "1984-03-22",
          taxId: "98 765 432 109",
          email: "thomas.weber@example.de",
          phone: "+49 911 552200",
          maritalStatus: "ledig",
        },
        {
          role: "Finanzierende Gläubigerin",
          name: "Stadtsparkasse München",
          address: "Sparkassenstr. 2, 80331 München",
        },
      ],
      propertyDetails: {
        landRegistryDistrict: "Bogenhausen",
        sheetNumber: "1842",
        parcelNumber: "Flur 22, Flurstück 104/1",
        areaSqm: 620,
        economicUse: "Wohnbaufläche",
      },
      financials: {
        dealValue: 1200000,
        currency: "EUR",
        paymentDueDate: "2026-11-30",
        existingEncumbrances: "Abt. II: Keine; Abt. III: Finanzierungsgrundschuld 800.000 EUR",
      },
      specialDetails: {},
    };
  }

  if (presetName === "inheritance") {
    return {
      matterType: "INHERITANCE",
      title: "Erbscheinsantrag nach Johann Becker",
      caseNumber: suggestedAZ,
      description: "Gesetzliche Erbfolge nach Erblasser. 2 Miterben zu gleichen Teilen. Vorbereitung der eidesstattlichen Versicherung gem. § 352 FamFG.",
      parties: [
        {
          role: "Erblasser",
          name: "Johann Becker (†)",
          address: "Schwanthalerstr. 40, 80336 München",
          birthDate: "1948-11-04",
          taxId: "44 556 677 889",
        },
        {
          role: "Miterbin / Antragstellerin",
          name: "Claudia Becker",
          address: "Fuggerstr. 8, 86150 Augsburg",
          birthDate: "1978-02-15",
          taxId: "22 334 455 667",
          email: "claudia.becker@example.de",
          phone: "+49 821 445500",
        },
      ],
      propertyDetails: {},
      financials: {
        dealValue: 450000,
        currency: "EUR",
      },
      specialDetails: {
        deceasedDate: "2026-08-14",
      },
    };
  }

  if (presetName === "corporate") {
    return {
      matterType: "CORPORATE",
      title: "Gründung der NovaTech Holding GmbH",
      caseNumber: suggestedAZ,
      description: "Bargründung mit 25.000 EUR Stammkapital und Bestellung der ersten Geschäftsführung mit Alleinvertretungsbefugnis.",
      parties: [
        {
          role: "Gründungsgesellschafter",
          name: "Alexander Gross",
          address: "Maximilianstr. 10, 80539 München",
          birthDate: "1982-09-17",
          taxId: "77 889 900 112",
          email: "alexander.gross@example.de",
          phone: "+49 89 998877",
        },
        {
          role: "Geschäftsführer",
          name: "Simon Klein",
          address: "Königstr. 28, 70173 Stuttgart",
          birthDate: "1989-12-05",
          taxId: "55 667 788 990",
        },
      ],
      propertyDetails: {},
      financials: {
        dealValue: 25000,
        currency: "EUR",
      },
      specialDetails: {
        commercialRegister: "HRB 294810 (in Gründung)",
        registerCourt: "Amtsgericht München",
        shareCapital: 25000,
      },
    };
  }

  return {
    matterType: "REAL_ESTATE",
    title: "",
    caseNumber: suggestedAZ,
    description: "",
    parties: [
      { role: "Verkäufer", name: "", address: "", birthDate: "", taxId: "", email: "", phone: "" },
      { role: "Käufer", name: "", address: "", birthDate: "", taxId: "", email: "", phone: "" },
    ],
    propertyDetails: {
      landRegistryDistrict: "",
      sheetNumber: "",
      parcelNumber: "",
      areaSqm: null,
      economicUse: "Wohnbaufläche",
    },
    financials: {
      dealValue: null,
      currency: "EUR",
      paymentDueDate: "",
      existingEncumbrances: "",
    },
    specialDetails: {},
  };
}

export function CaseForm({ initialPreset, initialCase, assignees = [] }: CaseFormProps) {
  const router = useRouter();
  const expectedUpdatedAt = useRef(initialCase?.updatedAt);
  const dirtyRef = useRef(false);
  const submittedRef = useRef(false);
  const [state, formAction, isPending] = useActionState(async (previous: CreateCaseActionState, values: FormData) => {
    try {
      if (initialCase) values.set("expectedUpdatedAt", expectedUpdatedAt.current || "");
      const localDate = values.get("targetDate")?.toString();
      if (localDate) values.set("targetDate", new Date(localDate).toISOString());
      const result = await (initialCase ? updateCaseAction(initialCase.id, previous, values) : createCaseAction(previous, values));
      if (result.success && result.caseId) {
        dirtyRef.current = false;
        expectedUpdatedAt.current = result.updatedAt;
        if (initialCase) router.replace(`/cases/${result.caseId}`);
        else router.push(`/cases/${result.caseId}`);
      }
      return result;
    } catch {
      return { success: false, message: "Speichern fehlgeschlagen. Ihre Eingaben bleiben erhalten. Bitte erneut versuchen." };
    }
  }, initialState);

  const initialValues = initialCase ? {
    ...initialCase, description: initialCase.description || "", propertyDetails: initialCase.propertyDetails || {},
    financials: initialCase.financials || { currency: "EUR" }, specialDetails: initialCase.specialDetails || {},
  } : getPresetData(initialPreset || "");
  useEffect(() => {
    if (state.message) submittedRef.current = false;
    if (state.success) dirtyRef.current = false;
  }, [state]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirtyRef.current) { event.preventDefault(); event.returnValue = ""; } };
    const navigate = (event: MouseEvent) => {
      if (dirtyRef.current && event.target instanceof Element && event.target.closest("a[href]") && !window.confirm("Ungespeicherte Änderungen verwerfen?")) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", warn); document.removeEventListener("click", navigate, true); };
  }, []);
  const [matterType, setMatterType] = useState<MatterType>(initialValues.matterType);
  const [title, setTitle] = useState(initialValues.title);
  const [caseNumber, setCaseNumber] = useState(initialValues.caseNumber);
  const [description, setDescription] = useState(initialValues.description);
  const [parties, setParties] = useState<Party[]>(initialValues.parties);

  const [notaryName, setNotaryName] = useState(initialCase?.notaryName || "");
  const [assignedClerk, setAssignedClerk] = useState(initialCase?.assignedClerk || "");
  const [status, setStatus] = useState(initialCase?.status || "DRAFT");
  const [targetDate, setTargetDate] = useState(initialCase?.targetDate ? new Date(new Date(initialCase.targetDate).getTime() - new Date(initialCase.targetDate).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");

  // Property Details
  const [propertyDetails, setPropertyDetails] = useState<PropertyDetailsInput>(
    initialValues.propertyDetails
  );

  // Financial Details
  const [financials, setFinancials] = useState<FinancialDetailsInput>(
    initialValues.financials
  );

  // Special Details
  const [specialDetails, setSpecialDetails] = useState<SpecialDetailsInput>(
    initialValues.specialDetails
  );

  // Quick preset applicator
  const applyPreset = (presetKey: string) => {
    if ((title || description || parties.some((party) => party.name)) && !window.confirm("Beispieldaten übernehmen? Ihre bisherigen Eingaben werden ersetzt.")) return;
    dirtyRef.current = true;
    const data = getPresetData(presetKey);
    setMatterType(data.matterType);
    setTitle(data.title);
    setCaseNumber(data.caseNumber);
    setDescription(data.description);
    setParties(data.parties);
    setPropertyDetails(data.propertyDetails);
    setFinancials(data.financials);
    setSpecialDetails(data.specialDetails);
  };

  const addParty = () => {
    dirtyRef.current = true;
    setParties([
      ...parties,
      { role: "Beteiligte/r", name: "", address: "", birthDate: "", taxId: "", email: "", phone: "" },
    ]);
  };

  const removeParty = (index: number) => {
    dirtyRef.current = true;
    setParties(parties.filter((_, i) => i !== index));
  };

  const updateParty = (index: number, field: keyof Party, val: string) => {
    const updated = [...parties];
    updated[index] = { ...updated[index], [field]: val };
    setParties(updated);
  };

  return (
    <form action={formAction} onReset={(event) => event.preventDefault()} onChange={() => { dirtyRef.current = true; }} onSubmit={(event) => {
      if (submittedRef.current) { event.preventDefault(); return; }
      submittedRef.current = true;
    }} className="space-y-6">
      <fieldset disabled={isPending} className="space-y-6 min-w-0">
      <legend className="sr-only">Aktendaten</legend>
      <input type="hidden" name="financialCurrency" value={financials.currency} />
      {/* Preset Schnellwahl Bar */}
      {!initialCase && <div className="bg-white dark:bg-zinc-950 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200 block">
            Beispiel-Vorlage vorausfüllen:
          </span>
          <span className="text-xs text-zinc-400">
            Übernimmt fiktive Beispieldaten. Bitte vor dem Speichern prüfen.
          </span>
        </div>
          <button
            type="button"
            onClick={() => applyPreset("real_estate")}
            className="px-2.5 py-1 rounded-lg text-sm font-sans font-medium border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800  transition-colors duration-150"
          >
            Grundstückskauf (Bogenhausen)
          </button>
          <button
            type="button"
            onClick={() => applyPreset("inheritance")}
            className="px-2.5 py-1 rounded-lg text-sm font-sans font-medium border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800  transition-colors duration-150"
          >
            Erbschein (Becker)
          </button>
          <button
            type="button"
            onClick={() => applyPreset("corporate")}
            className="px-2.5 py-1 rounded-lg text-sm font-sans font-medium border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800  transition-colors duration-150"
          >
            GmbH-Gründung (NovaTech)
          </button>
      </div>

      }
      {/* Error Banner */}
      {!state.success && state.message && (
        <div role="alert" tabIndex={-1} className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl p-4 text-sm text-rose-800 dark:text-rose-200">
          <p className="font-bold">{state.message}</p>
          {state.errors && (
            <ul className="mt-2 list-disc list-inside text-sm space-y-1">
              {Object.entries(state.errors).map(([field, err]) => (
                <li key={field}>
                  <span className="font-semibold capitalize">{field}:</span> {err}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Card 1: Stammdaten */}
      <div className="bg-white dark:bg-zinc-950 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-5">
        <h2 className="text-base font-bold text-zinc-900 dark:text-white border-b border-zinc-200 dark:border-zinc-800 pb-3">
          1. Stammdaten des Urkundsgeschäfts
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label
              htmlFor="caseNumber"
              className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1.5"
            >
              Aktenzeichen *
            </label>
            <input
              type="text"
              id="caseNumber"
              name="caseNumber"
              required
              value={caseNumber}
              onChange={(e) => setCaseNumber(e.target.value)}
              placeholder="z. B. 2026-UR-0145"
              className="w-full h-10 font-sans px-3.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:ring-2 focus:ring-blue-500 transition"
            />
            {state.errors?.caseNumber && (
              <p className="text-sm text-rose-600 font-medium mt-1">{state.errors.caseNumber}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="matterType"
              className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1.5"
            >
              Rechtsgebiet / Urkundenart *
            </label>
            <select
              id="matterType"
              name="matterType"
              value={matterType}
              onChange={(e) => setMatterType(e.target.value as MatterType)}
              className="w-full h-10 px-3.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:ring-2 focus:ring-blue-500 transition"
            >
              {(Object.keys(matterTypeLabels) as MatterType[]).map((key) => (
                <option key={key} value={key}>
                  {matterTypeLabels[key]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label
            htmlFor="title"
            className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1.5"
          >
            Vorgangsbezeichnung / Betreff *
          </label>
          <input
            type="text"
            id="title"
            name="title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="z. B. Kaufvertrag Grundstück Flur 14, Gemarkung Schwabing"
            className="w-full h-10 px-3.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:ring-2 focus:ring-blue-500 transition"
          />
          {state.errors?.title && (
            <p className="text-sm text-rose-600 font-medium mt-1">{state.errors.title}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="description"
            className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1.5"
          >
            Kurzbeschreibung & Notizen zum Sachverhalt
          </label>
          <textarea
            id="description"
            name="description"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Wesentliche Vertragsdaten, Vereinbarungen, Vollzugshinweise..."
            className="w-full p-3.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:ring-2 focus:ring-blue-500 transition"
          />
        </div>
      </div>

      {/* Card 2: Zuständigkeiten & Termine */}
      <div className="bg-white dark:bg-zinc-950 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-5">
        <h2 className="text-base font-bold text-zinc-900 dark:text-white border-b border-zinc-200 dark:border-zinc-800 pb-3">
          2. Zuständigkeiten & Termine
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-y-1.5">
          <div className="grid gap-y-1.5 md:row-span-2 md:grid-rows-subgrid">
            <label
              htmlFor="notaryName"
              className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1.5"
            >
              Zuständige/r Notar/in
            </label>
            <input
              type="text"
              id="notaryName"
              name="notaryName"
              value={notaryName} onChange={(event) => setNotaryName(event.target.value)}
              placeholder="Name der zuständigen Notarin oder des Notars"
              className="block w-full !h-10 box-border min-h-0 !py-0 px-3.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:ring-2 focus:ring-blue-500 transition"
            />
          </div>

          <div className="grid gap-y-1.5 md:row-span-2 md:grid-rows-subgrid">
            <label
              htmlFor="assignedClerk"
              className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1.5"
            >
              Sachbearbeiter/in (Notarfachangestellte/r)
            </label>
            <select
              id="assignedClerk"
              name="assignedClerk"
              value={assignedClerk} onChange={(event) => setAssignedClerk(event.target.value)}
              className="block w-full !h-10 box-border min-h-0 !py-0 px-3.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:ring-2 focus:ring-blue-500 transition"
            >
              <option value="">Noch nicht zugewiesen</option>
              {assignees.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>

          <div className="grid gap-y-1.5 md:row-span-2 md:grid-rows-subgrid">
            <label
              htmlFor="status"
              className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1.5"
            >
              Bearbeitungsstatus *
            </label>
            <select
              id="status"
              name="status"
              value={status} onChange={(event) => setStatus(event.target.value as CaseStatus)}
              className="block w-full !h-10 box-border min-h-0 !py-0 px-3.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:ring-2 focus:ring-blue-500 transition"
            >
              {(Object.keys(caseStatusLabels) as CaseStatus[]).map((key) => (
                <option key={key} value={key}>
                  {caseStatusLabels[key]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-y-1.5 md:row-span-2 md:grid-rows-subgrid">
          <label
            htmlFor="targetDate"
            className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1.5"
          >
            Geplanter Beurkundungstermin (optional)
          </label>
          <input
            type="datetime-local"
            id="targetDate"
            name="targetDate"
            value={targetDate} onChange={(event) => setTargetDate(event.target.value)}
            className="w-full sm:w-72 h-10 px-3.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:ring-2 focus:ring-blue-500 transition"
          />
        </div>
      </div>

      {/* Card 3: Beteiligte & Parteien */}
      <div className="bg-white dark:bg-zinc-950 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-3">
          <div>
            <h2 className="text-base font-bold text-zinc-900 dark:text-white">
              3. Beteiligte & Parteien ({parties.length})
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
              Vollständige Angaben für Legitimation (§ 10 BeurkG), GwG und Finanzamtsmeldung (§ 139b AO)
            </p>
          </div>
          <button
            type="button"
            onClick={addParty}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition self-start sm:self-auto shadow-2xs"
          >
            <span>+</span>
            <span>Beteiligten hinzufügen</span>
          </button>
        </div>

        <div className="space-y-4 pt-1">
          {parties.map((party, idx) => (
            <div
              key={idx}
              className="p-4 rounded-xl bg-zinc-50/70 dark:bg-zinc-900/50 border border-zinc-200/80 dark:border-zinc-800 space-y-3"
            >
              <div className="flex items-center justify-between">
                <input type="hidden" name="partyNationality" value={party.nationality || ""} />
                <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 flex items-center justify-center text-xs font-extrabold">
                    {idx + 1}
                  </span>
                  <span>Beteiligte/r: {party.role || "Rolle offen"}</span>
                </span>
                {parties.length > 0 && (
                  <button
                    type="button"
                    onClick={() => removeParty(idx)}
                    className="text-sm font-sans text-rose-600 dark:text-rose-400 hover:underline px-1 py-0.5"
                  >
                    [entfernen]
                  </button>
                )}
              </div>

              {/* Row 1: Rolle, Name, Anschrift */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                <div className="md:col-span-3">
                  <label className="block text-xs font-medium text-zinc-500 mb-1">
                    Rolle (z. B. Verkäuferin, Käufer, Erbe)
                  </label>
                  <input aria-label="Rolle (z. B. Verkäuferin, Käufer, Erbe)"
                    type="text"
                    name="partyRole"
                    value={party.role}
                    onChange={(e) => updateParty(idx, "role", e.target.value)}
                    placeholder="Rolle"
                    className="w-full h-9 px-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm"
                  />
                </div>
                <div className="md:col-span-4">
                  <label className="block text-xs font-medium text-zinc-500 mb-1">
                    Vollständiger Name / Firma *
                  </label>
                  <input aria-label="Vollständiger Name / Firma *"
                    type="text"
                    name="partyName"
                    value={party.name}
                    onChange={(e) => updateParty(idx, "name", e.target.value)}
                    placeholder="Vorname Nachname / Firma"
                    className="w-full h-9 px-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm font-semibold"
                  />
                </div>
                <div className="md:col-span-5">
                  <label className="block text-xs font-medium text-zinc-500 mb-1">
                    Anschrift (Straße, Hausnr., PLZ Ort)
                  </label>
                  <input aria-label="Anschrift (Straße, Hausnr., PLZ Ort)"
                    type="text"
                    name="partyAddress"
                    value={party.address || ""}
                    onChange={(e) => updateParty(idx, "address", e.target.value)}
                    placeholder="Musterstr. 1, 80333 München"
                    className="w-full h-9 px-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm"
                  />
                </div>
              </div>

              {/* Row 2: Geburtsdatum, Steuer-ID, E-Mail, Telefon */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1 border-t border-zinc-200/50 dark:border-zinc-800/50">
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">
                    Geburtsdatum
                  </label>
                  <input aria-label="Geburtsdatum"
                    type="date"
                    name="partyBirthDate"
                    value={party.birthDate || ""}
                    onChange={(e) => updateParty(idx, "birthDate", e.target.value)}
                    className="w-full h-8 px-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">
                    Steuer-ID (§ 139b AO)
                  </label>
                  <input aria-label="Steuer-ID (§ 139b AO)"
                    type="text"
                    name="partyTaxId"
                    value={party.taxId || ""}
                    onChange={(e) => updateParty(idx, "taxId", e.target.value)}
                    placeholder="z. B. 12 345 678 901"
                    className="w-full h-8 px-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm font-sans"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">
                    E-Mail (Entwurfsversand)
                  </label>
                  <input aria-label="E-Mail (Entwurfsversand)"
                    type="email"
                    name="partyEmail"
                    value={party.email || ""}
                    onChange={(e) => updateParty(idx, "email", e.target.value)}
                    placeholder="name@beispiel.de"
                    className="w-full h-8 px-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">
                    Telefon / Mobil
                  </label>
                  <input aria-label="Telefon / Mobil"
                    type="text"
                    name="partyPhone"
                    value={party.phone || ""}
                    onChange={(e) => updateParty(idx, "phone", e.target.value)}
                    placeholder="+49 89 ..."
                    className="w-full h-8 px-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm"
                  />
                </div>
              </div>

              {/* Row 3: Familienstand / Güterstand */}
              <div className="pt-1">
                <label className="block text-xs font-medium text-zinc-500 mb-1">
                  Familien- & Güterstand (optional, z. B. verheiratet in Zugewinngemeinschaft für § 1365 BGB)
                </label>
                <input aria-label="Familien- & Güterstand (optional, z. B. verheiratet in Zugewinngemeinschaft für § 1365 BGB)"
                  type="text"
                  name="partyMaritalStatus"
                  value={party.maritalStatus || ""}
                  onChange={(e) => updateParty(idx, "maritalStatus", e.target.value)}
                  placeholder="z. B. verheiratet (Gütertrennung) / ledig"
                  className="w-full h-8 px-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Card 4: Vertragsgegenstand & Grundbuchdaten (Grundstück / Immobilie) */}
      <div className="bg-white dark:bg-zinc-950 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-4">
        <div>
          <h2 className="text-base font-bold text-zinc-900 dark:text-white">
            4. Vertragsgegenstand & Grundbuchdaten
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            Grundbuchamtliche Bezeichnungen für Kaufverträge, Überlassungen und Grundschulden
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <div>
            <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Gemarkung
            </label>
            <input aria-label="Gemarkung"
              type="text"
              name="propertyLandRegistryDistrict"
              value={propertyDetails.landRegistryDistrict || ""}
              onChange={(e) =>
                setPropertyDetails({ ...propertyDetails, landRegistryDistrict: e.target.value })
              }
              placeholder="z. B. Schwabing, Bogenhausen"
              className="w-full h-9 px-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Grundbuchblatt (Abt. I)
            </label>
            <input aria-label="Grundbuchblatt (Abt. I)"
              type="text"
              name="propertySheetNumber"
              value={propertyDetails.sheetNumber || ""}
              onChange={(e) =>
                setPropertyDetails({ ...propertyDetails, sheetNumber: e.target.value })
              }
              placeholder="z. B. 4521"
              className="w-full h-9 px-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm font-sans"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Flurstück / Flurnummer
            </label>
            <input aria-label="Flurstück / Flurnummer"
              type="text"
              name="propertyParcelNumber"
              value={propertyDetails.parcelNumber || ""}
              onChange={(e) =>
                setPropertyDetails({ ...propertyDetails, parcelNumber: e.target.value })
              }
              placeholder="z. B. Flur 14, Flurstück 88/2"
              className="w-full h-9 px-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Grundstücksfläche (in m²)
            </label>
            <input aria-label="Grundstücksfläche (in m²)"
              type="number" step="0.01" min="0"
              name="propertyAreaSqm"
              value={propertyDetails.areaSqm ?? ""}
              onChange={(e) =>
                setPropertyDetails({
                  ...propertyDetails,
                  areaSqm: e.target.value ? Number(e.target.value) : null,
                })
              }
              placeholder="z. B. 850"
              className="w-full h-9 px-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Wirtschaftsart / Nutzungsart
            </label>
            <input aria-label="Wirtschaftsart / Nutzungsart"
              type="text"
              name="propertyEconomicUse"
              value={propertyDetails.economicUse || ""}
              onChange={(e) =>
                setPropertyDetails({ ...propertyDetails, economicUse: e.target.value })
              }
              placeholder="z. B. Gebäude- und Freifläche, Wohnbaufläche"
              className="w-full h-9 px-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Card 5: Kaufpreis & Finanzielle Bedingungen */}
      <div className="bg-white dark:bg-zinc-950 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-4">
        <div>
          <h2 className="text-base font-bold text-zinc-900 dark:text-white">
            5. Gegenleistung & Kaufpreis / Geschäftswert
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            Zahlungsmodalitäten und Gebührenberechnungsgrundlage (§ 34 GNotKG)
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <div>
            <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Kaufpreis / Geschäftswert (in EUR)
            </label>
            <input aria-label="Kaufpreis / Geschäftswert (in EUR)"
              type="number" step="0.01" min="0"
              name="financialDealValue"
              value={financials.dealValue ?? ""}
              onChange={(e) =>
                setFinancials({
                  ...financials,
                  dealValue: e.target.value ? Number(e.target.value) : null,
                })
              }
              placeholder="z. B. 1850000"
              className="w-full h-9 px-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm font-semibold"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Zahlungsfälligkeit
            </label>
            <input aria-label="Zahlungsfälligkeit"
              type="text"
              name="financialPaymentDueDate"
              value={financials.paymentDueDate || ""}
              onChange={(e) =>
                setFinancials({ ...financials, paymentDueDate: e.target.value })
              }
              placeholder="z. B. 15. November 2026 / 14 Tage nach Vormerkung"
              className="w-full h-9 px-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
            />
          </div>

          <div className="sm:col-span-3">
            <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Eingetragene Lasten / Vorlasten (Abt. II / Abt. III)
            </label>
            <input aria-label="Eingetragene Lasten / Vorlasten (Abt. II / Abt. III)"
              type="text"
              name="financialExistingEncumbrances"
              value={financials.existingEncumbrances || ""}
              onChange={(e) =>
                setFinancials({ ...financials, existingEncumbrances: e.target.value })
              }
              placeholder="z. B. Abt. II: Geh- und Fahrtrecht; Abt. III: Grundschuld 500.000 EUR (zu löschen)"
              className="w-full h-9 px-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Card 6: Gesellschafts- & Erbrechtsangaben (Optional / kontextabhängig) */}
      <div className="bg-white dark:bg-zinc-950 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-4">
        <div>
          <h2 className="text-base font-bold text-zinc-900 dark:text-white">
            6. Register- & Erbrechtsangaben (falls zutreffend)
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            Zusatzangaben für Gesellschaftsgründungen, Handelsregisteranmeldungen oder Erbfälle
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-2 items-end">
          <div>
            <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Handelsregister-Nummer
            </label>
            <input aria-label="Handelsregister-Nummer"
              type="text"
              name="specialCommercialRegister"
              value={specialDetails.commercialRegister || ""}
              onChange={(e) =>
                setSpecialDetails({ ...specialDetails, commercialRegister: e.target.value })
              }
              placeholder="z. B. HRB 241900"
              className="w-full h-9 px-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm font-sans"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Zuständiges Registergericht
            </label>
            <input aria-label="Zuständiges Registergericht"
              type="text"
              name="specialRegisterCourt"
              value={specialDetails.registerCourt || ""}
              onChange={(e) =>
                setSpecialDetails({ ...specialDetails, registerCourt: e.target.value })
              }
              placeholder="z. B. Amtsgericht München"
              className="w-full h-9 px-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Stammkapital (in EUR)
            </label>
            <input aria-label="Stammkapital (in EUR)"
              type="number" step="0.01" min="0"
              name="specialShareCapital"
              value={specialDetails.shareCapital ?? ""}
              onChange={(e) =>
                setSpecialDetails({
                  ...specialDetails,
                  shareCapital: e.target.value ? Number(e.target.value) : null,
                })
              }
              placeholder="z. B. 25000"
              className="w-full h-9 px-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Sterbedatum (bei Erbfall)
            </label>
            <input aria-label="Sterbedatum (bei Erbfall)"
              type="date"
              name="specialDeceasedDate"
              value={specialDetails.deceasedDate || ""}
              onChange={(e) =>
                setSpecialDetails({ ...specialDetails, deceasedDate: e.target.value })
              }
              className="w-full h-9 px-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="flex items-center justify-end gap-3 pt-3">
        <button
          type="button"
          onClick={() => { if (!dirtyRef.current || window.confirm("Ungespeicherte Änderungen verwerfen?")) { dirtyRef.current = false; if (initialCase) router.push(`/cases/${initialCase.id}`); else router.back(); } }}
          className="px-5 py-2.5 text-sm font-semibold rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
        >
          Abbrechen
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="px-6 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg shadow-xs transition flex items-center gap-2"
        >
          {isPending ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>{initialCase ? "Wird gespeichert …" : "Akte wird angelegt…"}</span>
            </>
          ) : (
            <span>{initialCase ? "Änderungen speichern" : "Akte anlegen"}</span>
          )}
        </button>
      </div>
      </fieldset>
    </form>
  );
}
