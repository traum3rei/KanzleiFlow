import { connection } from "next/server";
import { isProductionEnvironment } from "@/lib/auth/tenant";
import { LoginForm } from "./login-form";

export const instant = false;

export default async function LoginPage() {
  await connection();
  const isProd = isProductionEnvironment() || process.env.ALLOW_DEMO_AUTH === "false";

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 flex flex-col justify-center items-center p-4 sm:p-6 font-mono tracking-tight text-zinc-900 dark:text-zinc-100">
      <div className="w-full max-w-sm bg-zinc-50 dark:bg-zinc-900 rounded-[4px] border border-zinc-300 dark:border-zinc-800 shadow-sm p-6 sm:p-7 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-9 h-9 rounded-[2px] bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 flex items-center justify-center text-lg font-bold mx-auto">
            §
          </div>
          <h1 className="text-sm font-bold tracking-tight text-zinc-900 dark:text-white uppercase pt-1">
            kanzleiflow anmeldung
          </h1>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            gesichertes notariats-portal • amtsbereich bayern
          </p>
        </div>

        {/* Form */}
        <LoginForm allowDemoLogin={!isProd} />

        {/* Security Footer Notice */}
        <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 text-center space-y-1">
          <p className="text-[10px] text-zinc-400">
            geschütztes system gem. § 203 StGB & DONot.
          </p>
          <p className="text-[10px] text-zinc-500 font-mono">
            multi-tenant isolation • supabase ssr
          </p>
        </div>
      </div>
    </div>
  );
}
