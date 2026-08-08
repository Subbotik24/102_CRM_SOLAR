/**
 * Versioned Drizzle migration command.
 *
 * `adopt` is deliberately explicit: it records the baseline only after the
 * operator supplies a path to an existing backup and the expected legacy
 * schema is verified read-only. It never calls `drizzle-kit push`.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "../index";

const here = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const migrationsFolder = resolve(here, "drizzle");
const journal = JSON.parse(readFileSync(resolve(migrationsFolder, "meta/_journal.json"), "utf8")) as {
  entries: Array<{ tag: string; when: number }>;
};

const requiredLegacyTables = [
  "users", "projects", "project_members", "tasks", "project_stages",
  "files", "kb_articles", "audit_log", "password_reset_tokens",
] as const;

function usage(): never {
  throw new Error("Usage: db:migrate [status|adopt]");
}

async function status(): Promise<void> {
  const ledger = await pool.query<{ created_at: string }>(
    `SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY created_at`,
  ).catch(() => ({ rows: [] }));
  const applied = new Set(ledger.rows.map((row) => Number(row.created_at)));
  for (const entry of journal.entries) {
    process.stdout.write(`${applied.has(entry.when) ? "applied" : "pending"}  ${entry.tag}\n`);
  }
}

async function adopt(): Promise<void> {
  const backupPath = process.env.DB_MIGRATE_ADOPT_BACKUP;
  if (!backupPath || !existsSync(backupPath)) {
    throw new Error("Refusing adoption: set DB_MIGRATE_ADOPT_BACKUP to an existing database backup file");
  }
  if (process.env.DB_MIGRATE_ADOPT_CONFIRM !== "backup-verified") {
    throw new Error("Refusing adoption: set DB_MIGRATE_ADOPT_CONFIRM=backup-verified after verifying the backup");
  }

  const present = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    [requiredLegacyTables],
  );
  const found = new Set(present.rows.map((row) => row.table_name));
  const missing = requiredLegacyTables.filter((name) => !found.has(name));
  if (missing.length > 0) {
    throw new Error(`Refusing adoption: database does not match the expected legacy schema (missing ${missing.join(", ")})`);
  }

  const baseline = journal.entries[0];
  if (!baseline) throw new Error("Migration journal has no baseline entry");
  const sql = readFileSync(resolve(migrationsFolder, `${baseline.tag}.sql`), "utf8");
  const hash = createHash("sha256").update(sql).digest("hex");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("CREATE SCHEMA IF NOT EXISTS drizzle");
    await client.query(`CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id serial PRIMARY KEY, hash text NOT NULL, created_at bigint
    )`);
    const current = await client.query<{ created_at: string }>(
      "SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1",
    );
    if (current.rows.length > 0) {
      throw new Error("Refusing adoption: Drizzle migration ledger is already populated");
    }
    await client.query(
      "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)",
      [hash, baseline.when],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  await migrate(db, { migrationsFolder });
  process.stdout.write("Existing database adopted; pending migrations applied.\n");
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "migrate";
  if (command === "migrate") {
    await migrate(db, { migrationsFolder });
    process.stdout.write("Migrations applied.\n");
    return;
  }
  if (command === "status") return status();
  if (command === "adopt") return adopt();
  return usage();
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}).finally(() => pool.end());
