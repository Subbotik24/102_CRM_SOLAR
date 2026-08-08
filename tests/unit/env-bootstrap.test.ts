import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const testsDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(testsDir, "..");
const apiDir = resolve(repoRoot, "artifacts/api-server");

test("API env bootstrap finds the repository .env from the package working directory", () => {
  const childEnv = { ...process.env };
  delete childEnv.DATABASE_URL;
  delete childEnv.SESSION_SECRET;

  const result = spawnSync(
    "pnpm",
    ["exec", "tsx", "-e", "import('./src/lib/env.ts')"],
    {
      cwd: apiDir,
      env: childEnv,
      encoding: "utf8",
    }
  );

  assert.equal(
    result.status,
    0,
    `env bootstrap failed from API package cwd:\n${result.stderr}`
  );
});
