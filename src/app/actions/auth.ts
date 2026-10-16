"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getPrismaClient } from "@/lib/db";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  ACTIVE_ORG_COOKIE_NAME,
  SESSION_DURATION_MS,
  getSupabaseServerClient,
  getAuthenticatedSession,
} from "@/lib/auth/session";

const LoginSchema = z.object({
  email: z.string().email("Bitte geben Sie eine gültige E-Mail-Adresse ein."),
  password: z.string().min(6, "Das Passwort muss mindestens 6 Zeichen lang sein."),
});

export interface AuthActionState {
  success: boolean;
  message?: string;
  errors?: Record<string, string>;
}

/**
 * Server Action for authenticating users.
 * Supports Supabase Auth and verified database session cookies.
 */
export async function loginAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const emailRaw = formData.get("email");
  const passwordRaw = formData.get("password");

  const validation = LoginSchema.safeParse({
    email: emailRaw,
    password: passwordRaw,
  });

  if (!validation.success) {
    const errors: Record<string, string> = {};
    validation.error.issues.forEach((issue) => {
      errors[issue.path[0] as string] = issue.message;
    });
    return {
      success: false,
      message: "Ungültige Anmeldedaten.",
      errors,
    };
  }

  const { email, password } = validation.data;
  const cookieStore = await cookies();

  // 1. If Supabase Auth is configured, attempt authentication through Supabase
  const supabase = await getSupabaseServerClient();
  if (supabase) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return {
        success: false,
        message: `Supabase Auth Fehler: ${error.message}`,
      };
    }

    if (data.user) {
      // Set active org if present
      const prisma = getPrismaClient();
      if (prisma) {
        let membership = await prisma.organizationMember.findFirst({
          where: { userId: data.user.id },
        });
        if (!membership && data.user.email) {
          const u = await prisma.user.findUnique({
            where: { email: data.user.email },
            include: { memberships: true },
          });
          if (u && u.memberships.length > 0) {
            membership = u.memberships[0];
          }
        }
        if (membership) {
          cookieStore.set(ACTIVE_ORG_COOKIE_NAME, membership.organizationId, {
            httpOnly: true,
            sameSite: "lax",
            path: "/",
          });
        }
      }
      redirect("/cases");
    }
  }

  // Supabase success has already redirected above. Never turn an unverified
  // provider response into a locally signed session.
  if (supabase) return { success: false, message: "Anmeldung fehlgeschlagen. Bitte versuchen Sie es erneut." };
  const demoAllowed = process.env.ALLOW_DEMO_AUTH !== "false" && process.env.REQUIRE_AUTH !== "true";
  if (!demoAllowed || email.trim().toLowerCase() !== "j.weiss@notariat-weiss-partner.de" || password !== "notar-geheim-2026") {
    return { success: false, message: "Anmeldung fehlgeschlagen. Bitte prüfen Sie Ihre Zugangsdaten." };
  }

  // 2. Database verification (PostgreSQL)
  const prisma = getPrismaClient();
  if (prisma) {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        memberships: {
          include: {
            organization: true,
          },
        },
      },
    });

    if (!user) {
      return {
        success: false,
        message: "Kein Benutzerkonto mit dieser E-Mail-Adresse im Notariat registriert.",
      };
    }

    if (user.memberships.length === 0) {
      return {
        success: false,
        message: "Dieses Benutzerkonto ist derzeit keinem Notariat zugeordnet.",
      };
    }

    // In demo/dev mode without Supabase Auth server, verify against known test credentials
    // or standard secure development check
    const isProd = process.env.NODE_ENV === "production" || process.env.APP_ENV === "production";
    if (isProd && !supabase) {
      return {
        success: false,
        message: "In der Produktionsumgebung ist Supabase Auth erforderlich.",
      };
    }

    // Issue signed session cookie
    const token = createSessionToken({
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
    });

    cookieStore.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      path: "/",
      maxAge: Math.floor(SESSION_DURATION_MS / 1000),
    });

    // Set default active org
    cookieStore.set(ACTIVE_ORG_COOKIE_NAME, user.memberships[0].organizationId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: Math.floor(SESSION_DURATION_MS / 1000),
    });

    redirect("/cases");
  }

  return {
    success: false,
    message: "Datenbankverbindung nicht verfügbar.",
  };
}

/**
 * Server Action for signing out.
 */
export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();

  const supabase = await getSupabaseServerClient();
  if (supabase) {
    await supabase.auth.signOut().catch(() => {});
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
  cookieStore.delete(ACTIVE_ORG_COOKIE_NAME);

  redirect("/login");
}

/**
 * Server Action for switching the active organization context.
 */
export async function switchOrganizationAction(orgId: string): Promise<{ success: boolean; message?: string }> {
  const session = await getAuthenticatedSession();
  if (!session) {
    return { success: false, message: "Nicht authentifiziert." };
  }

  const prisma = getPrismaClient();
  if (prisma) {
    let membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: session.userId,
        },
      },
    });

    if (!membership && session.email) {
      const u = await prisma.user.findUnique({
        where: { email: session.email },
      });
      if (u) {
        membership = await prisma.organizationMember.findUnique({
          where: {
            organizationId_userId: {
              organizationId: orgId,
              userId: u.id,
            },
          },
        });
      }
    }

    if (!membership) {
      return {
        success: false,
        message: "Zugriff verweigert: Sie sind kein Mitglied dieser Organisation.",
      };
    }
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORG_COOKIE_NAME, orgId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_DURATION_MS / 1000),
  });

  return { success: true };
}
