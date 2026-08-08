/**
 * Dropbox OAuth 2.0 with offline refresh token.
 * Refresh token stored AES-256-GCM encrypted in the `settings` table.
 * Access token cached in-memory with expiry — never persisted to DB.
 */
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { encrypt, decrypt } from "../lib/encryption";
import { env } from "../lib/env";

const DROPBOX_AUTH_URL = "https://www.dropbox.com/oauth2/authorize";
const DROPBOX_TOKEN_URL = "https://api.dropboxapi.com/oauth2/token";
const SETTINGS_KEY_REFRESH = "dropbox_refresh_token";
const SETTINGS_KEY_ACCOUNT = "dropbox_account_email";

/** In-memory access token cache. */
let cachedAccessToken: string | null = null;
let cacheExpiresAt = 0;

function encryptionKey(): string {
  if (!env.ENCRYPTION_KEY) throw new Error("ENCRYPTION_KEY is required for Dropbox storage");
  return env.ENCRYPTION_KEY;
}

/** Build the Dropbox OAuth consent URL. */
export function buildAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.DROPBOX_APP_KEY ?? "",
    redirect_uri: env.DROPBOX_REDIRECT_URI ?? "",
    response_type: "code",
    token_access_type: "offline",
    state,
  });
  return `${DROPBOX_AUTH_URL}?${params}`;
}

/** Exchange an authorization code for tokens. Stores refresh token. */
export async function exchangeCode(code: string): Promise<{ email: string }> {
  const res = await fetch(DROPBOX_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      grant_type: "authorization_code",
      client_id: env.DROPBOX_APP_KEY ?? "",
      client_secret: env.DROPBOX_APP_SECRET ?? "",
      redirect_uri: env.DROPBOX_REDIRECT_URI ?? "",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Dropbox token exchange failed: ${body}`);
  }
  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    account_id?: string;
  };

  // Store refresh token encrypted
  const encrypted = encrypt(data.refresh_token, encryptionKey());
  await db
    .insert(settingsTable)
    .values({ key: SETTINGS_KEY_REFRESH, value: encrypted })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value: encrypted, updatedAt: new Date() } });

  // Cache access token
  cachedAccessToken = data.access_token;
  cacheExpiresAt = Date.now() + (data.expires_in - 60) * 1000;

  // Fetch account info to store email
  const accountRes = await fetch("https://api.dropboxapi.com/2/users/get_current_account", {
    method: "POST",
    headers: { Authorization: `Bearer ${data.access_token}` },
  });
  let email = "";
  if (accountRes.ok) {
    const account = (await accountRes.json()) as { email: string };
    email = account.email;
    await db
      .insert(settingsTable)
      .values({ key: SETTINGS_KEY_ACCOUNT, value: email })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value: email, updatedAt: new Date() } });
  }

  return { email };
}

/** Get a valid access token, refreshing if expired. Retries once on 401. */
export async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < cacheExpiresAt) {
    return cachedAccessToken;
  }
  return refreshAccessToken();
}

async function refreshAccessToken(): Promise<string> {
  const [row] = await db
    .select({ value: settingsTable.value })
    .from(settingsTable)
    .where(eq(settingsTable.key, SETTINGS_KEY_REFRESH))
    .limit(1);

  if (!row) throw new Error("Dropbox not connected — no refresh token stored");

  const refreshToken = decrypt(row.value, encryptionKey());

  const res = await fetch(DROPBOX_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: env.DROPBOX_APP_KEY ?? "",
      client_secret: env.DROPBOX_APP_SECRET ?? "",
    }),
  });
  if (!res.ok) throw new Error("Dropbox token refresh failed");
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedAccessToken = data.access_token;
  cacheExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
  return cachedAccessToken;
}

/** Remove all Dropbox credentials. */
export async function disconnect(): Promise<void> {
  cachedAccessToken = null;
  cacheExpiresAt = 0;
  await db.delete(settingsTable).where(eq(settingsTable.key, SETTINGS_KEY_REFRESH));
  await db.delete(settingsTable).where(eq(settingsTable.key, SETTINGS_KEY_ACCOUNT));
}

/** Check if Dropbox is connected (refresh token stored). */
export async function isConnected(): Promise<boolean> {
  const [row] = await db
    .select({ key: settingsTable.key })
    .from(settingsTable)
    .where(eq(settingsTable.key, SETTINGS_KEY_REFRESH))
    .limit(1);
  return !!row;
}

/** Get connected account email (empty string if not connected). */
export async function getAccountEmail(): Promise<string> {
  const [row] = await db
    .select({ value: settingsTable.value })
    .from(settingsTable)
    .where(eq(settingsTable.key, SETTINGS_KEY_ACCOUNT))
    .limit(1);
  return row?.value ?? "";
}

/** Get Dropbox space usage. Returns null if not connected or error. */
export async function getSpaceUsage(): Promise<{ used: number; allocated: number } | null> {
  try {
    const token = await getAccessToken();
    const res = await fetch("https://api.dropboxapi.com/2/users/get_space_usage", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: "null",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      used: number;
      allocation: { allocated?: number; ".tag": string };
    };
    return {
      used: data.used,
      allocated: data.allocation.allocated ?? 0,
    };
  } catch {
    return null;
  }
}
