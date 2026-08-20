# AGENTS.md

Working instructions for Codex in this repository.
Read [README.md](README.md) for setup. For current evidence and release status use
[docs/PROJECT_AUDIT_STATUS.md](docs/PROJECT_AUDIT_STATUS.md); `PROJECT_STATUS.md`
is a historical snapshot and is not a release gate.

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
| `lib/db/src/schema/` | Drizzle schema, 27 modeled application tables |
| `lib/api-spec/openapi.yaml` | API contract; method/path parity is checked separately from schema semantics |
| `artifacts/api-server/src/routes/` | HTTP layer, thin |
| `artifacts/api-server/src/services/` | Business logic + authorization |
| `artifacts/api-server/src/storage/` | App Storage + Dropbox adapters |
| `artifacts/pds-app/src/pages/` | One file per route |
| `artifacts/pds-app/src/i18n/locales/{uk,cs}/` | 12 namespaces each |
| `.agents/memory/` | Notes on past traps (citext, argon2, Orval/Zod, rate-limit IPv6) |
| `docs/audit/` | Current structured findings and the reproducible audit ledger |

## Known state you must account for

- **OpenAPI method/path parity is currently 114/114, but semantic drift remains.**
  The parity script does not validate request/response schemas, security schemes,
  generated-client freshness, or runtime conformance. When changing an endpoint,
  update the contract and generated clients and add semantic contract coverage.
- **Anonymous reset currently bypasses the safe shared error mapping.**
  `routes/auth.ts` returns arbitrary `err.message` from the reset workflow.
  Preserve typed public errors and route unexpected failures through the shared
  safe handler; see `docs/audit/FINDINGS_REGISTER.md` (`AUD-027`).
- **Migrations use versioned SQL plus Drizzle's ledger.** Use `pnpm run
  db:migrate` for new databases and the guarded `db:migrate:adopt` workflow
  only after a verified legacy-database backup.
- **Global search was removed** (commit `c451539`). Treat old search-related prose
  and tests as historical until their current behavior is independently verified.
- **`PROJECT_STATUS.md` is a status snapshot, not a release gate.** Trust the
  repository commands above and the current implementation over historical
  prose when they disagree.

## Verifying work

Integration and e2e tests need PostgreSQL, a seeded database and a running
server. If that infrastructure is unavailable, say so plainly rather than
claiming the suites pass. On Windows, bootstrap needs Git's `sh` on `PATH`, the
unit runner currently has a `pnpm`/`pnpm.cmd` portability failure, and the full
frontend build needs the Windows Rollup optional binary. Do not convert a
platform limitation into a PASS; record it as FAIL or BLOCKED with evidence.
