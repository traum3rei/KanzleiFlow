export function WorkspaceSkeleton({ kind = "overview" }: { kind?: "overview" | "cases" | "detail" | "form" | "configurator" }) {
  return <main aria-busy="true" aria-label="Inhalt wird geladen" className={`flex-1 ${kind === "form" ? "max-w-4xl" : "max-w-7xl"} w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6`}>
    <div className="h-8 w-64 max-w-full rounded-lg bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
    <div className="h-4 w-80 max-w-full rounded bg-zinc-100 dark:bg-zinc-900 animate-pulse" />
    {kind === "overview" && <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[0,1,2,3].map((n) => <div key={n} className="h-28 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950" />)}</div>}
    {kind === "configurator" && <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">{[0,1,2,3,4,5].map((n) => <div key={n} className="h-10 rounded-lg bg-zinc-100 dark:bg-zinc-900" />)}</div>}
    <div className={`rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 space-y-5 ${kind === "form" ? "max-w-4xl" : ""}`}>
      {Array.from({length: kind === "cases" ? 8 : 4}, (_, n) => <div key={n} className="h-10 rounded-lg bg-zinc-100 dark:bg-zinc-900 animate-pulse" />)}
    </div>
  </main>;
}
