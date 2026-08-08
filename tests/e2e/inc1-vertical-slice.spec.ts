/**
 * Gate 1 — Vertical Slice
 *
 * Path: login → create project → create task → change task status
 *       → navigate to journal → assert UK sentence → click locale toggle
 *       → assert CS sentence differs.
 *
 * Setup (login + project/task/status) uses localhost API for speed.
 * The session cookie is then injected into the browser context under the
 * correct dev-domain so the React app's fetch calls include it.
 *
 * Locale-switch note: the AuthGuard syncs i18n to the user's DB locale on
 * mount, but that useEffect only fires when user.locale changes.  After the
 * initial mount it does not re-run, so clicking the toggle button is the
 * correct mechanism — NOT page.reload() (which would re-mount AuthGuard and
 * reset the locale back to 'uk').
 */

import { test, expect } from "@playwright/test";

const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? process.env.SEED_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD;

// Localhost API: fast, no proxy overhead.
const LOCALHOST_API = "http://localhost:8080/api";

// Browser-side URL: must be the proxied dev-domain so the session cookie domain matches.
const DEV_DOMAIN = process.env.REPLIT_DEV_DOMAIN;
const BROWSER_BASE = DEV_DOMAIN ? `https://${DEV_DOMAIN}` : "http://localhost:5173";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function localhostPost<T>(path: string, body: unknown, cookie?: string): Promise<{ data: T; cookies: string[] }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cookie) headers["Cookie"] = cookie;

  const res = await fetch(`${LOCALHOST_API}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}: ${await res.text()}`);
  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  return { data: await res.json() as T, cookies: setCookies };
}

