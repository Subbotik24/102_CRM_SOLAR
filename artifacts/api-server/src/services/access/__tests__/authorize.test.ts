/**
 * Authorization gateway tests — deny-by-default contract.
 * Run: pnpm --filter @workspace/api-server run test:access
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { authorize, ForbiddenError, type Action } from "../index.js";
import type { User } from "@workspace/db";

function makeUser(role: User["role"]): User {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    email: `${role}@example.com`,
    passwordHash: "hash",
    displayName: role,
    position: null,
    descriptionMd: null,
    role,
    locale: "uk",
    timezone: "Europe/Kyiv",
    status: "active",
    lastLoginAt: null,
    avatarKey: "1",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function allows(role: User["role"], action: Action, resource?: Parameters<typeof authorize>[2]) {
  assert.doesNotThrow(
    () => authorize(makeUser(role), action, resource),
    `expected ${role} to be allowed: ${action}`
  );
}

function denies(role: User["role"], action: Action, resource?: Parameters<typeof authorize>[2]) {
  assert.throws(
    () => authorize(makeUser(role), action, resource),
    ForbiddenError,
    `expected ${role} to be denied: ${action}`
  );
}

const ALL_ACTIONS: Action[] = [
  "admin:access", "audit:view", "user:manage", "deletion:resolve",
  "project:create", "project:read", "project:update", "project:delete", "project:archive",
  "task:create", "task:read", "task:update", "task:delete",
  "client:read", "client:update", "client:archive",
  "comment:create", "comment:read",
  "file:upload", "file:download",
  "kb:read", "kb:write",
  "chat:read", "chat:write",
];

test("admin is allowed every defined action", () => {
  for (const action of ALL_ACTIONS) allows("admin", action);
});

test("manager: allowed project CRUD + archive", () => {
  allows("manager", "project:create");
  allows("manager", "project:read");
  allows("manager", "project:update");
  allows("manager", "project:delete");
  allows("manager", "project:archive");
});

test("manager: allowed all task actions including delete", () => {
  allows("manager", "task:create");
  allows("manager", "task:read");
  allows("manager", "task:update");
  allows("manager", "task:delete");
});

test("manager: allowed all client actions", () => {
  allows("manager", "client:read");
  allows("manager", "client:update");
  allows("manager", "client:archive");
});

test("manager: allowed chat, files, kb, comments", () => {
  allows("manager", "chat:read");
  allows("manager", "chat:write");
  allows("manager", "file:upload");
  allows("manager", "file:download");
  allows("manager", "kb:read");
  allows("manager", "kb:write");
  allows("manager", "comment:create");
  allows("manager", "comment:read");
});

test("manager: denied all admin-only actions", () => {
  denies("manager", "admin:access");
  denies("manager", "audit:view");
  denies("manager", "user:manage");
});

test("member: allowed project:read and most task actions", () => {
  allows("member", "project:read");
  allows("member", "task:create");
  allows("member", "task:read");
  allows("member", "task:update");
});

test("member: denied project create/update/delete/archive", () => {
  denies("member", "project:create");
  denies("member", "project:update");
  denies("member", "project:delete");
  denies("member", "project:archive");
});

test("member: denied task:delete", () => {
  denies("member", "task:delete");
});

test("member: allowed client:read, denied client:update/archive", () => {
  allows("member", "client:read");
  denies("member", "client:update");
  denies("member", "client:archive");
});

test("member: denied all admin-only actions", () => {
  denies("member", "admin:access");
  denies("member", "audit:view");
  denies("member", "user:manage");
});

test("member: allowed chat, files, kb, comments", () => {
  allows("member", "chat:read");
  allows("member", "chat:write");
  allows("member", "file:upload");
  allows("member", "file:download");
  allows("member", "kb:read");
  allows("member", "kb:write");
  allows("member", "comment:create");
  allows("member", "comment:read");
});

test("guest: denied every action without an explicit project assignment", () => {
  for (const action of ALL_ACTIONS) denies("guest", action);
});

const assignedProject = { kind: "project" as const, projectId: "project-1", isMember: true };
const unassignedProject = { kind: "project" as const, projectId: "project-2", isMember: false };

test("member: assignment is required for project-derived access", () => {
  allows("member", "project:read", assignedProject);
  denies("member", "project:read", unassignedProject);
  allows("member", "task:update", assignedProject);
  denies("member", "task:update", unassignedProject);
});

test("guest: receives only the documented assigned-project exceptions", () => {
  allows("guest", "project:read", assignedProject);
  allows("guest", "task:read", assignedProject);
  allows("guest", "comment:read", { ...assignedProject, visibility: "external" });
  denies("guest", "comment:read", { ...assignedProject, visibility: "internal" });
  allows("guest", "file:download", { ...assignedProject, visibility: "external" });
  denies("guest", "file:upload", { ...assignedProject, visibility: "external" });
  allows("guest", "chat:write", { ...assignedProject, conversation: "project" });
  denies("guest", "chat:read", { ...assignedProject, conversation: "direct" });
  denies("guest", "kb:read", assignedProject);
});
