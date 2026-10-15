export default function RootLoading() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 flex flex-col">
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 h-16 animate-pulse" />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="h-8 w-48 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="h-28 bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 animate-pulse" />
          <div className="h-28 bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 animate-pulse" />
          <div className="h-28 bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 animate-pulse" />
          <div className="h-28 bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 animate-pulse" />
        </div>
        <div className="h-64 bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 animate-pulse" />
      </main>
    </div>
  );
}
