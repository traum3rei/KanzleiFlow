import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getEnv } from "./env";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  pgPool?: Pool;
};

/**
 * Returns whether a database connection string has been configured in the environment.
 */
export function isDatabaseConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.DATABASE_URL && env.DATABASE_URL.trim() !== "");
}

/**
 * Factory for PrismaClient using the pg Pool adapter.
 * Reuses the instance across hot-reloads in development.
 */
export function getPrismaClient(): PrismaClient | null {
  if (!isDatabaseConfigured()) {
    return null;
  }

  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }

  const env = getEnv();
  const maxPoolSize = Number(process.env.DATABASE_POOL_MAX || 15);
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: maxPoolSize,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  const adapter = new PrismaPg(pool);
  const client = new PrismaClient({ adapter });

  globalForPrisma.pgPool = pool;
  globalForPrisma.prisma = client;

  return client;
}

/**
 * Access the underlying pg.Pool for transactions requiring advisory locks or SKIP LOCKED raw primitives.
 */
export function getRawPgPool(): Pool | null {
  getPrismaClient(); // Ensure initialized
  return globalForPrisma.pgPool || null;
}

/**
 * Retrieve database connection pool metrics for readiness, health probes, and observability.
 */
export function getDatabasePoolMetrics(): {
  total: number;
  idle: number;
  waiting: number;
  max: number;
} {
  const maxPoolSize = Number(process.env.DATABASE_POOL_MAX || 15);
  if (!globalForPrisma.pgPool) {
    return { total: 0, idle: 0, waiting: 0, max: maxPoolSize };
  }
  return {
    total: globalForPrisma.pgPool.totalCount,
    idle: globalForPrisma.pgPool.idleCount,
    waiting: globalForPrisma.pgPool.waitingCount,
    max: maxPoolSize,
  };
}

/**
 * Test whether the database connection is live and reachable.
 */
export async function testDatabaseConnection(): Promise<{
  connected: boolean;
  message: string;
  hasTables?: boolean;
}> {
  const client = getPrismaClient();
  if (!client) {
    return {
      connected: false,
      message: "DATABASE_URL is not configured in .env.local",
    };
  }

  try {
    // Run a lightweight test query
    await client.$queryRaw`SELECT 1 as ping`;

    // Check if the kanzleiflow tables exist
    const tables = await client.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_catalog.pg_tables 
      WHERE schemaname = 'public' AND tablename = 'cases'
    `;

    const hasTables = tables.length > 0;

    return {
      connected: true,
      message: hasTables
        ? "Connected to Supabase PostgreSQL (schema initialized)"
        : "Connected to Supabase PostgreSQL (awaiting initial migration)",
      hasTables,
    };
  } catch (error: unknown) {
    const err = error as Error;
    return {
      connected: false,
      message: `Database connection error: ${err.message}`,
    };
  }
}
