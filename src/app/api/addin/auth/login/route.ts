import { NextResponse } from "next/server";
import {
  createSessionToken,
  SESSION_DURATION_MS,
} from "@/lib/auth/session";
import {
  resolveTenantContextFromUser,
  isProductionEnvironment,
  DEMO_NOTARIAT_CONTEXT,
} from "@/lib/auth/tenant";
import { getPrismaClient } from "@/lib/db";

export const instant = false;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password, orgId } = body;

    if (!email || !password) {
      return NextResponse.json(
        {
          success: false,
          error: "VALIDATION_ERROR",
          message: "E-Mail-Adresse und Passwort sind erforderlich.",
        },
        { status: 400 }
      );
    }

    const trimmedEmail = String(email).trim().toLowerCase();
    const isProd = isProductionEnvironment() || process.env.ALLOW_DEMO_AUTH === "false";

    // 1. Check Demo Credentials if permitted
    const isDemoAccount =
      trimmedEmail === "j.weiss@notariat-weiss-partner.de" &&
      password === "notar-geheim-2026";

    let authenticatedUserId: string | null = null;
    let authenticatedFullName = "Dr. Johannes Weiss (Notar)";

    if (isDemoAccount && !isProd) {
      authenticatedUserId = DEMO_NOTARIAT_CONTEXT.userId;
      authenticatedFullName = DEMO_NOTARIAT_CONTEXT.userName;
    } else {
      // 2. Check Supabase Auth if configured
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (supabaseUrl && supabaseAnonKey) {
        try {
          const { createClient } = await import("@supabase/supabase-js");
          const supabase = createClient(supabaseUrl, supabaseAnonKey, {
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const { data, error } = await supabase.auth.signInWithPassword({
            email: trimmedEmail,
            password,
          });
          if (!error && data.user) {
            authenticatedUserId = data.user.id;
            authenticatedFullName = data.user.user_metadata?.full_name || trimmedEmail;
          }
        } catch {
          // Supabase auth unreachable or error
        }
      }

      // 3. Fallback database user check for dev / test mode with valid test credentials
      if (!authenticatedUserId && !isProd && password === "notar-geheim-2026") {
        const prisma = getPrismaClient();
        if (prisma) {
          const user = await prisma.user.findUnique({
            where: { email: trimmedEmail },
            include: {
              memberships: {
                include: { organization: true },
              },
            },
          });

          if (user && user.memberships.length > 0) {
            authenticatedUserId = user.id;
            authenticatedFullName = user.fullName;
          }
        }
      }
    }

    if (!authenticatedUserId) {
      return NextResponse.json(
        {
          success: false,
          error: "INVALID_CREDENTIALS",
          message: "Ungültige Anmeldedaten. Bitte überprüfen Sie E-Mail und Passwort.",
        },
        { status: 401 }
      );
    }

    // 3. Issue cryptographically signed token
    const token = createSessionToken(
      {
        userId: authenticatedUserId,
        email: trimmedEmail,
        fullName: authenticatedFullName,
      },
      SESSION_DURATION_MS
    );

    // 4. Resolve tenant context for the user
    const tenant = await resolveTenantContextFromUser(
      {
        userId: authenticatedUserId,
        email: trimmedEmail,
        fullName: authenticatedFullName,
        issuedAt: Date.now(),
        expiresAt: Date.now() + SESSION_DURATION_MS,
      },
      orgId
    );

    return NextResponse.json({
      success: true,
      token,
      tenant: {
        organizationId: tenant.organizationId,
        organizationName: tenant.organizationName,
        organizationSlug: tenant.organizationSlug,
        jurisdiction: tenant.jurisdiction,
        userId: tenant.userId,
        userName: tenant.userName,
        userEmail: tenant.userEmail,
        userRole: tenant.userRole,
        availableOrganizations: tenant.availableOrganizations || [],
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Interner Serverfehler.";
    return NextResponse.json(
      {
        success: false,
        error: "AUTH_ERROR",
        message,
      },
      { status: 500 }
    );
  }
}
