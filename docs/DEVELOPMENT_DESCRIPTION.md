# Development description

Audit date: 2026-08-20

## Repository topology

This is a pnpm workspace with nine projects: the root orchestration package,
Express API, React SPA, database library, OpenAPI specification, generated Zod
schemas, generated React client, tests, and scripts.

```text
React 19 / Vite / TanStack Query
        | same-origin session cookie
Express 5 API (114 operations)
        | Drizzle + pg
PostgreSQL 16
        |
App Storage or local staging -> transfer job -> Dropbox archive
```

Important paths:

| Path | Responsibility |
|---|---|
| `artifacts/api-server/src/app.ts` | Middleware and API composition |
| `artifacts/api-server/src/routes/` | HTTP parsing/validation/serialization |
| `artifacts/api-server/src/services/` | Business logic, authorization and transactions |
| `artifacts/api-server/src/jobs/` | In-process transfer worker |
| `artifacts/api-server/src/storage/` | Staging and Dropbox adapters/OAuth |
| `artifacts/pds-app/src/` | React application and bilingual UI |
| `lib/db/src/schema/` | 27 Drizzle table definitions |
| `lib/db/drizzle/` | Versioned SQL migration baseline and ledger metadata |
| `lib/api-spec/openapi.yaml` | API contract source |
| `tests/` | Unit, integration and Playwright suites |

## Request and security pipeline

The API configures proxy trust, Helmet, a credentialed CORS allowlist, an Origin /
`Sec-Fetch-Site` guard for unsafe requests, body limits, structured redacted logs,
PostgreSQL sessions and centralized JSON errors. Production cookies are `HttpOnly`,
`SameSite=Lax` and `Secure`. Passwords use Argon2id; high-entropy invitation/reset
tokens are stored as hashes; the Dropbox refresh token is AES-256-GCM encrypted.

The intended invariant is `route -> service -> authorize/requireProjectAccess ->
transaction -> activity event`. The audit found route-level DB access and several
mutations/side effects that do not satisfy that invariant; the architecture text
must therefore be treated as target policy, not proven global behavior.

## Representative end-to-end traces

| Domain | Write trace | Read/output trace and audited boundary |
|---|---|---|
| Identity | `pages/login.tsx` -> `POST /api/auth/login` (`routes/auth.ts:48-93`) -> user lookup/Argon2 -> session regenerate/save -> PostgreSQL session + audit/last-login | `GET /api/auth/me` hydrates auth guards/query cache. Current login success side effects precede durable session save (`AUD-043`) |
| Project/task/comment | `project-detail.tsx`/`tasks.tsx`/`comment-thread.tsx` -> project/task/comment routes -> Zod service -> `requireProjectAccess` -> project/task/comment tables; selected writes emit activity and mentions/assignment notifications | Project/task/comment GET/list services project/filter rows -> public JSON -> TanStack cache/UI. Subtree, assignment and event atomicity exceptions are `AUD-004`, `008`, `015` |
| Files | `file-panel.tsx` multipart -> `POST /api/files` (`routes/files.ts:73-123`) -> `uploadFile` membership/MIME/size/hash -> staging adapter -> file + activity transaction -> scheduled transfer -> Dropbox | list/version/download routes -> membership -> DB metadata -> staging/Dropbox stream. Group scope, transfer and delete boundaries are `AUD-006`, `016`–`018`, `047` |
| CRM | `clients.tsx`/`client-detail.tsx` -> client/contact routes (`routes/clients.ts:23-85`) -> client service authorization -> client/contact tables | Client GET/list projects public/client fields into UI; linked-project projection misses membership filtering (`AUD-005`) |
| Knowledge | `pages/kb.tsx` -> KB routes (`routes/kb.ts:25-104`) -> KB service -> article/version transaction and optional publish/archive | List/article/version/search -> project access -> rendered sanitized Markdown. Write policy, parent move and version allocation are unresolved (`AUD-044`) |
| Journal/chronicle | `pages/journal.tsx` and project log writes -> journal/log services -> log/activity tables | Journal filters/cursor -> timeline JSON; chronicle queries project/tasks/files/participants/log/activity -> Markdown/PDF. Cursor/collapse/export completeness are `AUD-019`, `023` and `CALC-010` |
| Chat/notifications | `pages/chat.tsx` -> conversation/message routes (`routes/conversations.ts:123-174`) -> conversation service -> message/conversation/notification writes | Poll/list -> membership checks -> messages/unread/due-task output. Uniqueness/cursor/read-marker and stale-membership findings are `AUD-022`, `036` |
| Administration | Admin users/settings UI -> admin routes -> user/settings services or direct DB -> audit call | Admin list/audit CSV/settings JSON -> browser. Secret/public DTO, last-admin, deletion, CSV and audit-order findings are `AUD-001`–`003`, `015`, `035`, `046` |

