/**
 * i18n parity test — verifies that all key sets in `uk` and `cs` locales
 * are identical in both directions (no missing key in either locale fails the build).
 *
 * Run with: tsx --test tests/unit/i18n-parity.test.ts
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const LOCALES_DIR = path.resolve(
  import.meta.dirname,
  "../../artifacts/pds-app/src/i18n/locales"
);

const UK_DIR = path.join(LOCALES_DIR, "uk");
const CS_DIR = path.join(LOCALES_DIR, "cs");

function flatKeys(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null) return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    flatKeys(v, prefix ? `${prefix}.${k}` : k)
  );
}

function readNamespace(dir: string, ns: string): Record<string, unknown> {
  const fp = path.join(dir, `${ns}.json`);
  return JSON.parse(fs.readFileSync(fp, "utf8")) as Record<string, unknown>;
}

const namespaces = fs
  .readdirSync(UK_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(".json", ""));

describe("i18n locale parity (uk ↔ cs)", () => {
  for (const ns of namespaces) {
    test(`namespace "${ns}" — cs has all keys from uk`, () => {
      const uk = readNamespace(UK_DIR, ns);
      const cs = readNamespace(CS_DIR, ns);
      const ukKeys = flatKeys(uk).sort();
      const csKeys = flatKeys(cs).sort();

      const missingInCs = ukKeys.filter((k) => !csKeys.includes(k));
      assert.deepEqual(
        missingInCs,
        [],
        `Namespace "${ns}": the following keys exist in uk but are MISSING in cs:\n  ${missingInCs.join("\n  ")}`
      );
    });

    test(`namespace "${ns}" — uk has all keys from cs`, () => {
      const uk = readNamespace(UK_DIR, ns);
      const cs = readNamespace(CS_DIR, ns);
      const ukKeys = flatKeys(uk).sort();
      const csKeys = flatKeys(cs).sort();

      const missingInUk = csKeys.filter((k) => !ukKeys.includes(k));
      assert.deepEqual(
        missingInUk,
        [],
        `Namespace "${ns}": the following keys exist in cs but are MISSING in uk:\n  ${missingInUk.join("\n  ")}`
      );
    });
  }
});
