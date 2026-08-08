# AGENTS.md

Working instructions for Codex in this repository.
Read [README.md](README.md) for setup and [PROJECT_STATUS.md](PROJECT_STATUS.md)
for what is actually verified working.

## What this is

PDS — a single-tenant project delivery system for one engineering practice.
pnpm monorepo: Express 5 API + React 19 frontend + PostgreSQL/Drizzle, bilingual
`uk`/`cs`, deployed on Replit. Users are invited, never self-registered.

## Commands

```bash
pnpm install                                     # bootstrap
pnpm run typecheck                               # all packages
pnpm run build                                   # typecheck + build all
pnpm run test                                    # unit tests, no DB needed
pnpm run test:integration                        # needs a running API + seeded DB
pnpm --filter @workspace/api-server run test:access   # authorization matrix
pnpm --filter @workspace/api-server run dev      # API on :8080
pnpm --filter @workspace/pds-app run dev         # app on :5173, proxies /api
```

Always use **pnpm** — a `preinstall` guard rejects npm and yarn.

## Non-negotiable rules

1. **Authorization goes through `authorize()`** in
   `artifacts/api-server/src/services/access/index.ts`. It is deny-by-default
   with an exhaustive switch. Adding an `Action` without an explicit allow
   branch denies it — that is intentional. Never gate access in the UI alone.
2. **Routes stay thin.** `routes/*.ts` does request validation (Zod) and
   delegates. All business logic and every permission check lives in
   `services/*/index.ts`.
3. **PostgreSQL only.** No mock data, no in-memory stores, no fixtures standing
   in for real tables.
4. **Activity events are written in the same transaction** as the change that
   produced them.
5. **Never persist localized strings.** Event payloads store codes; the UI
   renders them from i18n templates.
6. **i18n parity is enforced by a test.** Any key added to
   `artifacts/pds-app/src/i18n/locales/uk/` must be added to `cs/` too, or
   `pnpm run test` fails.
7. **Zod stays on v3.** Orval's generated schemas target the v3 API.

## Where things live

| Path | Contents |
|---|---|
| `lib/db/src/schema/` | Drizzle schema, one file per domain (18 tables) |
| `lib/api-spec/openapi.yaml` | API contract — **currently incomplete, see below** |
| `artifacts/api-server/src/routes/` | HTTP layer, thin |
| `artifacts/api-server/src/services/` | Business logic + authorization |
| `artifacts/api-server/src/storage/` | App Storage + Dropbox adapters |
| `artifacts/pds-app/src/pages/` | One file per route |
| `artifacts/pds-app/src/i18n/locales/{uk,cs}/` | 12 namespaces each |
| `.agents/memory/` | Notes on past traps (citext, argon2, Orval/Zod, rate-limit IPv6) |

## Known state you must account for

- **The OpenAPI spec has drifted.** 24 implemented endpoints are missing from
  `lib/api-spec/openapi.yaml`, so the generated client covers only part of the
  API. 7 frontend files use the generated hooks; 24 use raw `fetch`. When you
  touch an endpoint that *is* in the spec, update the spec and rerun codegen.
  When adding a new one, prefer extending the spec over adding another raw
  `fetch` — but do not silently rewrite existing `fetch` call sites as a side
  effect of an unrelated task.
- **`handleError` in `routes/projects.ts` maps every `Error` to HTTP 400** and
  returns `err.message` to the client. Domain services rely on this for
  validation errors. Do not "fix" it piecemeal — it needs a typed error
  hierarchy, tracked in NEXT_TASKS.md.
- **Migrations use versioned SQL plus Drizzle's ledger.** Use `pnpm run
  db:migrate` for new databases and the guarded `db:migrate:adopt` workflow
  only after a verified legacy-database backup.
- **Global search was removed** (commit `c451539`). `tests/integration/inc5-search.test.ts`
  still exercises the deleted endpoints and will fail. The KB, chronicle and
  log-entry tests in that same file are still valid.
- **`PROJECT_STATUS.md` is a status snapshot, not a release gate.** Trust the
  repository commands above and the current implementation over historical
  prose when they disagree.

## Verifying work

Integration and e2e tests need PostgreSQL, a seeded database and a running
server. If that infrastructure is unavailable, say so plainly rather than
claiming the suites pass. `pnpm run typecheck`, `pnpm run build`, `pnpm run test`
and `test:access` run with no infrastructure and should always be green before
you report a task done.