async function localhostPatch<T>(path: string, body: unknown, cookie: string): Promise<T> {
  const res = await fetch(`${LOCALHOST_API}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${path} → ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function localhostGet<T>(path: string, cookie: string): Promise<T> {
  const res = await fetch(`${LOCALHOST_API}${path}`, {
    headers: { Cookie: cookie },
  });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

function extractSessionCookie(setCookies: string[]): string {
  for (const header of setCookies) {
    const match = header.match(/^pds\.sid=([^;]+)/);
    if (match) return `pds.sid=${match[1]}`;
  }
  throw new Error("pds.sid cookie not found in Set-Cookie headers");
}

// ── Test ──────────────────────────────────────────────────────────────────────

test("Gate 1: full vertical slice — login → project → task → status → journal (uk & cs)", async ({
  browser,
}) => {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) throw new Error("TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD or SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD are required");
  // ── Step 1: Login via localhost (fast) ────────────────────────────────────
  const { data: me, cookies: loginCookies } = await localhostPost<{ id: string; displayName: string }>(
    "/auth/login",
    { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }
  );
  expect(me.id).toBeTruthy();
  const sessionCookieHeader = extractSessionCookie(loginCookies);
  const actorName = me.displayName;

  // ── Step 2: Create project via localhost ──────────────────────────────────
  const { data: project } = await localhostPost<{ id: string; code: string; name: string }>(
    "/projects",
    { name: "Gate 1 Project", summary: "Vertical slice gate test" },
    sessionCookieHeader
  );
  expect(project.id).toBeTruthy();

  // ── Step 3: Create task via localhost ─────────────────────────────────────
  const { data: task } = await localhostPost<{ id: string; status: string }>(
    `/projects/${project.id}/tasks`,
    { title: "Gate 1 Task" },
    sessionCookieHeader
  );
  expect(task.status).toBe("todo");

  // ── Step 4: Change task status via localhost ──────────────────────────────
  const updated = await localhostPatch<{ status: string }>(
    `/tasks/${task.id}/status`,
    { status: "in_progress" },
    sessionCookieHeader
  );
  expect(updated.status).toBe("in_progress");

  // ── Step 5: Verify journal has 3 events via localhost ─────────────────────
  const journal = await localhostGet<{ events: { eventType: string }[] }>(
    `/projects/${project.id}/journal`,
    sessionCookieHeader
  );
  expect(journal.events.length).toBe(3);
  expect(journal.events.map(e => e.eventType)).toContain("project.created");
  expect(journal.events.map(e => e.eventType)).toContain("task.created");
  expect(journal.events.map(e => e.eventType)).toContain("task.status_changed");

  // ── Step 6: Browser — inject session cookie and navigate to journal ────────
  const context = await browser.newContext({ baseURL: BROWSER_BASE });

  // Inject the session cookie into the browser context with the correct domain.
  const cookieDomain = DEV_DOMAIN ?? "localhost";
  // Extract just the value (strip "pds.sid=" prefix and URL-decode)
  const rawCookieValue = sessionCookieHeader.replace(/^pds\.sid=/, "");

  await context.addCookies([{
    name: "pds.sid",
    value: rawCookieValue,
    domain: cookieDomain,
    path: "/",
    httpOnly: true,
    secure: !!DEV_DOMAIN,
    sameSite: "Lax",
  }]);

  const page = await context.newPage();

  // Navigate to journal page. The AuthGuard reads /api/me (which uses the
  // injected cookie) and sets the locale to 'uk' (admin's DB locale).
  await page.goto(`/projects/${project.id}/journal`);

  // Wait for journal events to render.
  const journalList = page.locator('[data-testid="journal-list"]');
  await expect(journalList).toBeVisible({ timeout: 20_000 });

  const sentences = page.locator('[data-testid="journal-event-sentence"]');
  await expect(sentences.first()).toBeVisible({ timeout: 10_000 });

  // ── Step 7: Assert Ukrainian sentences ───────────────────────────────────
  const ukTexts = await sentences.allTextContents();
  expect(ukTexts.length).toBeGreaterThanOrEqual(3);

  // Templates from locales/uk/events.json:
  const ukProjectCreated = ukTexts.find(s => s.includes("створив(-ла) проєкт"));
  expect(ukProjectCreated, `UK project.created not found. Sentences: ${ukTexts.join(" | ")}`).toBeTruthy();
  expect(ukProjectCreated).toContain(actorName);
  expect(ukProjectCreated).toContain("Gate 1 Project");

  const ukTaskCreated = ukTexts.find(s => s.includes("створив(-ла) завдання"));
  expect(ukTaskCreated, "UK task.created not found").toBeTruthy();

  const ukStatusChanged = ukTexts.find(s => s.includes("змінив(-ла) статус завдання"));
  expect(ukStatusChanged, "UK task.status_changed not found").toBeTruthy();

  // ── Step 8: Click locale toggle → switch to CS ────────────────────────────
  // The toggle button is in the desktop sidebar (visible at 1280px).
  // i18n.changeLanguage('cs') is synchronous for pre-loaded resources, but
  // React may batch the re-render, so we wait for a CS-specific string.
  const localeBtn = page.locator('[data-testid="btn-toggle-locale"]');
  await expect(localeBtn).toBeVisible({ timeout: 5_000 });
  await localeBtn.click();

  // ── Step 9: Assert Czech sentences ───────────────────────────────────────
  // Templates from locales/cs/events.json:
  // project.created: "{{actorName}} vytvořil(-a) projekt «{{projectName}}»"
  // Wait for the Czech project.created sentence to appear.
  await expect(sentences.filter({ hasText: "vytvořil(-a) projekt" })).toBeVisible({
    timeout: 10_000,
  });

  const csTexts = await sentences.allTextContents();

  const csProjectCreated = csTexts.find(s => s.includes("vytvořil(-a) projekt"));
  expect(csProjectCreated, `CS project.created not found. Sentences: ${csTexts.join(" | ")}`).toBeTruthy();
  expect(csProjectCreated).toContain(actorName);
  expect(csProjectCreated).toContain("Gate 1 Project");

  // Verify the two locales render differently.
  expect(ukProjectCreated).not.toBe(csProjectCreated);

  // ── Step 10: Theme switch persists and applies dark mode ──────────────────
  const themeBtn = page.locator('[data-testid="btn-toggle-theme"]');
  await expect(themeBtn).toBeVisible({ timeout: 5_000 });
  await themeBtn.click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("pds.theme")))
    .toBe("dark");

  await context.close();
});
