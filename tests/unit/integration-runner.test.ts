import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { test } from "node:test";
import {
  createIntegrationEnvironment,
  waitForReady,
} from "../scripts/run-integration.ts";

test("integration runner uses an isolated test API origin", () => {
  const env = createIntegrationEnvironment({ DATABASE_URL: "postgres://example" });

  assert.equal(env.NODE_ENV, "test");
  assert.equal(env.PORT, "18080");
  assert.equal(env.API_URL, "http://127.0.0.1:18080/api");
  assert.equal(env.DATABASE_URL, "postgres://example");
});

test("integration runner waits until readiness reports success", async () => {
  const server = createServer((_req, res) => {
    res.statusCode = 200;
    res.end('{"status":"ready"}');
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  await waitForReady(`http://127.0.0.1:${address.port}/api/readyz`, 500);
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
});
