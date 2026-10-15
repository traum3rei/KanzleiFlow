import React from "react";

export default function Loading() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 flex flex-col font-sans animate-pulse">
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 h-16 w-full" />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="h-4 w-48 bg-slate-200 dark:bg-slate-800 rounded" />

        {/* Case Header Card Skeleton */}
        <div className="bg-white dark:bg-slate-950 p-6 sm:p-7 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-6">
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="h-6 w-28 bg-slate-200 dark:bg-slate-800 rounded" />
              <div className="h-6 w-24 bg-slate-200 dark:bg-slate-800 rounded" />
            </div>
            <div className="h-8 w-96 max-w-full bg-slate-200 dark:bg-slate-800 rounded" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-5 border-t border-slate-100 dark:border-slate-800">
            <div className="h-16 bg-slate-100 dark:bg-slate-900 rounded-lg" />
            <div className="h-16 bg-slate-100 dark:bg-slate-900 rounded-lg" />
            <div className="h-16 bg-slate-100 dark:bg-slate-900 rounded-lg" />
            <div className="h-16 bg-slate-100 dark:bg-slate-900 rounded-lg" />
          </div>
        </div>

        {/* Content Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="h-32 bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 p-6" />
            <div className="h-64 bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 p-6" />
          </div>
          <div className="space-y-6">
            <div className="h-48 bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 p-6" />
            <div className="h-48 bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 p-6" />
          </div>
        </div>
      </main>
    </div>
  );
}
