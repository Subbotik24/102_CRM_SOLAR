import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedBrowserOrigin } from "../../artifacts/api-server/src/middleware/originProtection";
import { shouldLogRawAccountLink } from "../../artifacts/api-server/src/lib/accountLinkDelivery";
import { checkReadiness } from "../../artifacts/api-server/src/services/health";

test("same-origin and configured browser origins are allowed", () => {
  assert.equal(
    isAllowedBrowserOrigin(
      "https://pds.example",
      "https://pds.example",
      new Set()
    ),
    true
  );
  assert.equal(
    isAllowedBrowserOrigin(
      "https://preview.example",
      "https://pds.example",
      new Set(["https://preview.example"])
    ),
    true
  );
});

test("an untrusted browser origin is rejected", () => {
  assert.equal(
    isAllowedBrowserOrigin(
      "https://attacker.example",
      "https://pds.example",
      new Set(["https://preview.example"])
    ),
    false
  );
});

test("raw account links are logged only in non-production console mode", () => {
  assert.equal(shouldLogRawAccountLink("development", "console"), true);
  assert.equal(shouldLogRawAccountLink("test", "console"), true);
  assert.equal(shouldLogRawAccountLink("production", "console"), false);
  assert.equal(shouldLogRawAccountLink("production", "smtp"), false);
});

test("readiness reports database success, failure, and timeout", async () => {
  assert.equal(await checkReadiness(async () => undefined, 25), true);
  assert.equal(
    await checkReadiness(async () => {
      throw new Error("database unavailable");
    }, 25),
    false
  );
  assert.equal(
    await checkReadiness(
      () => new Promise<void>((resolve) => setTimeout(resolve, 50)),
      5
    ),
    false
  );
});
