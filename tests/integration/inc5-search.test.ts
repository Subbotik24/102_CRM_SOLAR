/**
 * Increment 5 — KB, Chronicle & Log Entries integration tests (HTTP-only).
 *
 * Tests:
 *  1. Chronicle MD export returns non-empty Markdown with Content-Disposition
 *  2. Chronicle PDF export returns non-empty PDF bytes
 *  3. KB article create / list / publish / update + version
 *  4. Log entry create + list
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { requireTestAdminCredentials } from "./testCredentials";

const BASE = process.env["API_URL"] ?? "http://localhost:8080/api";

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function post(path: string, body: unknown, cookie: string): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(body),
  });
}

async function get(path: string, cookie: string): Promise<Response> {
  return fetch(`${BASE}${path}`, { headers: { Cookie: cookie } });
}

async function login(email: string, password: string): Promise<string> {
  const res = await post("/auth/login", { email, password }, "");
  assert.equal(res.status, 200, `Login failed for ${email}: HTTP ${res.status}`);
  const setCookie = res.headers.get("set-cookie") ?? "";
  return setCookie.split(";")[0];
}

// ── State ─────────────────────────────────────────────────────────────────────

let adminCookie: string;
let testProjectId: string;
let kbArticleId: string;

// ── Setup ─────────────────────────────────────────────────────────────────────

before(async () => {
  const admin = requireTestAdminCredentials();
  adminCookie = await login(admin.email, admin.password);

  // Create (or find) a Ukrainian-named project
  const createRes = await post(
    "/projects",
    { name: "Проект Київ", code: "UKRTEST5", kind: "internal" },
    adminCookie
  );
  if (createRes.status === 201) {
    const p = (await createRes.json()) as { id: string };
    testProjectId = p.id;
  } else {
    const listRes = await get("/projects", adminCookie);
    const { projects } = (await listRes.json()) as {
      projects: Array<{ id: string; code: string }>;
    };
    const existing = projects.find((p) => p.code === "UKRTEST5");
    testProjectId = existing?.id ?? projects[0]?.id ?? "";
  }

  // Create + publish a KB article with Czech title containing říz (→ unaccent → Rizeni → contains riz)
  const artRes = await post(
    `/projects/${testProjectId}/kb`,
    { title: "Řízení projektů: průvodce", bodyMd: "Obsah o řízení projektů" },
    adminCookie
  );
  if (artRes.status === 201) {
    const art = (await artRes.json()) as { id: string };
    kbArticleId = art.id;
    await post(`/kb/${kbArticleId}/publish`, {}, adminCookie);
  }
});

// Note: test project is left in DB for idempotency; re-runs reuse UKRTEST5.

// ── Chronicle tests ───────────────────────────────────────────────────────────

describe("Increment 5 – Chronicle Export", () => {
  it("6. Chronicle MD export returns non-empty Markdown", async () => {
    if (!testProjectId) {
      console.log("  (skipped — no project)");
      return;
    }
    const res = await get(
      `/projects/${testProjectId}/chronicle?format=md`,
      adminCookie
    );
    assert.equal(res.status, 200, `Chronicle MD returned ${res.status}`);
    const ct = res.headers.get("content-type") ?? "";
    assert.ok(
      ct.includes("markdown") || ct.includes("text"),
      `Expected markdown content-type, got: ${ct}`
    );
    const body = await res.text();
    assert.ok(body.length > 50, `Expected non-empty chronicle, got length ${body.length}`);
    assert.ok(body.includes("#"), "Chronicle should contain Markdown headings");
  });

  it("7. Chronicle PDF export returns non-empty PDF bytes", async () => {
    if (!testProjectId) {
      console.log("  (skipped — no project)");
      return;
    }
    const res = await get(
      `/projects/${testProjectId}/chronicle?format=pdf`,
      adminCookie
    );
    assert.equal(res.status, 200, `Chronicle PDF returned ${res.status}`);
    const ct = res.headers.get("content-type") ?? "";
    assert.ok(ct.includes("pdf"), `Expected PDF content-type, got: ${ct}`);
    const buf = Buffer.from(await res.arrayBuffer());
    assert.ok(buf.length > 100, `Expected non-empty PDF, got ${buf.length} bytes`);
    assert.ok(buf.slice(0, 4).toString() === "%PDF", "PDF should start with %PDF");
  });

  it("8. Chronicle export sets Content-Disposition attachment header", async () => {
    if (!testProjectId) {
      console.log("  (skipped — no project)");
      return;
    }
    const res = await get(
      `/projects/${testProjectId}/chronicle?format=md`,
      adminCookie
    );
    const cd = res.headers.get("content-disposition") ?? "";
    assert.ok(cd.includes("attachment"), `Expected attachment disposition, got: ${cd}`);
  });
});

// ── KB CRUD tests ─────────────────────────────────────────────────────────────

describe("Increment 5 – KB CRUD", () => {
  let articleId = "";

  it("9. Create KB article returns 201 with draft status", async () => {
    const res = await post(
      `/projects/${testProjectId}/kb`,
      { title: "Test Article Inc5", bodyMd: "# Hello\nWorld", tags: ["test", "docs"] },
      adminCookie
    );
    assert.equal(res.status, 201);
    const art = (await res.json()) as { id: string; status: string };
    articleId = art.id;
    assert.equal(art.status, "draft");
  });

  it("10. List KB articles returns the created article", async () => {
    const res = await get(`/projects/${testProjectId}/kb`, adminCookie);
    assert.equal(res.status, 200);
    const { articles } = (await res.json()) as { articles: Array<{ id: string }> };
    const found = articles.some((a) => a.id === articleId);
    assert.ok(found, "Created article should appear in list");
  });

  it("11. Publish article changes status to published", async () => {
    const res = await post(`/kb/${articleId}/publish`, {}, adminCookie);
    assert.equal(res.status, 200);
    const art = (await res.json()) as { status: string };
    assert.equal(art.status, "published");
  });

  it("12. Update article body creates a new version", async () => {
    // PATCH update
    const patchRes = await fetch(`${BASE}/kb/${articleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ bodyMd: "# Hello\nUpdated content v2" }),
    });
    assert.equal(patchRes.status, 200);

    const versRes = await get(`/kb/${articleId}/versions`, adminCookie);
    assert.equal(versRes.status, 200);
    const { versions } = (await versRes.json()) as {
      versions: Array<{ versionNo: number }>;
    };
    assert.ok(
      versions.length >= 2,
      `Expected at least 2 versions, got ${versions.length}`
    );
  });
});

// ── Log entry tests ───────────────────────────────────────────────────────────

describe("Increment 5 – Log Entries", () => {
  it("13. Create decision log entry returns 201", async () => {
    const res = await post(
      `/projects/${testProjectId}/log-entries`,
      {
        entryType: "decision",
        title: "Use PostgreSQL for storage",
        bodyMd: "We decided to use PostgreSQL.",
      },
      adminCookie
    );
    assert.equal(res.status, 201);
    const entry = (await res.json()) as { entryType: string; title: string };
    assert.equal(entry.entryType, "decision");
  });

  it("14. List log entries returns the created entry", async () => {
    const res = await get(`/projects/${testProjectId}/log-entries`, adminCookie);
    assert.equal(res.status, 200);
    const { entries } = (await res.json()) as {
      entries: Array<{ title: string }>;
    };
    const found = entries.some((e) => e.title === "Use PostgreSQL for storage");
    assert.ok(found, "Log entry should appear in list");
  });
});
