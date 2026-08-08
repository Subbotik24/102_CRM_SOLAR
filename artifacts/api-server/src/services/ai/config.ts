import { inArray } from "drizzle-orm";
import { z } from "zod";
import { db, settingsTable } from "@workspace/db";
import type { User } from "@workspace/db";
import { env } from "../../lib/env";
import { decrypt, encrypt } from "../../lib/encryption";
import { ServiceUnavailableError, ValidationError } from "../errors";
import { logAudit } from "../audit";

const SETTINGS = {
  provider: "ai_provider",
  baseUrl: "ai_base_url",
  model: "ai_model",
  enabled: "ai_enabled",
  apiKey: "ai_api_key_enc",
} as const;

export const aiConfigSchema = z.object({
  provider: z.enum(["openai-compatible", "gemini", "ollama"]),
  baseUrl: z.string().url().max(500).optional(),
  model: z.string().trim().min(1).max(200),
  enabled: z.boolean().default(false),
  /** Optional so the administrator can change model without re-entering the key. */
  apiKey: z.string().trim().min(8).max(1000).optional(),
});

export type AiConfigInput = z.infer<typeof aiConfigSchema>;

export type SafeAiConfig = {
  configured: boolean;
  provider: "openai-compatible" | "gemini" | "ollama";
  baseUrl: string;
  model: string;
  enabled: boolean;
  hasApiKey: boolean;
};

function defaultBaseUrl(provider: SafeAiConfig["provider"]): string {
  if (provider === "gemini") return "https://generativelanguage.googleapis.com/v1beta";
  if (provider === "ollama") return "http://127.0.0.1:11434";
  return "https://api.openai.com/v1";
}

function normalizeBaseUrl(value: string | undefined, provider: SafeAiConfig["provider"]): string {
  const url = new URL(value?.trim() || defaultBaseUrl(provider));
  const isLoopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
  if (url.protocol !== "https:" && !(provider === "ollama" && url.protocol === "http:" && isLoopback)) {
    throw new ValidationError("AI endpoint must use HTTPS (except local Ollama on loopback)");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new ValidationError("AI endpoint must not include credentials, query parameters, or fragments");
  }
  return url.toString().replace(/\/$/, "");
}

function requireEncryptionKey(): string {
  if (!env.ENCRYPTION_KEY) {
    throw new ServiceUnavailableError(
      "AI configuration requires ENCRYPTION_KEY to be set on the server",
      "encryption_unavailable",
    );
  }
  return env.ENCRYPTION_KEY;
}

async function settingMap(): Promise<Map<string, string>> {
  const rows = await db
    .select({ key: settingsTable.key, value: settingsTable.value })
    .from(settingsTable)
    .where(inArray(settingsTable.key, Object.values(SETTINGS)));
  return new Map(rows.map((row) => [row.key, row.value]));
}

export async function getSafeAiConfig(): Promise<SafeAiConfig> {
  const values = await settingMap();
  const storedProvider = values.get(SETTINGS.provider);
  const provider = storedProvider === "gemini" || storedProvider === "ollama" ? storedProvider : "openai-compatible";
  const hasApiKey = Boolean(values.get(SETTINGS.apiKey));
  return {
    configured: Boolean(values.get(SETTINGS.provider) && values.get(SETTINGS.model) && (provider === "ollama" || hasApiKey)),
    provider,
    baseUrl: values.get(SETTINGS.baseUrl) ?? defaultBaseUrl(provider),
    model: values.get(SETTINGS.model) ?? "",
    enabled: values.get(SETTINGS.enabled) === "true",
    hasApiKey,
  };
}

export async function saveAiConfig(actor: User, input: AiConfigInput, ipAddress?: string): Promise<SafeAiConfig> {
  const provider = input.provider;
  const baseUrl = normalizeBaseUrl(input.baseUrl, provider);
  const current = await settingMap();
  if (input.provider !== "ollama" && !input.apiKey && !current.get(SETTINGS.apiKey)) {
    throw new ValidationError("An API key is required for the first AI configuration");
  }
  const encryptionKey = input.apiKey ? requireEncryptionKey() : undefined;
  const now = new Date();
  const values: Array<{ key: string; value: string; updatedAt: Date }> = [
    { key: SETTINGS.provider, value: provider, updatedAt: now },
    { key: SETTINGS.baseUrl, value: baseUrl, updatedAt: now },
    { key: SETTINGS.model, value: input.model, updatedAt: now },
    { key: SETTINGS.enabled, value: String(input.enabled), updatedAt: now },
  ];
  if (input.apiKey && encryptionKey) {
    values.push({ key: SETTINGS.apiKey, value: encrypt(input.apiKey, encryptionKey), updatedAt: now });
  }

  await db.transaction(async (tx) => {
    for (const value of values) {
      await tx.insert(settingsTable).values(value).onConflictDoUpdate({
        target: settingsTable.key,
        set: { value: value.value, updatedAt: now },
      });
    }
  });
  await logAudit({ action: "ai.configuration_changed", actorId: actor.id, entityType: "setting", meta: { key: SETTINGS.provider, provider, model: input.model, enabled: input.enabled }, ipAddress });
  return getSafeAiConfig();
}

async function getSecretConfig(): Promise<SafeAiConfig & { apiKey?: string }> {
  const safe = await getSafeAiConfig();
  const values = await settingMap();
  const encryptedKey = values.get(SETTINGS.apiKey);
  if (!safe.configured || !safe.enabled || (safe.provider !== "ollama" && !encryptedKey)) {
    throw new ServiceUnavailableError("AI integration is not configured and enabled", "ai_not_configured");
  }
  return { ...safe, ...(encryptedKey ? { apiKey: decrypt(encryptedKey, requireEncryptionKey()) } : {}) };
}

/** Performs a minimal provider request. The API key and response body are never logged or returned. */
export async function testAiConnection(actor: User, ipAddress?: string): Promise<{ ok: true; provider: string; model: string }> {
  const config = await getSecretConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    let response: Response;
    if (config.provider === "gemini") {
      response = await fetch(`${config.baseUrl}/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey!)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: "Reply with OK." }] }], generationConfig: { maxOutputTokens: 4 } }),
        signal: controller.signal,
      });
    } else if (config.provider === "ollama") {
      response = await fetch(`${config.baseUrl}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}) },
        body: JSON.stringify({ model: config.model, prompt: "Reply with OK.", stream: false, options: { num_predict: 4 } }),
        signal: controller.signal,
      });
    } else {
      response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey!}` },
        body: JSON.stringify({ model: config.model, messages: [{ role: "user", content: "Reply with OK." }], max_tokens: 4 }),
        signal: controller.signal,
      });
    }
    if (!response.ok) throw new ServiceUnavailableError("AI provider rejected the connection", "ai_connection_failed");
    await logAudit({ action: "ai.connection_tested", actorId: actor.id, entityType: "setting", meta: { key: SETTINGS.provider, provider: config.provider, model: config.model, ok: true }, ipAddress });
    return { ok: true, provider: config.provider, model: config.model };
  } catch (error) {
    if (error instanceof ServiceUnavailableError) throw error;
    throw new ServiceUnavailableError("Could not connect to AI provider", "ai_connection_failed");
  } finally {
    clearTimeout(timer);
  }
}

export const aiSettingsKeys = SETTINGS;
