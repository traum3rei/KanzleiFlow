import { cache } from "react";
import { PORTFOLIO_DEMO, isDemoLoginEnabled } from "./demo";
/**
 * ============================================================================
 * KanzleiFlow Multi-Tenant Isolation & Authorization Layer
 * ============================================================================
 * 
 * SECURITY ARCHITECTURE & SUPABASE RLS NOTICE:
 * 
 * 1. Database Connection & RLS Bypass:
 *    When Prisma connects to PostgreSQL, the connecting database role (e.g. `neondb_owner`
 *    or `postgres`) has the `BYPASSRLS` attribute.
 *    THIS MEANS PRISMA QUERIES BY DEFAULT BYPASS ROW LEVEL SECURITY (RLS)!
 * 
 * 2. Mandatory Application-Level Multi-Tenant Isolation:
 *    Because the database connection role bypasses RLS, the application layer
 *    is strictly responsible for enforcing tenant isolation on EVERY database operation:
 *    - Tenant identity MUST NEVER be trusted from client-controlled input (URL params,
 *      POST body, headers, or hidden form fields).
 *    - All database queries MUST explicitly include `organizationId: tenant.organizationId`
 *      in their WHERE clauses.
 *    - All lookups MUST verify tenant ownership using `assertTenantOwnership()`.
 *    - In production, unauthenticated requests MUST be rejected immediately.
 *    - In production, no hardcoded demo identity is EVER accepted.
 */

import { getPrismaClient } from "@/lib/db";
import {
  getAuthenticatedSession,
  getActiveOrgCookie,
  extractBearerToken,
  getSessionFromBearerToken,
  SessionPayload,
} from "./session";

export class AuthenticationRequiredError extends Error {
  constructor(message = "Authentifizierung erforderlich. Bitte melden Sie sich an.") {
    super(message);
    this.name = "AuthenticationRequiredError";
  }
}

export class TenantIsolationError extends Error {
  constructor(message = "Mandanten-Isolation verletzt: Zugriff auf fremde Kanzleidaten verweigert.") {
    super(message);
    this.name = "TenantIsolationError";
  }
}

export class NoOrganizationMembershipError extends Error {
  constructor(message = "Der authentifizierte Benutzer ist keinem Notariat zugeordnet.") {
    super(message);
    this.name = "NoOrganizationMembershipError";
  }
}

export class SessionExpiredError extends Error {
  constructor(message = "Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.") {
    super(message);
    this.name = "SessionExpiredError";
  }
}

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  jurisdiction: string;
  role: "NOTARY" | "CANDIDATE_NOTARY" | "CLERK" | "ADMIN" | "VIEWER";
}

export interface TenantContext {
  organizationId: string;
  organizationSlug: string;
  organizationName: string;
  jurisdiction: string;
  userId: string;
  userEmail: string;
  userName: string;
  userRole: "NOTARY" | "CANDIDATE_NOTARY" | "CLERK" | "ADMIN" | "VIEWER";
  isDemoMode?: boolean;
  availableOrganizations?: OrganizationSummary[];
}

// Default demonstration notary office (fictional) for development preview only
export const DEMO_NOTARIAT_CONTEXT: TenantContext = {
  organizationId: "org_notariat_weiss_01",
  organizationSlug: "notariat-weiss-partner",
  organizationName: "Notariat Dr. Johannes Weiss & Partner",
  jurisdiction: "DE-BY", // Bayern
  userId: "usr_notary_weiss_01",
  userEmail: "j.weiss@notariat-weiss-partner.de",
  userName: "Dr. Johannes Weiss (Notar)",
  userRole: "NOTARY",
  isDemoMode: true,
};

/**
 * Checks if the current runtime environment is production.
 */
export function isProductionEnvironment(): boolean {
  return (
    process.env.APP_ENV === "production" ||
    (process.env.NODE_ENV === "production" && process.env.APP_ENV !== "development") ||
    process.env.VERCEL_ENV === "production"
  );
}

/**
 * Resolves verified TenantContext for an authenticated session.
 * Enforces PostgreSQL organization membership checks.
 */
