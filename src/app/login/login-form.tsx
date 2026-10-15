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
    <form action={formAction} className="space-y-4 font-mono">
      {/* Dev helper button (visible only in dev/demo mode) */}
      {allowDemoLogin && (
        <div className="p-2.5 rounded-[4px] bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 flex items-center justify-between text-xs">
          <div>
            <span className="font-bold text-zinc-900 dark:text-zinc-100 block text-[11px]">
              demo-schnellanmeldung:
            </span>
            <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
              Dr. Johannes Weiss (Notar)
            </span>
          </div>
          <button
            type="button"
            onClick={fillDemoCredentials}
            className="px-2 py-0.5 rounded-[2px] bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 font-mono text-[10px] active:scale-[0.98] transition-transform duration-150"
          >
            ausfüllen
          </button>
        </div>
      )}

      {/* Error Banner */}
      {!state.success && state.message && (
        <div className="p-2.5 rounded-[4px] bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-200">
          <span className="font-bold">[fehler] </span>
          {state.message}
        </div>
      )}

      {/* Email Input */}
      <div>
        <label
          htmlFor="email"
          className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1"
        >
          dienstliche e-mail-adresse *
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
          className="w-full h-9 px-3 rounded-[4px] border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-xs font-mono focus:border-zinc-500 transition"
        />
        {state.errors?.email && (
          <p className="text-[11px] text-rose-600 font-mono mt-1">{state.errors.email}</p>
        )}
      </div>

      {/* Password Input */}
      <div>
        <label
          htmlFor="password"
          className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1"
        >
          passwort *
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
          className="w-full h-9 px-3 rounded-[4px] border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-xs font-mono focus:border-zinc-500 transition"
        />
        {state.errors?.password && (
          <p className="text-[11px] text-rose-600 font-mono mt-1">{state.errors.password}</p>
        )}
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isPending}
        className="w-full py-2 px-3 rounded-[4px] bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200 text-white text-xs font-mono font-medium active:scale-[0.98] transition-transform duration-150 flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {isPending ? (
          <>
            <span className="w-3.5 h-3.5 border-2 border-white dark:border-zinc-950 border-t-transparent rounded-[2px] animate-spin" />
            <span>anmelden...</span>
          </>
        ) : (
          <span>anmelden →</span>
        )}
      </button>
    </form>
  );
}
