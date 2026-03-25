import { z } from "zod";

const nodeEnvSchema = z.enum(["development", "test", "production"]).default("development");

const envSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  APP_ORIGIN: z.string().url().optional(),
  PUBLIC_APP_ORIGIN: z.string().url().optional(),
  SESSION_SECRET: z.string().min(32),
  CSRF_COOKIE_NAME: z.string().min(1).default("aleryaf_csrf"),
  SESSION_TTL_DAYS: z.coerce.number().positive().max(30).default(7),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
  VAPID_PUBLIC_KEY: z.string().min(1),
  VAPID_PRIVATE_KEY: z.string().min(1),
  VAPID_SUBJECT: z.string().min(1),
  HANDBOOK_MASTER_PASSWORD: z.string().min(12).optional(),
  ADMIN_BOOTSTRAP_USERNAME: z.string().min(1).optional(),
  ADMIN_BOOTSTRAP_PASSWORD: z.string().min(12).optional(),
  LOG_LEVEL: z.string().min(1).default("info"),
});

function formatIssues(prefix: string, issues: string[]) {
  return `${prefix}\n${issues.map((issue) => `- ${issue}`).join("\n")}`;
}

function validateEnvironment() {
  const rawNodeEnv = process.env.NODE_ENV ?? "development";
  const testDefaults =
    rawNodeEnv === "test"
      ? {
          DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://test:test@127.0.0.1:5432/test",
          SESSION_SECRET: process.env.SESSION_SECRET ?? "test-session-secret-1234567890abcdef",
          VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY ?? "test-public-vapid-key",
          VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY ?? "test-private-vapid-key",
          VAPID_SUBJECT: process.env.VAPID_SUBJECT ?? "mailto:test@example.com",
        }
      : {};
  const parsed = envSchema.safeParse({
    ...process.env,
    ...testDefaults,
  });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => {
      const path = issue.path.join(".") || "env";
      return `${path}: ${issue.message}`;
    });
    throw new Error(formatIssues("Environment validation failed", issues));
  }

  const env = parsed.data;
  const requiredOrigins = [env.APP_ORIGIN, env.PUBLIC_APP_ORIGIN].filter(Boolean);

  if (env.NODE_ENV === "production") {
    const productionIssues: string[] = [];
    if (requiredOrigins.length === 0) {
      productionIssues.push("APP_ORIGIN or PUBLIC_APP_ORIGIN must be configured in production");
    }
    if (env.ADMIN_BOOTSTRAP_USERNAME && !env.ADMIN_BOOTSTRAP_PASSWORD) {
      productionIssues.push("ADMIN_BOOTSTRAP_PASSWORD is required when ADMIN_BOOTSTRAP_USERNAME is set");
    }
    if (!env.ADMIN_BOOTSTRAP_USERNAME && env.ADMIN_BOOTSTRAP_PASSWORD) {
      productionIssues.push("ADMIN_BOOTSTRAP_USERNAME is required when ADMIN_BOOTSTRAP_PASSWORD is set");
    }
    if (productionIssues.length > 0) {
      throw new Error(formatIssues("Production environment validation failed", productionIssues));
    }
  }

  return {
    ...env,
    isProduction: env.NODE_ENV === "production",
    allowedAppOrigins: Array.from(new Set(requiredOrigins)),
  };
}

export const appEnv = validateEnvironment();
