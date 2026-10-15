import crypto from "crypto";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export interface SessionPayload {
  userId: string;
  email: string;
  fullName: string;
  issuedAt: number;
  expiresAt: number;
}

export const SESSION_COOKIE_NAME = "kanzleiflow_session";
export const ACTIVE_ORG_COOKIE_NAME = "kanzleiflow_active_org_id";

// Session valid for 8 hours (typical work shift in a notary office)
export const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

function getSessionSecret(): string {
  return (
    process.env.SESSION_SECRET ||
    process.env.SUPABASE_JWT_SECRET ||
    "kanzleiflow-secure-notary-session-secret-key-2026-strict"
  );
}

/**
 * Creates a cryptographically signed session token using HMAC-SHA256.
 */
export function createSessionToken(payload: Omit<SessionPayload, "issuedAt" | "expiresAt">, durationMs = SESSION_DURATION_MS): string {
  const now = Date.now();
  const fullPayload: SessionPayload = {
    ...payload,
    issuedAt: now,
    expiresAt: now + durationMs,
  };

  const payloadBase64 = Buffer.from(JSON.stringify(fullPayload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", getSessionSecret())
    .update(payloadBase64)
    .digest("base64url");

  return `${payloadBase64}.${signature}`;
}

/**
 * Verifies and decodes a signed session token.
 * Returns null if the token is tampered, malformed, or expired.
 */
export function verifySessionToken(token: string): SessionPayload | null {
  if (!token || typeof token !== "string") {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [payloadBase64, providedSignature] = parts;

  // Verify HMAC signature
  const expectedSignature = crypto
    .createHmac("sha256", getSessionSecret())
    .update(payloadBase64)
    .digest("base64url");

  if (!crypto.timingSafeEqual(Buffer.from(providedSignature), Buffer.from(expectedSignature))) {
    return null;
  }

  try {
    const payloadJson = Buffer.from(payloadBase64, "base64url").toString("utf-8");
    const payload = JSON.parse(payloadJson) as SessionPayload;

    // Check expiration
    if (payload.expiresAt < Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Returns a Supabase Server Client configured with cookie store following current @supabase/ssr conventions.
 * If NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are not present, returns null.
 */
export async function getSupabaseServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // May be called in Server Components where setting cookies is not permitted
        }
      },
    },
  });
}

/**
 * Resolves authenticated user session from either:
 * 1. Supabase Auth (@supabase/ssr session cookies)
 * 2. KanzleiFlow signed session cookie (fallback / dev / integration tests)
 */
export async function getAuthenticatedSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();

  // 1. Try Supabase Auth if configured
  const supabase = await getSupabaseServerClient();
  if (supabase) {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (!error && user && user.email) {
        return {
          userId: user.id,
          email: user.email,
          fullName: user.user_metadata?.full_name || user.email.split("@")[0] || "Benutzer",
          issuedAt: Date.now(),
          expiresAt: Date.now() + SESSION_DURATION_MS,
        };
      }
    } catch {
      // Supabase Auth unreachable, fall back to session token
    }
  }

  // 2. Try KanzleiFlow signed session cookie
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);
  if (sessionCookie?.value) {
    const verified = verifySessionToken(sessionCookie.value);
    if (verified) {
      return verified;
    }
  }

  return null;
}

/**
 * Reads requested active organization ID from cookies (for multi-tenant users).
 */
export async function getActiveOrgCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(ACTIVE_ORG_COOKIE_NAME)?.value || null;
}
