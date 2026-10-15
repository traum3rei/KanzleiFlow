"use client";

import { useActionState, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createCaseAction, CreateCaseActionState } from "@/app/actions/cases";
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
  const randomNum = Math.floor(100 + Math.random() * 900);
  const suggestedAZ = `2026-UR-0${randomNum}`;

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

export function CaseForm({ initialPreset }: CaseFormProps) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(createCaseAction, initialState);

  const initialValues = getPresetData(initialPreset || "");
  const [matterType, setMatterType] = useState<MatterType>(initialValues.matterType);
  const [title, setTitle] = useState(initialValues.title);
  const [caseNumber, setCaseNumber] = useState(initialValues.caseNumber);
  const [description, setDescription] = useState(initialValues.description);
  const [parties, setParties] = useState<Party[]>(initialValues.parties);

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

  // Redirect on success
  useEffect(() => {
    if (state.success && state.caseId) {
      router.push(`/cases/${state.caseId}`);
    }
  }, [state, router]);

  const addParty = () => {
    setParties([
      ...parties,
      { role: "Beteiligte/r", name: "", address: "", birthDate: "", taxId: "", email: "", phone: "" },
    ]);
  };

  const removeParty = (index: number) => {
    setParties(parties.filter((_, i) => i !== index));
  };

  const updateParty = (index: number, field: keyof Party, val: string) => {
    const updated = [...parties];
    updated[index] = { ...updated[index], [field]: val };
    setParties(updated);
  };

  return (
    <form action={formAction} className="space-y-6">
      {/* Preset Schnellwahl Bar */}
      <div className="bg-white dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
            Beispiel-Vorlage vorausfüllen:
          </span>
          <span className="text-[11px] text-slate-400">
            Füllt automatisch alle Beteiligten, Grundbuch- und Finanzdaten aus
          </span>
        </div>
          <button
            type="button"
            onClick={() => applyPreset("real_estate")}
            className="px-2.5 py-1 rounded-[4px] text-xs font-mono font-medium border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 active:scale-[0.98] transition-transform duration-150"
          >
            [immo] Grundstückskauf (Bogenhausen)
          </button>
          <button
            type="button"
            onClick={() => applyPreset("inheritance")}
            className="px-2.5 py-1 rounded-[4px] text-xs font-mono font-medium border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 active:scale-[0.98] transition-transform duration-150"
          >
            [erbe] Erbschein (Becker)
          </button>
          <button
            type="button"
            onClick={() => applyPreset("corporate")}
            className="px-2.5 py-1 rounded-[4px] text-xs font-mono font-medium border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 active:scale-[0.98] transition-transform duration-150"
          >
            [gmbh] GmbH-Gründung (NovaTech)
          </button>
      </div>

      {/* Error Banner */}
      {!state.success && state.message && (
        <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl p-4 text-sm text-rose-800 dark:text-rose-200">
          <p className="font-bold">{state.message}</p>
          {state.errors && (
            <ul className="mt-2 list-disc list-inside text-xs space-y-1">
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
      <div className="bg-white dark:bg-slate-950 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-5">
        <h2 className="text-base font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-3">
          1. Stammdaten des Urkundsgeschäfts
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label
              htmlFor="caseNumber"
              className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Aktenzeichen / Urkundenrolle (UR-Nr.) *
            </label>
            <input
              type="text"
              id="caseNumber"
              name="caseNumber"
              required
              value={caseNumber}
              onChange={(e) => setCaseNumber(e.target.value)}
              placeholder="z. B. 2026-UR-0145"
              className="w-full h-10 font-mono px-3.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-indigo-500 transition"
            />
            {state.errors?.caseNumber && (
              <p className="text-xs text-rose-600 font-medium mt-1">{state.errors.caseNumber}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="matterType"
              className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Rechtsgebiet / Urkundenart *
            </label>
            <select
              id="matterType"
              name="matterType"
              value={matterType}
              onChange={(e) => setMatterType(e.target.value as MatterType)}
              className="w-full h-10 px-3.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-indigo-500 transition"
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
            className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5"
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
            className="w-full h-10 px-3.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-indigo-500 transition"
          />
          {state.errors?.title && (
            <p className="text-xs text-rose-600 font-medium mt-1">{state.errors.title}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="description"
            className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5"
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
            className="w-full p-3.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-indigo-500 transition"
          />
        </div>
      </div>

      {/* Card 2: Zuständigkeiten & Termine */}
      <div className="bg-white dark:bg-slate-950 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-5">
        <h2 className="text-base font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-3">
          2. Zuständigkeiten & Termine
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div>
            <label
              htmlFor="notaryName"
              className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Zuständige/r Notar/in
            </label>
            <input
              type="text"
              id="notaryName"
              name="notaryName"
              defaultValue="Dr. Johannes Weiss"
              className="w-full h-10 px-3.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-indigo-500 transition"
            />
          </div>

          <div>
            <label
              htmlFor="assignedClerk"
              className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Sachbearbeiter/in (Notarfachangestellte/r)
            </label>
            <select
              id="assignedClerk"
              name="assignedClerk"
              defaultValue="Stefanie Bauer"
              className="w-full h-10 px-3.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-indigo-500 transition"
            >
              <option value="Stefanie Bauer">Stefanie Bauer (Bürovorsteherin)</option>
              <option value="Michael Köhler">Michael Köhler (Notarfachwirt)</option>
              <option value="Katharina Lind">Katharina Lind (Assessorin)</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="status"
              className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Bearbeitungsstatus *
            </label>
            <select
              id="status"
              name="status"
              defaultValue="DRAFT"
              className="w-full h-10 px-3.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-indigo-500 transition"
            >
              {(Object.keys(caseStatusLabels) as CaseStatus[]).map((key) => (
                <option key={key} value={key}>
                  {caseStatusLabels[key]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label
            htmlFor="targetDate"
            className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5"
          >
            Geplanter Beurkundungstermin (optional)
          </label>
          <input
            type="datetime-local"
            id="targetDate"
            name="targetDate"
            className="w-full sm:w-72 h-10 px-3.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-indigo-500 transition"
          />
        </div>
      </div>

      {/* Card 3: Beteiligte & Parteien */}
      <div className="bg-white dark:bg-slate-950 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              3. Beteiligte & Parteien ({parties.length})
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Vollständige Angaben für Legitimation (§ 10 BeurkG), GwG und Finanzamtsmeldung (§ 139b AO)
            </p>
          </div>
          <button
            type="button"
            onClick={addParty}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition self-start sm:self-auto shadow-2xs"
          >
            <span>+</span>
            <span>Beteiligten hinzufügen</span>
          </button>
        </div>

        <div className="space-y-4 pt-1">
          {parties.map((party, idx) => (
            <div
              key={idx}
              className="p-4 rounded-xl bg-slate-50/70 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-[10px] font-extrabold">
                    {idx + 1}
                  </span>
                  <span>Beteiligte/r: {party.role || "Rolle offen"}</span>
                </span>
                {parties.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeParty(idx)}
                    className="text-xs font-mono text-rose-600 dark:text-rose-400 hover:underline px-1 py-0.5"
                  >
                    [entfernen]
                  </button>
                )}
              </div>

              {/* Row 1: Rolle, Name, Anschrift */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                <div className="md:col-span-3">
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">
                    Rolle (z. B. Verkäuferin, Käufer, Erbe)
                  </label>
                  <input
                    type="text"
                    name="partyRole"
                    value={party.role}
                    onChange={(e) => updateParty(idx, "role", e.target.value)}
                    placeholder="Rolle"
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
                  />
                </div>
                <div className="md:col-span-4">
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">
                    Vollständiger Name / Firma *
                  </label>
                  <input
                    type="text"
                    name="partyName"
                    value={party.name}
                    onChange={(e) => updateParty(idx, "name", e.target.value)}
                    placeholder="Vorname Nachname / Firma"
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-semibold"
                  />
                </div>
                <div className="md:col-span-5">
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">
                    Anschrift (Straße, Hausnr., PLZ Ort)
                  </label>
                  <input
                    type="text"
                    name="partyAddress"
                    value={party.address || ""}
                    onChange={(e) => updateParty(idx, "address", e.target.value)}
                    placeholder="Musterstr. 1, 80333 München"
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
                  />
                </div>
              </div>

              {/* Row 2: Geburtsdatum, Steuer-ID, E-Mail, Telefon */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1 border-t border-slate-200/50 dark:border-slate-800/50">
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">
                    Geburtsdatum
                  </label>
                  <input
                    type="date"
                    name="partyBirthDate"
                    value={party.birthDate || ""}
                    onChange={(e) => updateParty(idx, "birthDate", e.target.value)}
                    className="w-full h-8 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">
                    Steuer-ID (§ 139b AO)
                  </label>
                  <input
                    type="text"
                    name="partyTaxId"
                    value={party.taxId || ""}
                    onChange={(e) => updateParty(idx, "taxId", e.target.value)}
                    placeholder="z. B. 12 345 678 901"
                    className="w-full h-8 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">
                    E-Mail (Entwurfsversand)
                  </label>
                  <input
                    type="email"
                    name="partyEmail"
                    value={party.email || ""}
                    onChange={(e) => updateParty(idx, "email", e.target.value)}
                    placeholder="name@beispiel.de"
                    className="w-full h-8 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">
                    Telefon / Mobil
                  </label>
                  <input
                    type="text"
                    name="partyPhone"
                    value={party.phone || ""}
                    onChange={(e) => updateParty(idx, "phone", e.target.value)}
                    placeholder="+49 89 ..."
                    className="w-full h-8 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
                  />
                </div>
              </div>

              {/* Row 3: Familienstand / Güterstand */}
              <div className="pt-1">
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  Familien- & Güterstand (optional, z. B. verheiratet in Zugewinngemeinschaft für § 1365 BGB)
                </label>
                <input
                  type="text"
                  name="partyMaritalStatus"
                  value={party.maritalStatus || ""}
                  onChange={(e) => updateParty(idx, "maritalStatus", e.target.value)}
                  placeholder="z. B. verheiratet (Gütertrennung) / ledig"
                  className="w-full h-8 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Card 4: Vertragsgegenstand & Grundbuchdaten (Grundstück / Immobilie) */}
      <div className="bg-white dark:bg-slate-950 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            4. Vertragsgegenstand & Grundbuchdaten
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Grundbuchamtliche Bezeichnungen für Kaufverträge, Überlassungen und Grundschulden
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Gemarkung
            </label>
            <input
              type="text"
              name="propertyLandRegistryDistrict"
              value={propertyDetails.landRegistryDistrict || ""}
              onChange={(e) =>
                setPropertyDetails({ ...propertyDetails, landRegistryDistrict: e.target.value })
              }
              placeholder="z. B. Schwabing, Bogenhausen"
              className="w-full h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Grundbuchblatt (Abt. I)
            </label>
            <input
              type="text"
              name="propertySheetNumber"
              value={propertyDetails.sheetNumber || ""}
              onChange={(e) =>
                setPropertyDetails({ ...propertyDetails, sheetNumber: e.target.value })
              }
              placeholder="z. B. 4521"
              className="w-full h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Flurstück / Flurnummer
            </label>
            <input
              type="text"
              name="propertyParcelNumber"
              value={propertyDetails.parcelNumber || ""}
              onChange={(e) =>
                setPropertyDetails({ ...propertyDetails, parcelNumber: e.target.value })
              }
              placeholder="z. B. Flur 14, Flurstück 88/2"
              className="w-full h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Grundstücksfläche (in m²)
            </label>
            <input
              type="number"
              name="propertyAreaSqm"
              value={propertyDetails.areaSqm ?? ""}
              onChange={(e) =>
                setPropertyDetails({
                  ...propertyDetails,
                  areaSqm: e.target.value ? Number(e.target.value) : null,
                })
              }
              placeholder="z. B. 850"
              className="w-full h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Wirtschaftsart / Nutzungsart
            </label>
            <input
              type="text"
              name="propertyEconomicUse"
              value={propertyDetails.economicUse || ""}
              onChange={(e) =>
                setPropertyDetails({ ...propertyDetails, economicUse: e.target.value })
              }
              placeholder="z. B. Gebäude- und Freifläche, Wohnbaufläche"
              className="w-full h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
            />
          </div>
        </div>
      </div>

      {/* Card 5: Kaufpreis & Finanzielle Bedingungen */}
      <div className="bg-white dark:bg-slate-950 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            5. Gegenleistung & Kaufpreis / Geschäftswert
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Zahlungsmodalitäten und Gebührenberechnungsgrundlage (§ 34 GNotKG)
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Kaufpreis / Geschäftswert (in EUR)
            </label>
            <input
              type="number"
              name="financialDealValue"
              value={financials.dealValue ?? ""}
              onChange={(e) =>
                setFinancials({
                  ...financials,
                  dealValue: e.target.value ? Number(e.target.value) : null,
                })
              }
              placeholder="z. B. 1850000"
              className="w-full h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Zahlungsfälligkeit
            </label>
            <input
              type="text"
              name="financialPaymentDueDate"
              value={financials.paymentDueDate || ""}
              onChange={(e) =>
                setFinancials({ ...financials, paymentDueDate: e.target.value })
              }
              placeholder="z. B. 15. November 2026 / 14 Tage nach Vormerkung"
              className="w-full h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
            />
          </div>

          <div className="sm:col-span-3">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Eingetragene Lasten / Vorlasten (Abt. II / Abt. III)
            </label>
            <input
              type="text"
              name="financialExistingEncumbrances"
              value={financials.existingEncumbrances || ""}
              onChange={(e) =>
                setFinancials({ ...financials, existingEncumbrances: e.target.value })
              }
              placeholder="z. B. Abt. II: Geh- und Fahrtrecht; Abt. III: Grundschuld 500.000 EUR (zu löschen)"
              className="w-full h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
            />
          </div>
        </div>
      </div>

      {/* Card 6: Gesellschafts- & Erbrechtsangaben (Optional / kontextabhängig) */}
      <div className="bg-white dark:bg-slate-950 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            6. Register- & Erbrechtsangaben (falls zutreffend)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Zusatzangaben für Gesellschaftsgründungen, Handelsregisteranmeldungen oder Erbfälle
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-2">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Handelsregister-Nummer
            </label>
            <input
              type="text"
              name="specialCommercialRegister"
              value={specialDetails.commercialRegister || ""}
              onChange={(e) =>
                setSpecialDetails({ ...specialDetails, commercialRegister: e.target.value })
              }
              placeholder="z. B. HRB 241900"
              className="w-full h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Zuständiges Registergericht
            </label>
            <input
              type="text"
              name="specialRegisterCourt"
              value={specialDetails.registerCourt || ""}
              onChange={(e) =>
                setSpecialDetails({ ...specialDetails, registerCourt: e.target.value })
              }
              placeholder="z. B. Amtsgericht München"
              className="w-full h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Stammkapital (in EUR)
            </label>
            <input
              type="number"
              name="specialShareCapital"
              value={specialDetails.shareCapital ?? ""}
              onChange={(e) =>
                setSpecialDetails({
                  ...specialDetails,
                  shareCapital: e.target.value ? Number(e.target.value) : null,
                })
              }
              placeholder="z. B. 25000"
              className="w-full h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Sterbedatum (bei Erbfall)
            </label>
            <input
              type="date"
              name="specialDeceasedDate"
              value={specialDetails.deceasedDate || ""}
              onChange={(e) =>
                setSpecialDetails({ ...specialDetails, deceasedDate: e.target.value })
              }
              className="w-full h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
            />
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="flex items-center justify-end gap-3 pt-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-5 py-2.5 text-sm font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
        >
          Abbrechen
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="px-6 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg shadow-xs transition flex items-center gap-2"
        >
          {isPending ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Akte wird in Urkundenrolle angelegt...</span>
            </>
          ) : (
            <span>Akte anlegen & Urkundenrolle eröffnen</span>
          )}
        </button>
      </div>
    </form>
  );
}
