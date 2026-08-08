# CRM Solar Operations Runbook

This runbook describes the safe deployment, health, backup, recovery, secret
rotation, migration, and rollback procedures for the single-tenant CRM Solar
deployment. Commands that modify a production database must be run only by the
operator after a verified backup.

## Replit topology

The intended production path is:

```text
browser (HTTPS)
  -> Replit edge / TLS termination
  -> application router
       -> Vite static frontend
       -> Express API on :8080 for /api/*
            -> PostgreSQL
            -> Replit App Storage (optional file staging)
            -> Dropbox (optional archive)
```

The API uses `app.set("trust proxy", 1)`. This is correct only while exactly one
trusted Replit proxy supplies `X-Forwarded-*` values. Before each production
release, verify in Replit that:

1. the public frontend and `/api` use the same HTTPS origin;
2. the API receives the public protocol and client address from one trusted hop;
3. the public origin is `APP_URL`, and any separate frontend origins are listed
   explicitly in `CORS_ORIGINS`;
4. direct access to the internal API port is not public.

Do not broaden `trust proxy` or use `true` without confirming the edge topology:
rate limiting, audit IPs, and secure cookies depend on it.

## Health checks

- `GET /api/healthz` is liveness only. It reports whether the Node process can
  answer HTTP and must remain the startup/liveness probe.
- `GET /api/readyz` is readiness. It performs a bounded PostgreSQL `SELECT 1`;
  it returns `200` when the database is available and `503` on failure/timeout.
- Replit App Storage and Dropbox are optional integrations and intentionally do
  not fail core readiness. Validate them separately before a production release.

Local check:

```bash
curl --fail --silent http://127.0.0.1:8080/api/healthz
curl --fail --silent http://127.0.0.1:8080/api/readyz
```

## PostgreSQL backup and restore

Use PostgreSQL 16 client tools matching the server major version. Keep backups
encrypted, access-controlled, and outside the application database.

Create a compressed logical backup:

```bash
pg_dump "$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-acl \
  --file=pds-YYYYMMDD-HHMM.dump
```

Validate the archive without restoring it:

```bash
pg_restore --list pds-YYYYMMDD-HHMM.dump
```

Restore only into a new, empty database first:

```bash
createdb pds_restore_validation
# Required before restore: KB indexes depend on these extension functions.
psql postgres://USER:PASSWORD@HOST:PORT/pds_restore_validation -c "CREATE EXTENSION IF NOT EXISTS citext"
psql postgres://USER:PASSWORD@HOST:PORT/pds_restore_validation -c "CREATE EXTENSION IF NOT EXISTS unaccent"
psql postgres://USER:PASSWORD@HOST:PORT/pds_restore_validation -c "CREATE EXTENSION IF NOT EXISTS pg_trgm"
pg_restore \
  --dbname=postgres://USER:PASSWORD@HOST:PORT/pds_restore_validation \
  --no-owner \
  --no-acl \
  --exit-on-error \
  pds-YYYYMMDD-HHMM.dump
```

After restore, start an API instance pointed at the restored database and check
`/api/readyz`, login, project/task reads, and the audit log. A backup is not
considered verified until this restore drill succeeds. Never restore over the
live database.

## Migrations

CRM Solar uses versioned Drizzle SQL migrations and its migration ledger.
For a new database:

```bash
pnpm run db:migrate
pnpm run db:migrate:status
```

For a legacy database, adoption is a one-time operation. Before adoption:

1. record the release commit;
2. create and validate a backup;
3. verify the backup path and set `DB_MIGRATE_ADOPT_BACKUP` to it;
4. set `DB_MIGRATE_ADOPT_CONFIRM=backup-verified`;
5. run `pnpm run db:migrate:adopt`;
6. run `pnpm run db:migrate:status`, readiness and application smoke tests.

`drizzle-kit push` and the former `migrate-inc*` scripts are not supported
deployment interfaces.

Do not use `drizzle-kit push` as an unreviewed production migration. The scripts
are intended to be idempotent, but their output must still be reviewed.

## Secret rotation

### `SESSION_SECRET`

Changing `SESSION_SECRET` invalidates all current login sessions.

1. Announce a maintenance window and expected forced logout.
2. Generate a new 32-byte-or-longer random value.
3. replace the Replit secret without writing it to source or logs;
4. restart all API instances together so they use one value;
5. verify login/logout and confirm old cookies are rejected;
6. revoke the old value from the secret manager.

### `ENCRYPTION_KEY`

`ENCRYPTION_KEY` protects the stored Dropbox refresh token. Replacing it without
first re-encrypting that token makes the existing Dropbox connection unusable.

Safe current procedure:

1. pause the Dropbox transfer job;
2. disconnect/revoke the existing Dropbox authorization;
3. replace `ENCRYPTION_KEY` with a new high-entropy value;
4. restart the API;
5. reconnect Dropbox so a fresh token is encrypted with the new key;
6. validate one upload/archive/download cycle before resuming transfers.

If continuity without reconnecting is required, implement a versioned
dual-key re-encryption migration first; that capability does not exist today.

## Rollback

Application rollback is commit-based:

1. stop incoming writes or enter a maintenance window;
2. capture logs and the failing release identifier;
3. deploy the last verified commit;
4. restore the matching dependency lockfile;
5. start the API and verify `/healthz` and `/readyz`;
6. run login and read-only project/task smoke tests;
7. re-enable writes.

Database rollback is restore-based because no down-migration chain exists.
Never improvise destructive reverse SQL. If a migration changed persisted data,
restore the verified pre-release backup into a new database, validate it, then
switch `DATABASE_URL` during a controlled outage.

## Release evidence

A release candidate requires recorded PASS results for typecheck, unit tests,
authorization tests, integration tests, production build, dependency audit,
API startup/readiness, and Playwright. Production readiness additionally
requires production-like validation of:

- Replit App Storage upload/download;
- Dropbox OAuth and archive transfer;
- SMTP invitation and password-reset delivery;
- backup restore;
- rollback.

Unavailable infrastructure is reported as `NOT_RUN`, never as PASS.
