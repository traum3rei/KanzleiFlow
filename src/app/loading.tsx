export default function RootLoading() {
  return (
    <div className="app-shell min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col font-sans tracking-tight">
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 sticky top-0 z-40 h-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex justify-between items-center">
          <div className="flex items-center space-x-3 sm:space-x-6">
            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 rounded-lg bg-blue-800 dark:bg-blue-600 flex items-center justify-center text-white dark:text-white font-bold text-sm">
                §
              </div>
              <span className="text-sm font-bold tracking-tight text-zinc-900 dark:text-white">
                KanzleiFlow
              </span>
            </div>
            <div className="hidden md:flex space-x-2 pl-4 border-l border-zinc-200 dark:border-zinc-800 text-sm text-zinc-400">
              <span className="px-2.5 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white font-semibold rounded-lg">Übersicht</span>
              <span className="px-2.5 py-1">Aktenverwaltung</span>
              <span className="px-2.5 py-1">+ Neue Akte</span>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <div className="h-5 w-24 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
            <div className="w-7 h-7 bg-zinc-200 dark:bg-zinc-800 rounded-lg animate-pulse" />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex justify-between items-center pb-4 border-b border-zinc-200 dark:border-zinc-800">
          <div className="h-6 w-48 bg-zinc-200 dark:bg-zinc-800 rounded-lg animate-pulse" />
          <div className="h-8 w-36 bg-zinc-100 dark:bg-zinc-900 rounded-lg animate-pulse" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="h-24 bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 animate-pulse" />
          <div className="h-24 bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 animate-pulse" />
          <div className="h-24 bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 animate-pulse" />
          <div className="h-24 bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 animate-pulse" />
        </div>

        <div className="h-64 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 animate-pulse" />
      </main>
    </div>
  );
}
