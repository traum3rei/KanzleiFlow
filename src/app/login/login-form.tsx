"use client";

import { useActionState, useState } from "react";
import { loginAction, AuthActionState } from "@/app/actions/auth";

const initialState: AuthActionState = {
  success: false,
};

interface LoginFormProps {
  allowDemoLogin?: boolean;
}

export function LoginForm({ allowDemoLogin = true }: LoginFormProps) {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const fillDemoCredentials = () => {
    setEmail("j.weiss@notariat-weiss-partner.de");
    setPassword("notar-geheim-2026");
  };

  return (
    <form action={formAction} className="space-y-4 font-sans">
      {/* Dev helper button (visible only in dev/demo mode) */}
      {allowDemoLogin && (
        <div className="p-2.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 flex items-center justify-between text-sm">
          <div>
            <span className="font-bold text-zinc-900 dark:text-zinc-100 block text-xs">
              Demo-Schnellanmeldung:
            </span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Dr. Johannes Weiss (Notar)
            </span>
          </div>
          <button
            type="button"
            onClick={fillDemoCredentials}
            className="px-2 py-0.5 rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 font-sans text-xs  transition-colors duration-150"
          >
            Ausfüllen
          </button>
        </div>
      )}

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
        disabled={isPending}
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
  );
}
