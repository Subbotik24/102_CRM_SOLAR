/**
 * Increment 6 — Admin, Audit & Hardening integration tests.
 * Run with: tsx --test tests/integration/inc6-admin.test.ts
 */
import { describe, test, before } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { requireTestAdminCredentials } from "./testCredentials";

const BASE = process.env["API_URL"] ?? "http://localhost:8080/api";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(res.status, 200, `Login failed for ${email}: HTTP ${res.status}`);
  const setCookie = res.headers.get("set-cookie") ?? "";
  const match = setCookie.match(/pds\.sid=([^;]+)/);
  assert.ok(match, "No session cookie");
  return `pds.sid=${match[1]}`;
}

async function api(
  method: string,
  path: string,
  cookie: string,
  body?: unknown
): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      cookie,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ── State ─────────────────────────────────────────────────────────────────────

let adminCookie = "";
let createdUserId = "";

describe("Increment 6 — Admin: Users", () => {
  before(async () => {
    const admin = requireTestAdminCredentials();
    adminCookie = await login(admin.email, admin.password);
  });

  test("1. List users returns at least the admin user", async () => {
    const res = await api("GET", "/admin/users", adminCookie);
    assert.equal(res.status, 200);
    const body = await res.json() as { users: Array<{ email: string }> };
    assert.ok(body.users.some((u) => u.email === requireTestAdminCredentials().email), "admin not in list");
  });

  test("2. Unauthenticated request to /admin/users returns 401", async () => {
    const res = await fetch(`${BASE}/admin/users`);
    assert.equal(res.status, 401);
  });

  test("3. Member role cannot access /admin/users (403)", async () => {
    // Create a member via invite then try admin endpoint
    const invRes = await api("POST", "/admin/invitations", adminCookie, {
      email: `member-test-${Date.now()}@example.com`,
      role: "member",
    });
    assert.equal(invRes.status, 201, "Invitation creation failed");
    const inv = await invRes.json() as { token: string; email: string };

    // Accept invitation to create user
    const acceptRes = await fetch(`${BASE}/auth/invite/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: inv.token,
        displayName: "Test Member",
        password: "TestPass123",
      }),
    });
    assert.equal(acceptRes.status, 201, "Invite acceptance failed");
    const accBody = await acceptRes.json() as { id: string };
    createdUserId = accBody.id;

    // Get member cookie
    const memberCookie = await login(inv.email, "TestPass123");
    const adminRes = await api("GET", "/admin/users", memberCookie);
    assert.equal(adminRes.status, 403, "Member should not access admin users");
  });

  test("4. Admin can suspend and reactivate user", async () => {
    if (!createdUserId) { return; }
    const suspendRes = await api("PATCH", `/admin/users/${createdUserId}`, adminCookie, { status: "suspended" });
    assert.equal(suspendRes.status, 200);

    const reactivateRes = await api("PATCH", `/admin/users/${createdUserId}`, adminCookie, { status: "active" });
    assert.equal(reactivateRes.status, 200);
  });

  test("5. Admin can change user role", async () => {
    if (!createdUserId) { return; }
    const res = await api("PATCH", `/admin/users/${createdUserId}`, adminCookie, { role: "manager" });
    assert.equal(res.status, 200);
    const body = await res.json() as { role: string };
    assert.equal(body.role, "manager");
  });
});

describe("Increment 6 — Audit Log", () => {
  before(async () => {
    if (!adminCookie) { const admin = requireTestAdminCredentials(); adminCookie = await login(admin.email, admin.password); }
  });

  test("6. Admin can list audit log events", async () => {
    const res = await api("GET", "/admin/audit-log", adminCookie);
    assert.equal(res.status, 200);
    const body = await res.json() as { logs: unknown[]; total: number };
    assert.ok(Array.isArray(body.logs), "logs should be array");
    assert.ok(typeof body.total === "number", "total should be number");
  });

  test("7. Audit log includes login events", async () => {
    const res = await api("GET", "/admin/audit-log?action=auth.login_success", adminCookie);
    assert.equal(res.status, 200);
    const body = await res.json() as { logs: Array<{ action: string }>; total: number };
    assert.ok(body.total > 0, "Should have at least one login_success event");
    assert.ok(body.logs.every((l) => l.action === "auth.login_success"));
  });

  test("8. Audit log CSV export returns CSV content", async () => {
    const res = await api("GET", "/admin/audit-log.csv", adminCookie);
    assert.equal(res.status, 200);
    const ct = res.headers.get("content-type") ?? "";
    assert.ok(ct.includes("text/csv"), `Expected text/csv, got ${ct}`);
    const text = await res.text();
    assert.ok(text.includes("id,actor,action"), "CSV should have header row");
  });

  test("9. Audit log is append-only — UPDATE attempt fails at DB level", async () => {
    // Use psql (available in Replit environment) to verify the trigger prevents UPDATE.
    const { execSync } = await import("node:child_process");
    const dbUrl = process.env["DATABASE_URL"];
    assert.ok(dbUrl, "DATABASE_URL must be set");

    // First insert a row so there is something to try to update
    execSync(
      `psql "${dbUrl}" -c "INSERT INTO audit_log (action) VALUES ('test.immutability_check')"`,
      { stdio: "pipe" }
    );

    // Now attempt UPDATE — must fail with the trigger error
    let threw = false;
    try {
      execSync(
        `psql "${dbUrl}" -c "UPDATE audit_log SET action = 'tampered' WHERE action = 'test.immutability_check'"`,
        { stdio: "pipe" }
      );
    } catch {
      threw = true;
    }
    assert.ok(threw, "UPDATE on audit_log should fail — DB trigger enforcement");
  });
});

describe("Increment 6 — Password Reset", () => {
  before(async () => {
    if (!adminCookie) { const admin = requireTestAdminCredentials(); adminCookie = await login(admin.email, admin.password); }
  });

  test("10. Forgot-password returns 200 for any email (timing-safe)", async () => {
    const res = await fetch(`${BASE}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "nobody@example.com" }),
    });
    assert.equal(res.status, 200);
  });

  test("11. Forgot-password works for existing user (console link logged)", async () => {
    const res = await fetch(`${BASE}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: requireTestAdminCredentials().email }),
    });
    assert.equal(res.status, 200);
    const body = await res.json() as { ok: boolean };
    assert.equal(body.ok, true);
  });

  test("12. Reset-password with invalid token returns 400", async () => {
    const res = await fetch(`${BASE}/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: crypto.randomBytes(32).toString("hex"), newPassword: "NewPass123" }),
    });
    assert.equal(res.status, 400);
  });
});