These traces describe observed paths and explicitly retain the points where the
code deviates from the intended thin-route/transaction/event architecture.

## Contracts and generated code

The contract flow is OpenAPI -> Orval/Zod/generated React client. A parity script
checks only Express method/path inventory. At the baseline it passes 114/114, but
it does not validate schemas, auth declarations, canonical errors, response
conformance, or that raw-fetch consumers match the contract.

## Configuration and dependency management

Runtime configuration is validated centrally from environment variables, including
database/session/application URLs, CORS, SMTP, storage limits and production-only
requirements. Secrets must remain in the platform environment or encrypted setting
path, not committed files. pnpm is mandatory; the lockfile is frozen in CI, peer
auto-install is disabled, package release age is delayed, install scripts are
allowlisted and selected transitive security overrides are pinned. The audit found
that the current `nanoid` override is now vulnerable and that the shipped frontend
graph is not fully represented by `pnpm audit --prod`.

## Storage lifecycle

Upload validates MIME/size, buffers content, computes SHA-256 and Dropbox content
hashes, stores a staging object, and creates file/activity rows. An in-process job
reads pending rows and uploads to Dropbox. The audit found missing document-group
scope constraints, non-durable/multi-instance transfer claims, adapter mismatch,
non-idempotent crash boundaries and incomplete Dropbox deletion. Until those are
closed, the storage lifecycle is not commercially reliable.

## Database and migrations

PostgreSQL is required. Versioned SQL and Drizzle's ledger are the intended schema
authority. The legacy-adoption path validates only a subset of the 27-table
baseline, and the session middleware can create a table at application startup.
Migration adoption, production startup privileges and restore evidence are release
gates.

## Development commands and audit evidence

| Command | 2026-08-20 result | Scope |
|---|---|---|
| `pnpm install --frozen-lockfile` | PASS after adding Git `sh` to `PATH` | Frozen dependency graph and workspace policy |
| `pnpm run lint` | PASS | ESLint/static rules |
| `pnpm run typecheck` | PASS | All workspace TypeScript projects |
| `pnpm --filter @workspace/api-server run test:access` | PASS, 15/15 | Authorization matrix only |
| `pnpm run openapi:parity` | PASS, 114/114 | Method/path inventory only |
| `pnpm run test` | FAIL, 34/35 | Windows `spawnSync("pnpm")` resolves no executable; other tests passed |
| `pnpm --filter @workspace/api-server run build` | PASS | API build only |
| `pnpm run build` | FAIL | Windows Rollup optional binary deliberately absent |
| `pnpm audit --prod` | FAIL | One current high-severity `nanoid` advisory |
| integration / e2e | BLOCKED | No Docker, PostgreSQL, seeded API or browser runtime |

Windows requires the bundled Node/pnpm paths and Git `sh` on `PATH`. The root
preinstall script is POSIX-specific; the unit env-bootstrap test invokes `pnpm`
instead of `pnpm.cmd`; and workspace policy omits Windows Rollup optional binaries.
These are portability failures, not evidence of application correctness failure.

## Test strategy and gaps

CI defines quality, contract, PostgreSQL integration, Playwright and secret-scan
jobs. The latest observed public run at the baseline commit was green, but it is
historical evidence and predates the advisory's latest update/current registry
result. Existing unit tests cover
environment, errors, origin guard, i18n and content hashing; access tests cover
the central matrix. Material gaps include concurrency/idempotency, cross-project
lists and file groups, stage reorder, reset/invite races, chat cursors, full
chronicle export, storage reconciliation/deletion, restore drills, semantic
OpenAPI conformance, load, accessibility and multi-instance workers.

## Execution, deployment and observability

Development runs the API and Vite SPA separately; production artifacts are defined
for Replit and PostgreSQL is mandatory. SMTP is required in production. Readiness
checks the database with a timeout; Pino HTTP/application logs redact sensitive
headers/query strings. There is no proven metrics/tracing/frontend error-reporting,
alerting/on-call or durable worker dashboard. Compose supplies PostgreSQL/Mailpit
for development, not a complete app distribution. Exact startup/deploy commands
remain provider-specific.

## Technical constraints and debt

- Single-tenant/global-role/global-setting assumptions are pervasive.
- Route files sometimes access DB/business logic directly despite the thin-route
  rule; activity/audit/notification atomicity is inconsistent.
- Materialized project paths, derived sequence/version counters and polymorphic
  entity references lack sufficient DB invariants.
- The transfer worker is in-process; complete file backup/delete/reconciliation is
  not established.
- Windows bootstrap/test/frontend build portability is not green.
- API path parity is stronger than semantic contract/typed-client coverage.

## Sources of truth

When documents conflict, use this order: executable schema/code and current
verification evidence; `docs/PROJECT_AUDIT_STATUS.md`; structured audit register;
then historical `PROJECT_STATUS.md`, `NEXT_TASKS.md` and older reports. Never turn
a historical PASS into current release evidence.
