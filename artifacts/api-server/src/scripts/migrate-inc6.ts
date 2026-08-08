/**
 * Increment 6 DB migration: audit_log, password_reset_tokens.
 * Enforces append-only audit_log at DB level.
 * Run with: tsx artifacts/api-server/src/scripts/migrate-inc6.ts
 */
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── password_reset_tokens ────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash  TEXT NOT NULL,
        expires_at  TIMESTAMPTZ NOT NULL,
        used_at     TIMESTAMPTZ,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS prt_user_idx ON password_reset_tokens(user_id)
    `);

    // ── audit_log ─────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
        action      TEXT NOT NULL,
        entity_type TEXT,
        entity_id   UUID,
        meta        JSONB,
        ip_address  TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON audit_log(actor_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS audit_log_action_idx ON audit_log(action)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log(created_at DESC)
    `);

    // ── Append-only enforcement (belt-and-suspenders) ─────────────────────────
    // 1. Revoke UPDATE and DELETE from PUBLIC (removes default grants for all roles)
    await client.query(`REVOKE UPDATE, DELETE ON audit_log FROM PUBLIC`);

    // 2. Add trigger that always raises an exception on UPDATE / DELETE attempts
    //    This protects even if the connecting role has been granted explicit privileges.
    await client.query(`
      CREATE OR REPLACE FUNCTION audit_log_immutable()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'audit_log is append-only — UPDATE and DELETE are not permitted';
      END;
      $$
    `);
    await client.query(`
      DROP TRIGGER IF EXISTS audit_log_no_update ON audit_log;
      CREATE TRIGGER audit_log_no_update
        BEFORE UPDATE ON audit_log
        FOR EACH ROW EXECUTE FUNCTION audit_log_immutable()
    `);
    await client.query(`
      DROP TRIGGER IF EXISTS audit_log_no_delete ON audit_log;
      CREATE TRIGGER audit_log_no_delete
        BEFORE DELETE ON audit_log
        FOR EACH ROW EXECUTE FUNCTION audit_log_immutable()
    `);

    await client.query("COMMIT");
    logger.info("Increment 6 migration complete");
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error({ err }, "Migration failed — rolled back");
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
