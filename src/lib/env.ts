import { z } from "zod";

/**
 * Validates environment variables.
 * Sensitive values are never exposed to the client.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().optional(),
  DIRECT_URL: z.string().optional(),
  APP_ENV: z.enum(["development", "test", "production"]).default("development"),
  DEFAULT_ORG_SLUG: z.string().default("notariat-weiss-partner"),
});

export type Env = z.infer<typeof envSchema>;

let parsedEnv: Env | null = null;

export function getEnv(): Env {
  if (!parsedEnv) {
    const result = envSchema.safeParse({
      DATABASE_URL: process.env.DATABASE_URL,
      DIRECT_URL: process.env.DIRECT_URL,
      APP_ENV: process.env.APP_ENV,
      DEFAULT_ORG_SLUG: process.env.DEFAULT_ORG_SLUG,
    });

    if (!result.success) {
      console.error("Environment validation failed:", result.error.format());
      throw new Error("Invalid environment configuration");
    }

    parsedEnv = result.data;
  }

  return parsedEnv;
}
