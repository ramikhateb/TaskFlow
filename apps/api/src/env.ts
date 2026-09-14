import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // Signs/verifies short-lived access tokens. No default — must be set
  // explicitly so a real secret is never accidentally omitted.
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  // Access token lifetime, in seconds (~15 min target per ARCHITECTURE.md §6).
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  // Refresh token lifetime, in days.
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates process.env at startup so the process fails fast with a clear
 * error instead of surfacing a confusing failure on the first request.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return result.data;
}
