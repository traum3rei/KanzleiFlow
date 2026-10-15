export default function CasesLoading() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 flex flex-col">
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 h-16 animate-pulse" />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="h-8 w-48 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
        <div className="h-14 bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 animate-pulse" />
        <div className="bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
          <div className="h-6 w-full bg-slate-100 dark:bg-slate-900 rounded animate-pulse" />
          <div className="h-12 w-full bg-slate-100 dark:bg-slate-900 rounded animate-pulse" />
          <div className="h-12 w-full bg-slate-100 dark:bg-slate-900 rounded animate-pulse" />
          <div className="h-12 w-full bg-slate-100 dark:bg-slate-900 rounded animate-pulse" />
        </div>
      </main>
    </div>
  );
}
