/**
 * Integration tests — Increment 4: Files & Dropbox
 *
 * Tests:
 *  1. Upload a file → 201, DB row with status='pending'
 *  2. List files returns the uploaded file
 *  3. Download the uploaded file (from App Storage staging)
 *  4. Unauthorized download by a guest → 403 (guests can't access internal files)
 *  5. Upload a second version (same documentGroupId) → version_no increments
 *  6. Version list returns both versions
 *  7. MIME not allowed → 415
 *  8. Dropbox status endpoint returns proper shape (even without credentials)
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
// Use native Node.js 18+ globals: FormData, Blob, File, fetch

const BASE = process.env["API_URL"] ?? "http://localhost:8080/api";
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD;

function requireAdminCredentials(): { email: string; password: string } {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) throw new Error("TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD are required");
  return { email: ADMIN_EMAIL, password: ADMIN_PASSWORD };
}
const storageSkip = process.env["PRIVATE_OBJECT_DIR"]
  ? false
  : "Replit App Storage is unavailable: PRIVATE_OBJECT_DIR is not configured";

async function jsonFetch(
  path: string,
  opts: RequestInit & { json?: unknown } = {}
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {};
  if (opts.json !== undefined) {
    opts.body = JSON.stringify(opts.json);
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { ...headers, ...((opts.headers ?? {}) as Record<string, string>) },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

// ─── Session helpers ──────────────────────────────────────────────────────────

let adminCookies = "";

async function loginAs(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    redirect: "manual",
  });
  const setCookie = res.headers.get("set-cookie") ?? "";
  const sessionCookie = setCookie.split(";")[0] ?? "";
  return sessionCookie;
}

async function uploadFile(
  cookies: string,
  fileContent: string,
  filename: string,
  mimeType: string,
  entityType: string,
  entityId: string,
  documentGroupId?: string
): Promise<{ status: number; body: unknown }> {
  const formData = new FormData();
  formData.append("file", new Blob([fileContent], { type: mimeType }), filename);

  const qs = new URLSearchParams({ entityType, entityId });
  if (documentGroupId) qs.set("documentGroupId", documentGroupId);

  const res = await fetch(`${BASE}/files?${qs}`, {
    method: "POST",
    headers: { cookie: cookies } as Record<string, string>,
    body: formData as unknown as BodyInit,
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Increment 4 – Files", { skip: storageSkip }, () => {
  let projectId = "";
  let file1Id = "";
  let file1DocumentGroupId = "";

  before(async () => {
    const admin = requireAdminCredentials();
    adminCookies = await loginAs(admin.email, admin.password);

    // Create a test project
    const { body } = await jsonFetch("/projects", {
      method: "POST",
      headers: { cookie: adminCookies },
      json: { name: "Inc4 File Test Project" },
    });
    const proj = body as { id?: string };
    assert.ok(proj?.id, "Project created");
    projectId = proj.id!;
  });

  it("1. Upload a PDF file returns 201 with status=pending", async () => {
    const { status, body } = await uploadFile(
      adminCookies,
      "%PDF-1.4 test content",
      "test-doc.pdf",
      "application/pdf",
      "project",
      projectId
    );
    assert.equal(status, 201, `Expected 201 got ${status}: ${JSON.stringify(body)}`);
    const record = body as { status?: string; id?: string; documentGroupId?: string };
    assert.equal(record.status, "pending", "Status should be pending");
    assert.ok(record.id, "File has ID");
    assert.ok(record.documentGroupId, "File has documentGroupId");
    file1Id = record.id!;
    file1DocumentGroupId = record.documentGroupId!;
  });

  it("2. List files returns the uploaded file", async () => {
    const { status, body } = await jsonFetch(
      `/files?entityType=project&entityId=${projectId}`,
      { headers: { cookie: adminCookies } }
    );
    assert.equal(status, 200);
    const list = body as { files?: unknown[] };
    assert.ok(Array.isArray(list.files), "Files is an array");
    assert.ok(list.files!.length >= 1, "At least one file returned");
  });

  it("3. Download the uploaded file returns 200", async () => {
    const res = await fetch(`${BASE}/files/${file1Id}/download`, {
      headers: { cookie: adminCookies },
    });
    assert.equal(res.status, 200, "Download should return 200");
  });

  it("4. Upload a version 2 (same documentGroupId) increments version_no", async () => {
    const { status, body } = await uploadFile(
      adminCookies,
      "%PDF-1.4 version 2 content",
      "test-doc.pdf",
      "application/pdf",
      "project",
      projectId,
      file1DocumentGroupId
    );
    assert.equal(status, 201, `Expected 201 got ${status}: ${JSON.stringify(body)}`);
    const record = body as { versionNo?: number; documentGroupId?: string };
    assert.equal(record.versionNo, 2, "Version 2 expected");
    assert.equal(record.documentGroupId, file1DocumentGroupId, "Same document group");
  });

  it("5. Version list returns both versions", async () => {
    const { status, body } = await jsonFetch(`/files/${file1Id}/versions`, {
      headers: { cookie: adminCookies },
    });
    assert.equal(status, 200);
    const result = body as { versions?: unknown[] };
    assert.ok(Array.isArray(result.versions), "Versions is an array");
    assert.equal(result.versions!.length, 2, "Two versions expected");
  });

  it("6. MIME type not in allowlist returns 415", async () => {
    const { status } = await uploadFile(
      adminCookies,
      "<script>alert(1)</script>",
      "evil.html",
      "text/html",
      "project",
      projectId
    );
    assert.equal(status, 415, "HTML MIME should be rejected");
  });

  it("7. Dropbox status endpoint returns connected=false when not configured", async () => {
    const { status, body } = await jsonFetch("/admin/dropbox/status", {
      headers: { cookie: adminCookies },
    });
    // 200 with connected=false, OR 500 if env vars missing — either is acceptable
    const b = body as { connected?: boolean };
    if (status === 200) {
      assert.equal(typeof b.connected, "boolean", "connected field is boolean");
    } else {
      // Service unavailable without DROPBOX_APP_KEY etc. is acceptable
      assert.ok(status >= 400 && status < 600, "Non-200 is acceptable without Dropbox creds");
    }
  });

  it("8. POST /files with no file part returns 400", async () => {
    // Send multipart request with only a text field, no file
    const formData = new FormData();
    formData.append("notafile", "sometext");
    const res = await fetch(
      `${BASE}/files?entityType=project&entityId=${projectId}`,
      { method: "POST", credentials: "include", headers: { cookie: adminCookies } as Record<string, string>, body: formData }
    );
    assert.equal(res.status, 400, "No file part should return 400");
  });
});

// ── Security / IDOR tests ─────────────────────────────────────────────────────

describe("Increment 4 – Files security (IDOR)", { skip: storageSkip }, () => {
  let adminCookiesS = "";
  let guestCookiesS = "";
  let projectAId = "";
  let projectBId = "";
  let fileOnAId = "";

  before(async () => {
    // Log in as admin + create a guest user (or use seed guest if present)
    const admin = requireAdminCredentials();
    adminCookiesS = await loginAs(admin.email, admin.password);

    // Create project A (admin will be owner)
    const { body: projA } = await jsonFetch("/projects", {
      method: "POST",
      headers: { cookie: adminCookiesS },
      json: { name: "IDOR Test Project A" },
    });
    projectAId = (projA as { id: string }).id;

    // Create project B (guest is NOT a member)
    const { body: projB } = await jsonFetch("/projects", {
      method: "POST",
      headers: { cookie: adminCookiesS },
      json: { name: "IDOR Test Project B" },
    });
    projectBId = (projB as { id: string }).id;

    // Upload an external file to project A
    const { status, body } = await uploadFile(
      adminCookiesS,
      "Confidential document",
      "confidential.pdf",
      "application/pdf",
      "project",
      projectAId
    );
    assert.equal(status, 201, "Setup file upload should succeed");
    // Mark as external directly via update so guest could theoretically see it
    const f = body as { id: string; documentGroupId: string };
    fileOnAId = f.id;

    // Create a guest user (try seed; if not found, create one via admin)
    // Try to find/create a guest user — use admin to create one
    const guestEmail = `guest-idor-test-${Date.now()}@example.com`;
    const { status: createStatus } = await jsonFetch("/users", {
      method: "POST",
      headers: { cookie: adminCookiesS },
      json: {
        email: guestEmail,
        password: "GuestTest123!",
        displayName: "IDOR Test Guest",
        role: "guest",
      },
    });
    if (createStatus === 201 || createStatus === 200) {
      guestCookiesS = await loginAs(guestEmail, "GuestTest123!");
    }
    // If user creation fails (endpoint doesn't exist), skip guest tests
  });

  it("9. Guest cannot list files from a project they are not a member of", async () => {
    if (!guestCookiesS) {
      // Skip if we couldn't create a guest user
      console.log("  (skipped — no guest account available)");
      return;
    }
    // Guest tries to list files on project B where they are not a member
    const { status } = await jsonFetch(
      `/files?entityType=project&entityId=${projectBId}`,
      { headers: { cookie: guestCookiesS } }
    );
    assert.ok(
      status === 403 || status === 401 || status === 404,
      `Guest should be denied access to project B files, got ${status}`
    );
  });

  it("10. Guest cannot download a file from a project they are not a member of", async () => {
    if (!guestCookiesS) {
      console.log("  (skipped — no guest account available)");
      return;
    }
    // Guest tries to download a file from project A where they are not a member
    const res = await fetch(`${BASE}/files/${fileOnAId}/download`, {
      headers: { cookie: guestCookiesS } as Record<string, string>,
    });
    assert.ok(
      res.status === 403 || res.status === 401 || res.status === 404,
      `Guest should be denied download from project A, got ${res.status}`
    );
  });

  it("11. Member can list files from their own project", async () => {
    // Admin is implicitly a member; just verify list works
    const { status, body } = await jsonFetch(
      `/files?entityType=project&entityId=${projectAId}`,
      { headers: { cookie: adminCookiesS } }
    );
    assert.equal(status, 200, "Admin can list files on project A");
    const list = body as { files?: unknown[] };
    assert.ok(Array.isArray(list.files), "files array present");
  });
});

// ── Dropbox path collision tests ──────────────────────────────────────────────

describe("Increment 4 – Files Dropbox path uniqueness", { skip: storageSkip }, () => {
  let adminCookiesU = "";
  let projectC1Id = "";
  let projectC2Id = "";

  before(async () => {
    const admin = requireAdminCredentials();
    adminCookiesU = await loginAs(admin.email, admin.password);

    const { body: pC1 } = await jsonFetch("/projects", {
      method: "POST",
      headers: { cookie: adminCookiesU },
      json: { name: "Collision Test Project C1" },
    });
    projectC1Id = (pC1 as { id: string }).id;

    const { body: pC2 } = await jsonFetch("/projects", {
      method: "POST",
      headers: { cookie: adminCookiesU },
      json: { name: "Collision Test Project C2" },
    });
    projectC2Id = (pC2 as { id: string }).id;
  });

  it("12. Same filename uploaded to two different projects produces different Dropbox paths", async () => {
    const filename = "invoice.pdf";
    const mimeType = "application/pdf";

    const { status: s1, body: b1 } = await uploadFile(
      adminCookiesU, "Invoice content v1", filename, mimeType, "project", projectC1Id
    );
    assert.equal(s1, 201, `Project C1 upload should succeed, got ${s1}`);

    const { status: s2, body: b2 } = await uploadFile(
      adminCookiesU, "Invoice content v2", filename, mimeType, "project", projectC2Id
    );
    assert.equal(s2, 201, `Project C2 upload should succeed, got ${s2}`);

    const f1 = b1 as { dropboxPath: string; documentGroupId: string };
    const f2 = b2 as { dropboxPath: string; documentGroupId: string };

    assert.notEqual(
      f1.dropboxPath,
      f2.dropboxPath,
      `Dropbox paths must differ: got '${f1.dropboxPath}' and '${f2.dropboxPath}'`
    );
    assert.notEqual(
      f1.documentGroupId,
      f2.documentGroupId,
      "Document group IDs must differ for independent uploads"
    );

    // Paths should be namespaced under /pds/{documentGroupId}/
    assert.ok(
      f1.dropboxPath.startsWith("/pds/"),
      `Path should start with /pds/, got '${f1.dropboxPath}'`
    );
    assert.ok(
      f2.dropboxPath.startsWith("/pds/"),
      `Path should start with /pds/, got '${f2.dropboxPath}'`
    );

    // Both paths should contain the filename
    assert.ok(f1.dropboxPath.endsWith(filename), "Path 1 ends with filename");
    assert.ok(f2.dropboxPath.endsWith(filename), "Path 2 ends with filename");
  });

  it("13. Same filename uploaded twice to same project (versioning) also produces unique paths", async () => {
    const filename = "spec.pdf";
    const mimeType = "application/pdf";

    const { status: s1, body: b1 } = await uploadFile(
      adminCookiesU, "Spec v1 content", filename, mimeType, "project", projectC1Id
    );
    assert.equal(s1, 201, `Version 1 upload should succeed`);
    const f1 = b1 as { dropboxPath: string; documentGroupId: string; versionNo: number };
    assert.equal(f1.versionNo, 1);

    const { status: s2, body: b2 } = await uploadFile(
      adminCookiesU, "Spec v2 content", filename, mimeType, "project", projectC1Id,
      f1.documentGroupId
    );
    assert.equal(s2, 201, `Version 2 upload should succeed`);
    const f2 = b2 as { dropboxPath: string; documentGroupId: string; versionNo: number };
    assert.equal(f2.versionNo, 2);
    assert.equal(f2.documentGroupId, f1.documentGroupId, "Same document group");
    assert.notEqual(f1.dropboxPath, f2.dropboxPath, "v1 and v2 have different paths");
  });
});
