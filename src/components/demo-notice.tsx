import Link from "next/link";

export function DemoNotice() {
  return <aside aria-label="Demo-Hinweis" className="border-b border-blue-100 bg-blue-50 px-4 py-2 text-xs text-blue-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-blue-200">
    <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <p><strong>Demo-Version</strong> · Nicht von juristischen Fachpersonen geprüft.</p>
      <Link href="/demo" prefetch={true} className="font-medium underline underline-offset-2">Funktionsumfang und Grenzen</Link>
    </div>
  </aside>;
}
