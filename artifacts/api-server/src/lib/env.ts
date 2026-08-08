import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { z } from "zod";

function findLocalEnv(startDir: string): string | undefined {
  let currentDir = resolve(startDir);
  while (true) {
    const candidate = resolve(currentDir, ".env");
    if (existsSync(candidate)) return candidate;
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) return undefined;
    currentDir = parentDir;
  }
}

// Local development: load `.env` from the repo root if present.
// Replit and production inject environment variables directly, so the file is
// optional and a missing one is never an error.
if (process.env["NODE_ENV"] !== "production") {
  const envFile = findLocalEnv(process.cwd());
  if (envFile) {
    process.loadEnvFile(envFile);
  }
}

/**
 * Treat an empty string as an absent value.
 *
 * A variable declared but left blank — `ENCRYPTION_KEY=` in a .env file, or an
 * empty Replit secret — is still *present* in `process.env`, so `.optional()`
 * alone does not apply and the constraint below it fails. Without this, a blank
 * optional variable crashes the server at startup.
 */
function optionalString<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    schema.optional()
  );
}

function booleanFromEnv(defaultValue: boolean) {
  return z.preprocess(
    (value) => value === undefined || value === "" ? defaultValue : value === "true",
    z.boolean(),
  );
}

const envSchema = z.object({
  // Core
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  // ENCRYPTION_KEY is required for Dropbox file encryption (Increment 4).
  // Not needed in Increment 0–3; a missing key logs a warning at startup.
  ENCRYPTION_KEY: optionalString(z.string().min(32)),
  APP_URL: optionalString(z.string().url()),
  // Comma-separated browser origins allowed to send credentialed requests.
  // Empty means same-origin only, which is how the Replit deployment serves
  // the frontend and the API.
  CORS_ORIGINS: z.string().default(""),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  // i18n
  DEFAULT_LOCALE: z.enum(["uk", "cs"]).default("uk"),
  SUPPORTED_LOCALES: z.string().default("uk,cs"),

  // Storage
  STORAGE_ARCHIVE_PROVIDER: z.enum(["dropbox"]).default("dropbox"),
  DROPBOX_APP_KEY: optionalString(z.string()),
  DROPBOX_APP_SECRET: optionalString(z.string()),
  DROPBOX_REDIRECT_URI: optionalString(z.string()),

  // Files
  FILE_MAX_BYTES: z.coerce.number().int().positive().default(52428800),
  FILES_ENABLED: booleanFromEnv(process.env["NODE_ENV"] !== "production"),
  FILE_MIME_ALLOWLIST: z
    .string()
    .default(
      "application/pdf,image/jpeg,image/png,image/webp,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/zip,text/plain,text/markdown,application/acad,image/vnd.dwg"
    ),

  // Messaging
  MESSAGE_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(10000),

  // Email
  EMAIL_PROVIDER: z.enum(["console", "smtp"]).default("console"),
  SMTP_URL: optionalString(z.string()),
  EMAIL_FROM: optionalString(z.string()),

  // Logging
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),
}).superRefine((value, ctx) => {
  if (value.EMAIL_PROVIDER === "smtp") {
    for (const key of ["SMTP_URL", "EMAIL_FROM", "APP_URL"] as const) {
      if (!value[key]) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${key} is required when EMAIL_PROVIDER=smtp` });
      }
    }
  }
  if (value.NODE_ENV === "production" && value.EMAIL_PROVIDER === "console") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["EMAIL_PROVIDER"], message: "Production requires EMAIL_PROVIDER=smtp" });
  }
});

// Validate at module load — fails fast with a clear error on startup
const result = envSchema.safeParse(process.env);
if (!result.success) {
  const missing = result.error.issues
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  throw new Error(`Invalid environment configuration:\n${missing}`);
}

export const env = result.data;
export type Env = typeof env;
