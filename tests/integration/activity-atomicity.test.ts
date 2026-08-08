/**
 * Regression coverage for the activity-event transaction invariant.
 *
 * The database trigger is deliberately test-only failure injection: it proves
 * that a failed event insert rolls back the domain write, and that a failed
 * domain write cannot leave an event behind.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { pool } from "@workspace/db";
import { TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD } from "./testCredentials";

const API = process.env.API_URL ?? "http://localhost:8080/api";
const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
const eventFunction = `test_reject_activity_${suffix}`;
const domainFunction = `test_reject_stage_${suffix}`;
const eventTrigger = `test_reject_activity_trigger_${suffix}`;
const domainTrigger = `test_reject_stage_trigger_${suffix}`;

async function login(): Promise<string> {
  const response = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: TEST_ADMIN_EMAIL, password: TEST_ADMIN_PASSWORD }),
  });
  assert.equal(response.status, 200, "test admin must be able to log in");
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie, "login must set a session cookie");
  return cookie;
}

async function post(path: string, body: unknown, cookie: string) {
  return fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify(body),
  });
}

describe("activity events are atomic with domain writes", () => {
  let cookie = "";
  let projectId = "";

  before(async () => {
    cookie = await login();
    const response = await post("/projects", { name: `Atomicity ${suffix}` }, cookie);
    assert.equal(response.status, 201);
    projectId = (await response.json() as { id: string }).id;
  });

  after(async () => {
    await pool.query(`DROP TRIGGER IF EXISTS ${eventTrigger} ON activity_events`);
    await pool.query(`DROP FUNCTION IF EXISTS ${eventFunction}()`);
    await pool.query(`DROP TRIGGER IF EXISTS ${domainTrigger} ON project_stages`);
    await pool.query(`DROP FUNCTION IF EXISTS ${domainFunction}()`);
  });

  it("rolls back a stage when its activity event cannot be inserted", async () => {
    const stageName = `event failure ${suffix}`;
    await pool.query(`CREATE FUNCTION ${eventFunction}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected activity failure'; END; $$`);
    await pool.query(`CREATE TRIGGER ${eventTrigger} BEFORE INSERT ON activity_events FOR EACH ROW EXECUTE FUNCTION ${eventFunction}()`);
    try {
      const response = await post(`/projects/${projectId}/stages`, { name: stageName }, cookie);
      assert.equal(response.status, 500);
      const stages = await pool.query<{ count: string }>("SELECT count(*) FROM project_stages WHERE project_id = $1 AND name = $2", [projectId, stageName]);
      assert.equal(stages.rows[0]?.count, "0", "event failure must roll back the stage insert");
    } finally {
      await pool.query(`DROP TRIGGER IF EXISTS ${eventTrigger} ON activity_events`);
      await pool.query(`DROP FUNCTION IF EXISTS ${eventFunction}()`);
    }
  });

  it("does not leave an activity event when the stage insert fails", async () => {
    const stageName = `domain failure ${suffix}`;
    const beforeCount = await pool.query<{ count: string }>("SELECT count(*) FROM activity_events WHERE project_id = $1 AND event_type = 'stage.created'", [projectId]);
    await pool.query(`CREATE FUNCTION ${domainFunction}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected domain failure'; END; $$`);
    await pool.query(`CREATE TRIGGER ${domainTrigger} BEFORE INSERT ON project_stages FOR EACH ROW EXECUTE FUNCTION ${domainFunction}()`);
    try {
      const response = await post(`/projects/${projectId}/stages`, { name: stageName }, cookie);
      assert.equal(response.status, 500);
      const afterCount = await pool.query<{ count: string }>("SELECT count(*) FROM activity_events WHERE project_id = $1 AND event_type = 'stage.created'", [projectId]);
      assert.equal(afterCount.rows[0]?.count, beforeCount.rows[0]?.count, "domain failure must not leave an activity event");
    } finally {
      await pool.query(`DROP TRIGGER IF EXISTS ${domainTrigger} ON project_stages`);
      await pool.query(`DROP FUNCTION IF EXISTS ${domainFunction}()`);
    }
  });
});