export async function resolveTenantContextFromUser(
  session: SessionPayload,
  requestedOrgId?: string | null
): Promise<TenantContext> {
  const prisma = getPrismaClient();
  if (session.demoOrganizationId && (!isDemoLoginEnabled() || session.demoOrganizationId !== PORTFOLIO_DEMO.organizationId || session.userId !== PORTFOLIO_DEMO.userId || (requestedOrgId && requestedOrgId !== PORTFOLIO_DEMO.organizationId))) {
    throw new AuthenticationRequiredError("Demo-Zugriff verweigert.");
  }

  if (prisma) {
    // 1. Fetch user and their organization memberships from PostgreSQL by userId
    let memberships = await prisma.organizationMember.findMany({
      where: {
        userId: session.userId,
      },
      include: {
        organization: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    // 1b. If no memberships found by userId, fallback to looking up by email
    // (links Supabase Auth users to provisioned database records if UUIDs differed)
    if ((!memberships || memberships.length === 0) && session.email) {
      const userByEmail = await prisma.user.findUnique({
        where: { email: session.email },
        include: {
          memberships: {
            include: { organization: true },
            orderBy: { createdAt: "asc" },
          },
        },
      });

      if (userByEmail && userByEmail.memberships && userByEmail.memberships.length > 0) {
        memberships = userByEmail.memberships;
      }
    }

    if (!memberships || memberships.length === 0) {
      throw new NoOrganizationMembershipError(
        `Der Benutzer '${session.email}' (${session.userId}) besitzt keine aktive Notariats-Mitgliedschaft.`
      );
    }

    if (session.demoOrganizationId) {
      memberships = memberships.filter((membership) => membership.organizationId === PORTFOLIO_DEMO.organizationId && membership.role === "CLERK");
      if (memberships.length !== 1) throw new AuthenticationRequiredError("Demo-Mitgliedschaft nicht verfügbar.");
    }
    // 2. Select active organization: requestedOrgId (if member) or default to first membership
    let selectedMembership = memberships[0];
    if (requestedOrgId) {
      const match = memberships.find((m) => m.organizationId === requestedOrgId);
      if (match) {
        selectedMembership = match;
      }
    }

    const availableOrganizations: OrganizationSummary[] = memberships.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      slug: m.organization.slug,
      jurisdiction: m.organization.jurisdiction,
      role: m.role as "NOTARY" | "CANDIDATE_NOTARY" | "CLERK" | "ADMIN" | "VIEWER",
    }));

    return {
      organizationId: selectedMembership.organization.id,
      organizationSlug: selectedMembership.organization.slug,
      organizationName: selectedMembership.organization.name,
      jurisdiction: selectedMembership.organization.jurisdiction,
      userId: session.userId,
      userEmail: session.email,
      userName: session.fullName,
      userRole: selectedMembership.role as "NOTARY" | "CANDIDATE_NOTARY" | "CLERK" | "ADMIN" | "VIEWER",
      isDemoMode: Boolean(session.demoOrganizationId),
      availableOrganizations,
    };
  }

  if (session.demoOrganizationId) throw new AuthenticationRequiredError("Demo-Datenbank nicht verfügbar.");

  // Strictly disallow fallback in production environments
  if (isProductionEnvironment()) {
    throw new AuthenticationRequiredError(
      "Datenbankverbindung nicht verfügbar. Zugriff verweigert."
    );
  }

  // Fallback for tests or environments without database
  return {
    organizationId: requestedOrgId || "org_notariat_weiss_01",
    organizationSlug: "notariat-weiss-partner",
    organizationName: "Notariat Dr. Johannes Weiss & Partner",
    jurisdiction: "DE-BY",
    userId: session.userId,
    userEmail: session.email,
    userName: session.fullName,
    userRole: "NOTARY",
    isDemoMode: false,
  };
}

/**
 * Server-side tenant resolver.
 * Never trusts a tenant ID or organization ID sent by the browser.
 *
 * Rules:
 * - In production: strictly requires a verified authenticated session. Throws AuthenticationRequiredError if missing.
 * - In development: uses session if present; if unauthenticated, falls back to DEMO_NOTARIAT_CONTEXT unless disabled.
 */
export const getTenantContext = cache(async (): Promise<TenantContext> => {
  const isProd = isProductionEnvironment();

  let session: SessionPayload | null = null;
  let activeOrgId: string | null = null;

  try {
    session = await getAuthenticatedSession();
    activeOrgId = await getActiveOrgCookie();
  } catch {
    // Outside of Next.js HTTP request scope (e.g. direct function call or tests)
    session = null;
  }

  // 1. If an authenticated session exists, resolve their verified tenant context from DB
  if (session) {
    return resolveTenantContextFromUser(session, activeOrgId);
  }

  // 2. Unauthenticated request in production is strictly rejected
  if (isProd) {
    throw new AuthenticationRequiredError(
      "Authentifizierung erforderlich. In der Produktionsumgebung ist eine gültige Notariats-Anmeldung zwingend vorgeschrieben."
    );
  }

  // 3. In development preview mode, allow demo fallback if not explicitly forbidden
  if (process.env.ALLOW_DEMO_AUTH === "false" || process.env.REQUIRE_AUTH === "true") {
    throw new AuthenticationRequiredError(
      "Authentifizierung erforderlich. Der Demo-Modus wurde in dieser Umgebung deaktiviert."
    );
  }

  return DEMO_NOTARIAT_CONTEXT;
});

/**
 * Route protection helper: gets TenantContext or redirects to /login if unauthenticated.
 */
export async function getTenantContextOrRedirect(): Promise<TenantContext> {
  try {
    return await getTenantContext();
  } catch (err) {
    if (err instanceof AuthenticationRequiredError) {
      const { redirect } = await import("next/navigation");
      redirect("/login");
    }
    throw err;
  }
}

/**
 * Asserts that a given resource belongs to the current tenant organization.
 * Throws TenantIsolationError if there is any mismatch.
 */
export function assertTenantOwnership(
  param1: string | TenantContext,
  param2: string | TenantContext
): void {
  const entityOrgId = typeof param1 === "string" ? param1 : (param2 as string);
  const tenant = typeof param1 === "object" ? param1 : (param2 as TenantContext);

  if (!entityOrgId || !tenant || entityOrgId !== tenant.organizationId) {
    throw new TenantIsolationError(
      `Tenant Isolation Violation: Access denied to resource from foreign organization (${entityOrgId})`
    );
  }
}

/**
 * Resolves verified TenantContext for Microsoft Word Add-in API requests.
 * Checks for Authorization: Bearer <token> first, ensuring embedded WebViews
 * without cookie access authenticate seamlessly and securely.
 */
export async function getAddinTenantContext(req: Request): Promise<TenantContext> {
  const bearerToken = extractBearerToken(req);
  if (bearerToken) {
    const session = getSessionFromBearerToken(bearerToken);
    if (!session) {
      throw new AuthenticationRequiredError(
        "Ungültiger oder abgelaufener Authentifizierungs-Token für das Word Add-in. Bitte melden Sie sich erneut an."
      );
    }
    const requestedOrgId = req.headers.get("x-kanzleiflow-org-id");
    return resolveTenantContextFromUser(session, requestedOrgId);
  }

  // Fallback to standard cookie session
  return getTenantContext();
}
