/**
 * Exact project-membership regression matrix.
 *
 * A parent-project assignment must not leak child projects, and project-derived
 * IDs outside an account's assignments must behave as not found.  This test
 * intentionally uses the public invitation flow so it exercises account roles,
 * membership roles, sessions, lists, and direct resource routes together.
 */
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD } from "./testCredentials";

const API = process.env.API_URL ?? "http://localhost:8080/api";

type Response<T> = { status: number; body: T };

async function request<T>(path: string, init: RequestInit = {}): Promise<Response<T>> {
  const response = await fetch(`${API}${path}`, init);
  return { status: response.status, body: await response.json().catch(() => ({})) as T };
}

async function login(email: string, password: string): Promise<string> {
  const response = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json().catch(() => ({})) as { error?: string };
  const { status } = response;
  assert.equal(status, 200, `login failed: ${body.error ?? status}`);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie, "login must establish a session cookie");
  return cookie;
}

async function post<T>(path: string, body: unknown, cookie: string): Promise<Response<T>> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify(body),
  });
}

async function inviteAndAccept(role: "member" | "guest", adminCookie: string): Promise<{ id: string; cookie: string }> {
  const email = `access-${role}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
  const password = `Matrix-${randomUUID()}!`;
  const invitation = await post<{ token?: string }>("/admin/invitations", { email, role, locale: "uk" }, adminCookie);
  assert.equal(invitation.status, 201, `creating ${role} invitation must succeed`);
  assert.ok(invitation.body.token, "integration console delivery must expose the one-time invitation token");
  const accepted = await request<{ id: string }>("/auth/invite/accept", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: invitation.body.token, displayName: `Access ${role}`, password }),
  });
  assert.equal(accepted.status, 201, `accepting ${role} invitation must succeed`);
  return { id: accepted.body.id, cookie: await login(email, password) };
}

describe("exact project membership", () => {
  let adminCookie = "";
  let memberCookie = "";
  let guestCookie = "";
  let memberId = "";
  let guestId = "";
  let projectA = "";
  let childA = "";
  let projectB = "";
  let taskA = "";

  before(async () => {
    adminCookie = await login(TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD);
    const suffix = Date.now();
    const a = await post<{ id: string }>("/projects", { name: `Access A ${suffix}` }, adminCookie);
    const child = await post<{ id: string }>("/projects", { name: `Access child ${suffix}`, parentId: a.body.id }, adminCookie);
    const b = await post<{ id: string }>("/projects", { name: `Access B ${suffix}` }, adminCookie);
    assert.equal(a.status, 201); assert.equal(child.status, 201); assert.equal(b.status, 201);
    projectA = a.body.id; childA = child.body.id; projectB = b.body.id;

    const task = await post<{ id: string }>(`/projects/${projectA}/tasks`, { title: "assigned task" }, adminCookie);
    assert.equal(task.status, 201);
    taskA = task.body.id;
    assert.equal((await post(`/projects/${projectA}/stages`, { name: "assigned stage" }, adminCookie)).status, 201);

    const member = await inviteAndAccept("member", adminCookie);
    memberId = member.id; memberCookie = member.cookie;
    const guest = await inviteAndAccept("guest", adminCookie);
    guestId = guest.id; guestCookie = guest.cookie;

    assert.equal((await post(`/projects/${projectA}/members`, { userId: memberId, role: "member" }, adminCookie)).status, 201);
    assert.equal((await post(`/projects/${projectA}/members`, { userId: guestId, role: "viewer" }, adminCookie)).status, 201);
  });

  it("filters project lists and hides unassigned direct IDs, including child projects", async () => {
    const memberList = await request<{ projects: Array<{ id: string }> }>("/projects", { headers: { cookie: memberCookie } });
    assert.equal(memberList.status, 200);
    assert.deepEqual(memberList.body.projects.map((p) => p.id).filter((id) => [projectA, childA, projectB].includes(id)), [projectA]);
    for (const id of [childA, projectB]) {
      assert.equal((await request(`/projects/${id}`, { headers: { cookie: memberCookie } })).status, 404);
      assert.equal((await request(`/projects/${id}/tasks`, { headers: { cookie: memberCookie } })).status, 404);
    }
  });

  it("allows only assigned-project workflows for members", async () => {
    assert.equal((await request(`/projects/${projectA}`, { headers: { cookie: memberCookie } })).status, 200);
    assert.equal((await request(`/tasks/${taskA}`, { headers: { cookie: memberCookie } })).status, 200);
    assert.equal((await post(`/projects/${projectB}/tasks`, { title: "IDOR" }, memberCookie)).status, 404);
  });

  it("enforces the guest exception set and viewer-only membership metadata", async () => {
    assert.equal((await request(`/projects/${projectA}`, { headers: { cookie: guestCookie } })).status, 200);
    assert.equal((await request(`/projects/${projectA}/tasks`, { headers: { cookie: guestCookie } })).status, 200);
    assert.equal((await request(`/projects/${projectA}/stages`, { headers: { cookie: guestCookie } })).status, 200);
    assert.equal((await request(`/projects/${projectA}/kb`, { headers: { cookie: guestCookie } })).status, 403);
    assert.equal((await request(`/projects/${projectA}/log-entries`, { headers: { cookie: guestCookie } })).status, 403);
    assert.equal((await post(`/projects/${projectA}/tasks`, { title: "guest mutation" }, guestCookie)).status, 403);
    assert.equal((await request(`/projects/${projectB}`, { headers: { cookie: guestCookie } })).status, 404);
    assert.equal((await request(`/projects/${projectB}/log-entries`, { headers: { cookie: guestCookie } })).status, 404);
    assert.equal((await post(`/projects/${projectB}/tasks`, { title: "IDOR" }, guestCookie)).status, 404);
    assert.equal((await post(`/projects/${projectB}/members`, { userId: guestId, role: "member" }, adminCookie)).status, 400);
  });
});
