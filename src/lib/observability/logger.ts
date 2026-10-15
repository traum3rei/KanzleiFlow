/**
 * Structured Observability Logger for KanzleiFlow
 * Emits JSON logs with correlation IDs and strict PII redaction.
 */

export interface LogContext {
  correlationId?: string;
  tenantId?: string;
  userId?: string;
  action?: string;
  durationMs?: number;
  [key: string]: unknown;
}

const REDACTED_KEYS = new Set([
  "password",
  "token",
  "secret",
  "authorization",
  "taxid",
  "tax_id",
  "birthdate",
  "birth_date",
  "rawtext",
  "raw_text",
  "documentbuffer",
  "buffer",
  "cookie",
]);

/**
 * Recursively redacts sensitive customer or legal details from log payloads.
 */
function sanitizeLogData(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[DEPTH_EXCEEDED]";
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    // Redact email addresses partially
    if (value.includes("@") && value.includes(".")) {
      const parts = value.split("@");
      return `${parts[0].slice(0, 2)}***@${parts[1]}`;
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeLogData(item, depth + 1));
  }

  if (typeof value === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (REDACTED_KEYS.has(k.toLowerCase())) {
        sanitized[k] = "[REDACTED]";
      } else {
        sanitized[k] = sanitizeLogData(v, depth + 1);
      }
    }
    return sanitized;
  }

  return value;
}

export const logger = {
  info(message: string, context?: LogContext): void {
    const entry = {
      level: "info",
      timestamp: new Date().toISOString(),
      message,
      ...(context ? (sanitizeLogData(context) as Record<string, unknown>) : {}),
    };
    console.log(JSON.stringify(entry));
  },

  warn(message: string, context?: LogContext): void {
    const entry = {
      level: "warn",
      timestamp: new Date().toISOString(),
      message,
      ...(context ? (sanitizeLogData(context) as Record<string, unknown>) : {}),
    };
    console.warn(JSON.stringify(entry));
  },

  error(message: string, error?: unknown, context?: LogContext): void {
    const errObj = error instanceof Error ? { errorName: error.name, errorMessage: error.message, stack: error.stack } : { rawError: String(error) };
    const entry = {
      level: "error",
      timestamp: new Date().toISOString(),
      message,
      ...errObj,
      ...(context ? (sanitizeLogData(context) as Record<string, unknown>) : {}),
    };
    console.error(JSON.stringify(entry));
  },
};
