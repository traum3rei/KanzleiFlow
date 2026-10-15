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

export function Navigation({ dbConnected, tenant }: NavigationProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const navItems = [
    { href: "/", label: "übersicht" },
    { href: "/cases", label: "aktenverwaltung" },
    { href: "/cases/new", label: "+ neue akte" },
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
    <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 sticky top-0 z-40 font-mono tracking-tight">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-14 gap-2">
          {/* Brand & Desktop Nav */}
          <div className="flex items-center space-x-3 sm:space-x-6 min-w-0">
            <Link href="/" className="flex items-center space-x-2.5 group shrink-0">
              <div className="w-7 h-7 rounded-[4px] bg-zinc-900 dark:bg-zinc-100 flex items-center justify-center text-white dark:text-zinc-950 font-bold text-sm">
                §
              </div>
              <div className="min-w-0">
                <span className="text-sm font-bold tracking-tight text-zinc-900 dark:text-white block leading-tight">
                  kanzleiflow
                </span>
                <span className="hidden sm:block text-[10px] text-zinc-500 dark:text-zinc-400 font-mono truncate max-w-[200px]">
                  {tenant?.organizationName || "notariat schwabing"}
                </span>
              </div>
            </Link>

            <nav className="hidden md:flex space-x-1 pl-4 border-l border-zinc-200 dark:border-zinc-800">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-2.5 py-1 rounded-[4px] text-xs font-mono transition-colors whitespace-nowrap ${
                      isActive
                        ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-950 dark:text-white font-semibold"
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
              className={`inline-flex items-center px-2 py-0.5 rounded-[4px] text-[11px] font-mono border ${
                dbConnected
                  ? "bg-zinc-50 text-zinc-800 border-zinc-300 dark:bg-zinc-900 dark:text-zinc-200 dark:border-zinc-700"
                  : "bg-zinc-50 text-zinc-600 border-zinc-300 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-800"
              }`}
              title={
                dbConnected
                  ? "Live PostgreSQL Verbindung aktiv"
                  : "Vorschau-Modus"
              }
            >
              <span
                className={`w-1.5 h-1.5 rounded-[1px] mr-1.5 shrink-0 ${
                  dbConnected ? "bg-emerald-500" : "bg-amber-500"
                }`}
              />
              <span className="hidden sm:inline">
                {dbConnected ? "live postgres" : "vorschau"}
              </span>
              <span className="sm:hidden">
                {dbConnected ? "live" : "demo"}
              </span>
            </div>

            {/* Organization Switcher (if user belongs to multiple notariats) */}
            {hasMultipleOrgs && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setOrgDropdownOpen(!orgDropdownOpen)}
                  className="px-2 py-1 rounded-[4px] border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-mono text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-1.5 active:scale-[0.98] transition-transform duration-150"
                >
                  <span className="truncate max-w-[120px]">{tenant?.organizationName}</span>
                  <svg className="w-3 h-3 text-zinc-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {orgDropdownOpen && (
                  <div className="absolute right-0 mt-1 w-64 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-[4px] shadow-lg p-1.5 space-y-1 z-50 animate-in fade-in">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 px-2 py-1 block">
                      notariat wechseln:
                    </span>
                    {tenant?.availableOrganizations?.map((org) => (
                      <button
                        key={org.id}
                        type="button"
                        onClick={() => handleOrgSwitch(org.id)}
                        disabled={isPending || org.id === tenant.organizationId}
                        className={`w-full text-left px-2 py-1.5 rounded-[4px] text-xs font-mono flex items-center justify-between transition ${
                          org.id === tenant.organizationId
                            ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-950 dark:text-white font-bold"
                            : "hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                        }`}
                      >
                        <span className="truncate">{org.name}</span>
                        {org.id === tenant.organizationId && <span className="text-[10px]">[aktiv]</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* User profile & Logout */}
            <div className="flex items-center space-x-2 pl-2 border-l border-zinc-200 dark:border-zinc-800">
              <div
                className="w-7 h-7 rounded-[4px] bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 flex items-center justify-center text-xs font-mono font-bold shrink-0"
                title={`${tenant?.userName || "Benutzer"} (${tenant?.userRole || "NOTARY"})`}
              >
                {userInitials}
              </div>
              <div className="hidden lg:block text-left">
                <p className="text-xs font-mono font-medium text-zinc-900 dark:text-white leading-tight truncate max-w-[130px]">
                  {tenant?.userName || "Dr. J. Weiss"}
                </p>
                <p className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400">
                  {tenant?.isDemoMode ? "demo-modus" : (tenant?.userRole || "notary").toLowerCase()}
                </p>
              </div>

              {/* Logout Button */}
              <button
                type="button"
                onClick={handleLogout}
                disabled={isPending}
                title="Abmelden"
                className="p-1.5 rounded-[4px] border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 hover:border-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 active:scale-[0.98] transition-transform duration-150 text-xs"
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
              className="md:hidden p-1.5 rounded-[4px] border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 active:scale-[0.98] transition-transform duration-150"
              aria-label="Menü öffnen"
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
          <nav className="md:hidden py-2 border-t border-zinc-200 dark:border-zinc-800 space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block px-3 py-1.5 rounded-[4px] text-xs font-mono transition ${
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