describe("Increment 6 — Settings", () => {
  before(async () => {
    if (!adminCookie) { const admin = requireTestAdminCredentials(); adminCookie = await login(admin.email, admin.password); }
  });

  test("13. GET /admin/settings returns settings array", async () => {
    const res = await api("GET", "/admin/settings", adminCookie);
    assert.equal(res.status, 200);
    const body = await res.json() as { settings: unknown[] };
    assert.ok(Array.isArray(body.settings));
  });

  test("14. PATCH /admin/settings can set a key", async () => {
    const res = await api("PATCH", "/admin/settings", adminCookie, {
      key: "test_key_inc6",
      value: "test_value",
    });
    assert.equal(res.status, 200);
    const body = await res.json() as { key: string; value: string };
    assert.equal(body.key, "test_key_inc6");
    assert.equal(body.value, "test_value");
  });

  test("15. PATCH /admin/settings rejects encrypted key names", async () => {
    const res = await api("PATCH", "/admin/settings", adminCookie, {
      key: "dropbox_enc",
      value: "hack",
    });
    assert.equal(res.status, 400);
  });

});

describe("Increment 6 — Security: Helmet headers", () => {
  test("16. API response includes security headers from helmet", async () => {
    const res = await fetch(`${BASE}/healthz`);
    const xct = res.headers.get("x-content-type-options");
    const xfo = res.headers.get("x-frame-options");
    assert.ok(xct, "x-content-type-options header should be set");
    assert.ok(xfo, "x-frame-options header should be set");
  });

  test("17. PostgreSQL readiness succeeds against the live database", async () => {
    const res = await fetch(`${BASE}/readyz`);
    assert.equal(res.status, 200);
    const body = await res.json() as {
      status: string;
      checks: { database: string };
    };
    assert.equal(body.status, "ready");
    assert.equal(body.checks.database, "ok");
  });

  test("18. Unsafe browser request from an untrusted Origin is rejected", async () => {
    if (!adminCookie) { const admin = requireTestAdminCredentials(); adminCookie = await login(admin.email, admin.password); }
    const res = await fetch(`${BASE}/admin/settings`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        cookie: adminCookie,
        Origin: "https://attacker.example",
      },
      body: JSON.stringify({
        key: "origin_gate_must_not_write",
        value: "blocked",
      }),
    });
    assert.equal(res.status, 403);
  });

  test("19. Oversized JSON body is rejected before route handling", async () => {
    const res = await fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "nobody@example.com",
        password: "x".repeat(300 * 1024),
      }),
    });
    assert.equal(res.status, 413);
  });
});
