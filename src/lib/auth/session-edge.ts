/**
 * Edge-compatible session verification and environment helpers.
 * Implemented with Web Standards (Web Crypto API, TextEncoder, atob)
 * so Next.js Edge Middleware executes with ZERO Node.js module dependencies.
 */

export interface SessionPayload {
  userId: string;
  email: string;
  fullName: string;
  issuedAt: number;
  expiresAt: number;
}

export const SESSION_COOKIE_NAME = "kanzleiflow_session";
export const ACTIVE_ORG_COOKIE_NAME = "kanzleiflow_active_org_id";
export const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

export function isProductionEnvironment(): boolean {
  return (
    process.env.APP_ENV === "production" ||
    (process.env.NODE_ENV === "production" && process.env.APP_ENV !== "development") ||
    process.env.VERCEL_ENV === "production"
  );
}

function getSessionSecret(): string {
  return (
    process.env.SESSION_SECRET ||
    process.env.SUPABASE_JWT_SECRET ||
    "kanzleiflow-secure-notary-session-secret-key-2026-strict"
  );
}

function base64UrlToUint8Array(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4;
  const padded = pad ? base64 + "=".repeat(4 - pad) : base64;
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Edge-safe verification of cryptographically signed KanzleiFlow session token.
 * Uses Web Crypto API (HMAC-SHA256).
 */
export async function verifySessionTokenEdge(token: string): Promise<SessionPayload | null> {
  if (!token || typeof token !== "string") {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [payloadBase64, providedSignature] = parts;

  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(getSessionSecret()),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const signatureBytes = base64UrlToUint8Array(providedSignature);
    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes as unknown as BufferSource,
      enc.encode(payloadBase64)
    );

    if (!isValid) {
      return null;
    }

    const payloadJson = new TextDecoder().decode(base64UrlToUint8Array(payloadBase64));
    const payload = JSON.parse(payloadJson) as SessionPayload;

    if (payload.expiresAt < Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
