"use client";

import { PORTFOLIO_DEMOS } from "@/lib/auth/demo";
import { useActionState, useState } from "react";
import { loginAction, demoLoginAction, AuthActionState } from "@/app/actions/auth";

const initialState: AuthActionState = {
  success: false,
};

interface LoginFormProps {
  allowDemoLogin?: boolean;
}

export function LoginForm({ allowDemoLogin = false }: LoginFormProps) {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [demoState, demoAction, demoPending] = useActionState(demoLoginAction, initialState);

  return (
    <div className="space-y-5">
      {allowDemoLogin && <form action={demoAction} className="space-y-2">
        <fieldset disabled={demoPending || isPending} className="space-y-2">
          <legend className="text-sm font-semibold mb-2">Demo-Notariat auswählen</legend>
          {PORTFOLIO_DEMOS.map((demo, index) => <label key={demo.organizationId} className="flex items-start gap-3 rounded-lg border border-zinc-300 dark:border-zinc-700 p-3 cursor-pointer has-[:checked]:border-blue-700 has-[:checked]:bg-blue-50 dark:has-[:checked]:bg-blue-950/40">
            <input type="radio" name="demoOrganizationId" value={demo.organizationId} defaultChecked={index === 0} className="mt-1 accent-blue-800" />
            <span className="text-sm"><span className="block font-medium">{index === 0 ? "Demo-Notariat A" : "Demo-Notariat B"}</span><span className="text-xs text-zinc-500 dark:text-zinc-400">Eigene Akten · Fiktive Daten</span></span>
          </label>)}
        </fieldset>
        <button disabled={demoPending || isPending} type="submit" className="w-full px-3 py-3 rounded-lg bg-blue-800 text-white dark:bg-blue-600 font-semibold disabled:opacity-50">{demoPending ? "Demo wird geöffnet …" : "Demo-Zugang verwenden"}</button>
        <p className="text-xs text-zinc-500">Ohne Passwort · Zwei getrennte Mandanten. Zum Vergleich abmelden und das andere Notariat wählen.</p>
        {demoState.message && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{demoState.message}</p>}
      </form>}
      <form action={formAction} className="space-y-4 font-sans">
      {/* Error Banner */}
      {!state.success && state.message && (
        <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-sm text-rose-800 dark:text-rose-200">
          <span className="font-bold">[Fehler] </span>
          {state.message}
        </div>
      )}

      {/* Email Input */}
      <div>
        <label
          htmlFor="email"
          className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1"
        >
          Dienstliche E-Mail-Adresse *
        </label>
        <input
          type="email"
          id="email"
          name="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@notariat.de"
          className="w-full h-9 px-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm font-sans focus:border-zinc-500 transition"
        />
        {state.errors?.email && (
          <p className="text-xs text-rose-600 font-sans mt-1">{state.errors.email}</p>
        )}
      </div>

      {/* Password Input */}
      <div>
        <label
          htmlFor="password"
          className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1"
        >
          Passwort *
        </label>
        <input
          type="password"
          id="password"
          name="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••••••"
          className="w-full h-9 px-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm font-sans focus:border-zinc-500 transition"
        />
        {state.errors?.password && (
          <p className="text-xs text-rose-600 font-sans mt-1">{state.errors.password}</p>
        )}
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isPending || demoPending}
        className="w-full py-2 px-3 rounded-lg bg-blue-800 hover:bg-blue-900 dark:bg-blue-600 dark:text-white dark:hover:bg-blue-500 text-white text-sm font-sans font-medium  transition-colors duration-150 flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {isPending ? (
          <>
            <span className="w-3.5 h-3.5 border-2 border-white dark:border-zinc-950 border-t-transparent rounded animate-spin" />
            <span>Wird angemeldet...</span>
          </>
        ) : (
          <span>Anmelden →</span>
        )}
      </button>
    </form>
    </div>
  );
}
