# CRM Solar project status

**Last verified:** 2026-08-08 on macOS, Node 26, pnpm 11, PostgreSQL 16.

CRM Solar is a self-hosted, single-tenant project-delivery system. Users are
invited; there is no public registration. The supported database workflow is
versioned Drizzle SQL migrations (`pnpm run db:migrate`).

## Verified locally

| Gate | Result |
| --- | --- |
| Lint | PASS — `pnpm run lint` |
| Typecheck | PASS — `pnpm run typecheck` |
| Unit tests | PASS — `pnpm run test` |
| Authorization matrix | PASS — `pnpm --filter @workspace/api-server run test:access` |
| Integration tests | PASS — 35 tests; storage suites skip without configured object storage |
| Build | PASS — `pnpm run build` |
| Production dependency audit | PASS — `pnpm audit --prod` |
| Playwright E2E | PASS — login, project/task, locale, theme and password-reset flows |
| Fresh database migration | PASS — baseline and invitation locale migrations |
| Existing-database adoption | PASS on a local backup copy |

## Security and data invariants now enforced

- `authorize()` is deny-by-default. Members and guests require an explicit
  membership on the requested project; membership never propagates to child
  projects. Inaccessible project-derived IDs return `404`.
- Guests are read-only viewers of explicitly assigned projects, with only the
  permitted external comment/file and project-conversation surface.
- Domain writes and their activity events share one database transaction.
  Failure-injection integration tests prove neither side survives alone.
- Invitation and reset tokens are not returned in SMTP mode and are not logged
  in production. Seed requires a non-logged `SEED_ADMIN_PASSWORD` of 12+ chars.

## Remaining release blockers

1. **OpenAPI contract parity:** 44 implemented route methods still need
   endpoint-specific request/response schemas. `pnpm run openapi:parity`
   intentionally fails until this is complete; generated client coverage is
   therefore incomplete.
2. **Environment-bound verification:** SMTP delivery via Mailpit, file storage,
   Dropbox OAuth, and a fresh Linux clone have not been run in this workstation
   environment.
3. **Public-release action:** no GitHub remote, root commit, push, repository
   settings, or release has been created. These are intentionally pending an
   explicit publication authorization.

## Supported documentation

- [README](README.md) — setup and community entry point
- [Development guide](docs/DEVELOPMENT.md) — local workflows
- [Operations runbook](docs/OPERATIONS.md) — backup, migration and recovery
- [Architecture](docs/ARCHITECTURE.md) and [threat model](docs/THREAT_MODEL.md)

Historical increment reports were removed because they contradicted the current
code and are not part of the public baseline.
