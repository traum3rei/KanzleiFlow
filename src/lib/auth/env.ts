/**
 * Environment helpers for production detection and runtime isolation.
 * Kept standalone so Edge Middleware can import without pulling Prisma or Node.js dependencies.
 */

export function isProductionEnvironment(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.APP_ENV === "production" ||
    process.env.VERCEL_ENV === "production"
  );
}
