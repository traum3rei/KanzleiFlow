"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { TenantContext } from "@/lib/auth/tenant";
import { logoutAction, switchOrganizationAction } from "@/app/actions/auth";

interface NavigationProps {
  dbConnected: boolean;
  tenant?: TenantContext;
}

function formatRoleLabel(role?: string): string {
  switch (role) {
    case "NOTARY":
      return "Notar/in";
    case "CANDIDATE_NOTARY":
      return "Notarassessor/in";
    case "CLERK":
      return "Sachbearbeitung";
    case "ADMIN":
      return "Bürovorsteher";
    case "VIEWER":
      return "Lesezugriff";
    default:
      return role || "Benutzer";
  }
}

export function Navigation({ dbConnected, tenant }: NavigationProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const navItems = [
    { href: "/", label: "Übersicht" },
    { href: "/cases", label: "Aktenverwaltung" },
    { href: "/cases/new", label: "+ Neue Akte" },
  ];

  const handleOrgSwitch = (orgId: string) => {
    setOrgDropdownOpen(false);
    startTransition(async () => {
      await switchOrganizationAction(orgId);
      window.location.reload();
    });
  };

  const handleLogout = () => {
    startTransition(async () => {
      await logoutAction();
    });
  };

  const userInitials = tenant?.userName
    ? tenant.userName
        .split(" ")
        .map((p) => p[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "JW";

  const hasMultipleOrgs = (tenant?.availableOrganizations?.length || 0) > 1;

  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 sticky top-0 z-40 font-sans tracking-tight">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16 gap-2">
          {/* Brand & Desktop Nav */}
          <div className="flex items-center space-x-3 sm:space-x-6 min-w-0">
            <Link href="/" prefetch={true} className="flex items-center space-x-2.5 group shrink-0">
              <div className="w-9 h-9 rounded-lg bg-blue-800 dark:bg-blue-600 flex items-center justify-center text-white dark:text-white font-bold text-sm">
                KF
              </div>
              <div className="min-w-0">
                <span className="text-sm font-bold tracking-tight text-zinc-900 dark:text-white block leading-tight">
                  KanzleiFlow
                </span>
                <span className="block text-xs text-zinc-500 dark:text-zinc-400 font-sans truncate max-w-[200px]">
                  Demo-Version<span className="hidden sm:inline"> · {tenant?.organizationName || "Fiktive Organisation"}</span>
                </span>
              </div>
            </Link>

            <nav aria-label="Hauptnavigation" className="hidden md:flex space-x-1 pl-4 border-l border-zinc-200 dark:border-zinc-800">
              {navItems.map((item) => {
                const isActive = pathname === item.href || (item.href === "/cases" && pathname.startsWith("/cases/") && pathname !== "/cases/new");
                return (
                  <Link
                    key={item.href}
                    aria-current={isActive ? "page" : undefined}
                    href={item.href}
                    prefetch={true}
                    className={`px-3 py-2 rounded-lg text-sm font-sans transition-colors whitespace-nowrap ${
                      isActive
                        ? "bg-blue-50 dark:bg-blue-950 text-blue-900 dark:text-blue-200 font-semibold"
                        : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-50 dark:hover:bg-zinc-900"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right Action Bar */}
          <div className="flex items-center space-x-2 sm:space-x-3 shrink-0">
            {/* Database Status Indicator */}
            <div
              className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-sans border ${
                dbConnected
                  ? "bg-zinc-50 text-zinc-800 border-zinc-300 dark:bg-zinc-900 dark:text-zinc-200 dark:border-zinc-700"
                  : "bg-zinc-50 text-zinc-600 border-zinc-300 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-800"
              }`}
              title={
                dbConnected
                  ? "Verbindung zur Demo-Datenbank aktiv"
                  : "Vorschau-Modus"
              }
            >
              <span
                className={`w-1.5 h-1.5 rounded-[1px] mr-1.5 shrink-0 ${
                  dbConnected ? "bg-emerald-500" : "bg-amber-500"
                }`}
              />
              <span className="hidden sm:inline">
                {dbConnected ? "Verbunden" : "Vorschau"}
              </span>
              <span className="sm:hidden">
                {dbConnected ? "DB" : "Demo"}
              </span>
            </div>

            {/* Organization Switcher (if user belongs to multiple notariats) */}
            {hasMultipleOrgs && (
              <div className="relative">
                <button
                  type="button"
                  aria-expanded={orgDropdownOpen}
                  aria-controls="organization-options"
                  onKeyDown={(event) => { if (event.key === "Escape") setOrgDropdownOpen(false); }}
                  onClick={() => setOrgDropdownOpen(!orgDropdownOpen)}
                  className="px-2 py-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm font-sans text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-1.5  transition-colors duration-150"
                >
                  <span className="truncate max-w-[120px]">{tenant?.organizationName}</span>
                  <svg className="w-3 h-3 text-zinc-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {orgDropdownOpen && (
                  <div id="organization-options" className="absolute right-0 mt-1 w-64 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-lg shadow-lg p-1.5 space-y-1 z-50 animate-in fade-in">
                    <span className="text-xs font-bold  text-zinc-400 px-2 py-1 block">
                      Notariat wechseln:
                    </span>
                    {tenant?.availableOrganizations?.map((org) => (
                      <button
                        key={org.id}
                        type="button"
                        onClick={() => handleOrgSwitch(org.id)}
                        disabled={isPending || org.id === tenant.organizationId}
                        className={`w-full text-left px-2 py-1.5 rounded-lg text-sm font-sans flex items-center justify-between transition ${
                          org.id === tenant.organizationId
                            ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-950 dark:text-white font-bold"
                            : "hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                        }`}
                      >
                        <span className="truncate">{org.name}</span>
                        {org.id === tenant.organizationId && <span className="text-xs font-bold">[Aktiv]</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* User profile & Logout */}
            <div className="flex items-center space-x-2 pl-2 border-l border-zinc-200 dark:border-zinc-800">
              <div
                className="w-7 h-7 rounded-lg bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 flex items-center justify-center text-sm font-sans font-bold shrink-0"
                title={`${tenant?.userName || "Benutzer"} (${formatRoleLabel(tenant?.userRole)})`}
              >
                {userInitials}
              </div>
              <div className="hidden lg:block text-left">
                <p className="text-sm font-sans font-medium text-zinc-900 dark:text-white leading-tight truncate max-w-[130px]">
                  {tenant?.userName || "Dr. J. Weiss"}
                </p>
                <p className="text-xs font-sans text-zinc-500 dark:text-zinc-400">
                  {tenant?.isDemoMode ? "Demo-Modus" : formatRoleLabel(tenant?.userRole)}
                </p>
              </div>

              {/* Logout Button */}
              <button
                type="button"
                onClick={handleLogout}
                disabled={isPending}
                title="Abmelden"
                className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 hover:border-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900  transition-colors duration-150 text-sm"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>

            {/* Mobile Menu Toggle Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              type="button"
              className="md:hidden p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900  transition-colors duration-150"
              aria-label={mobileMenuOpen ? "Menü schließen" : "Menü öffnen"}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-navigation"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <nav id="mobile-navigation" className="md:hidden py-2 border-t border-zinc-200 dark:border-zinc-800 space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href || (item.href === "/cases" && pathname.startsWith("/cases/") && pathname !== "/cases/new");
              return (
                <Link
                  key={item.href}
                    aria-current={isActive ? "page" : undefined}
                  href={item.href}
                  prefetch={true}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block px-3 py-1.5 rounded-lg text-sm font-sans transition ${
                    isActive
                      ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white font-semibold"
                      : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        )}
      </div>
    </header>
  );
}
