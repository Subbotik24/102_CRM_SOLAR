# NEXT_TASKS

Prioritized backlog as of 2026-08-08. Problem IDs (A0, A1, C1, …) refer to
[PROJECT_STATUS.md](PROJECT_STATUS.md) §4.

Priority order is: prove it works → make it usable → pay down architecture debt
→ polish.

---

## ✅ Done — 2026-07-26

### ~~1. Stand up PostgreSQL and run the full database path~~ — **COMPLETE**
PostgreSQL 16.14 installed and running locally; schema pushed, all three
migrations applied, admin seeded, real browser login verified, project/task/
journal/KB flows exercised end to end in both locales. Five blocking defects
were found and fixed along the way — see PROJECT_STATUS §4.1 #11–14 and §1.

Local database now in place:
```bash
pg_ctl -D /opt/homebrew/var/postgresql@16 -l /tmp/pg16.log start   # LC_ALL must be set
```
`DATABASE_URL=postgres://subbota@127.0.0.1:5432/pds` is already in `.env`.

---

## P0 — Release blocker

### 0. Enforce project membership for every project-derived resource

Addresses A0 / SEC-000. The role matrix is deny-by-default but organization
roles are not resource authorization: members currently receive broad project,
task and KB reads without a consistent `project_members` check.

- First add negative integration tests with two projects and distinct member/
  guest assignments; cover projects, tasks, stages/checklists, KB, journal,
  comments, files and project chat.
- Add one service-layer resource-access helper that resolves the owning project
  and treats inaccessible records as not found where enumeration matters.
- Preserve manager/admin behavior only if that broad access is an explicit
  product decision; document the decision in ADR.
- Reconcile guest read/comment/file behavior, which is currently split between
  the central role gate and local special cases.

**Done when:** the negative HTTP matrix proves members and guests cannot access
unassigned projects while all intended assigned-project workflows still pass.

## ✅ Done — core proof and stabilization

### ~~2. Stabilize the integration runner~~ — **COMPLETE**

The mutable-database suites now run sequentially, stale global-search cases are
removed while KB/chronicle/log-entry coverage remains, and all Replit App
Storage suites report an explicit infrastructure skip. Current result: 31/31
available integration tests pass.

### ~~3. Separate liveness and database readiness~~ — **COMPLETE**

`/api/healthz` remains the stable process liveness probe. `/api/readyz` performs
a one-second bounded PostgreSQL `SELECT 1` and returns 503 when unavailable.

### ~~3b. Close the gaps the functional audit left open~~ — **COMPLETE 2026-07-27**
From PROJECT_STATUS §4.3 (D3–D7).

- **D7** — already fixed in the uncommitted work from the prior session:
  `createInvitation` throws `ConflictError` both for an existing account and
  for an active pending invitation.
- **D5** — documented in `lib/db/src/schema/project_members.ts`: a comment on
  `projectMemberRoleEnum` explains the two vocabularies are intentionally
  distinct and that a guest account maps to membership role `viewer`.
- **D6** — added `client:read` / `client:update` / `client:archive` to
  `services/access/index.ts` and switched `services/clients/index.ts` and
  `routes/clients.ts` off the reused `project:*` actions. Denials now name
  clients, not projects. Access-matrix test extended (13/13 passing).
- **D4** — comments now render sanitized Markdown like the KB does. Extracted
  the shared renderer to `lib/markdown.ts` (used by both `services/kb` and
  `services/comments`); `listComments` returns a computed `bodyHtml` per row
  (not stored — comments aren't versioned like KB articles); `comment-thread.tsx`
  renders it with the same `prose` classes KB already uses.
- **D3** — `/projects/:id/tasks` now accepts optional `limit`/`offset` and
  returns `{ tasks, total }`. Default (no `limit`) is still unbounded, so the
  Kanban board and other full-tree views are unaffected — this is an opt-in
  page, not a silent cap.

Typecheck, build, unit (35/35), access (13/13), integration, and Playwright are
verified green in the 2026-08-08 takeover audit.

### ~~4. Fix the two i18n bugs found in the running app~~ — **COMPLETE 2026-07-27**
Both were seen directly in the browser (PROJECT_STATUS §4.3).

- **D1 — dates ignore the app locale.** Fixed in `journal.tsx`
  (`formatDate`/`formatMonth` now take an explicit `locale` derived from
  `i18n.language`) and in the three other components that called
  `toLocaleString()` with no locale argument: `notification-bell.tsx`,
  `comment-thread.tsx`, `admin-audit-log.tsx`.
- **D2 — task status codes are not localized.** `journal.tsx`'s `EventRow` now
  looks `from`/`to` status codes up in the `tasks`/`projects` i18n namespaces
  (`status.todo` etc.) before interpolating them into the event sentence.

Verified: typecheck, build, i18n parity, and live `uk`/`cs` browser switching are
green in the 2026-08-08 takeover audit.

---

## P1 — Make the system usable by real people

### 5. Implement email delivery
Addresses C1 — **the largest remaining operational blocker after resource
authorization.** Invitations and
password resets currently only reach the server log, so no invited user can be
onboarded without an operator reading logs.

- Implement the `smtp` branch of `EMAIL_PROVIDER` (`SMTP_URL`, `EMAIL_FROM` are
  already in the env schema)
- Wire it into the invite flow (`services/admin/users.ts`, `routes/invite.ts`)
  and password reset (`services/admin/passwordReset.ts`)
- Use the existing `emails` i18n namespace — templates must render in `uk`/`cs`
  per the recipient's locale
- Keep `console` as the default so local development needs no mail server
- The public `/reset-password` form now exists in both locales and has
  Playwright regression coverage; delivery is the missing link.

**Done when:** an invite sent from the admin UI arrives as an email and the link
completes the accept flow.

### 6. Force a password change for the seeded admin
Addresses C2. The default password `Admin12345` is published in the docs.

- Either add a `mustChangePassword` flag honoured at login, or make the seed
  script refuse to run without `SEED_ADMIN_PASSWORD` set explicitly

### 7. End-to-end verification on a phone
The product targets Ukrainian/Czech engineers on phones, and Czech strings run
10–20% longer than Ukrainian.

- Walk the primary flows at 360 px width **in `cs`**, not `uk`
- Check the Kanban board and calendar specifically — drag-and-drop and
  date pickers are the likeliest touch failures

---

## P2 — Architecture debt

### ~~8. Introduce a typed domain-error hierarchy~~ — **COMPLETE**

`services/errors.ts` now provides typed application errors and safe generic
500 responses; shared route handling lives in `routes/handleError.ts` and is
covered by unit tests. Continue converting any new domain failures to these
types rather than reintroducing raw client-visible errors.

### 9. Reconcile the OpenAPI spec with reality
Addresses A1 and A2.

24 implemented endpoints are missing from `lib/api-spec/openapi.yaml`: all of
KB, chronicle, library, log entries, admin users/audit-log/settings,
invitations, forgot/reset password, profile, `/tasks`, `/users`,
`/projects/members/all`.

- Decide first, and record it in `docs/ADR.md`: is the spec the source of truth,
  or is it retired? Half-maintained is the worst option.
- If it stays: document the missing endpoints, rerun
  `pnpm --filter @workspace/api-spec run codegen`, and migrate the 24 raw-`fetch`
  frontend files onto the generated hooks — one page per commit
- If it is retired: delete it and the codegen packages, and standardize on one
  hand-written typed client

### 10. Consolidate migrations
Addresses A5. Two mechanisms with no history table means nobody can tell what a
given database has applied.

- Move to `drizzle-kit generate` migrations with a history table
- Versioned Drizzle SQL migrations and its ledger are now authoritative.
  Legacy `migrate-inc{4,5,6}.ts` scripts were removed after fresh/adopt checks.

### 11. Finish measuring and splitting the heavy frontend paths
Addresses A7. Route-level lazy loading is now in place, but the production
build still emits a 417 KB home chunk and a 321 KB entry chunk before gzip.

- Measure initial-load and interaction performance on the target phones first
- If needed, isolate dashboard/Recharts code from the first authenticated load
- Treat Vite's four sourcemap-location warnings as build-tooling debt, not a
  runtime failure

---

## P3 — Hardening and hygiene

### 12. CSRF tokens for state-changing requests
Addresses residual C3. Central Origin validation now blocks unsafe browser
requests from untrusted origins and is integration-tested. A per-session CSRF
token is optional additional defense in depth rather than the only protection.

### 13. Move the Dropbox transfer job out of process
Addresses C4. Every Autoscale instance runs its own `setInterval` loop. Use a
DB advisory lock as a minimum, or move to a scheduled job.

### 14. Rate limiting beyond auth
Addresses C5. File upload and chronicle PDF export are the expensive endpoints.

### 15. Add error reporting and monitoring
Addresses C6. The new `middleware/errorHandler.ts` is the natural hook point.

### 16. Documentation cleanup
Addresses B2–B7.

- Historical build/status reports were removed; keep current evidence in
  `PROJECT_STATUS.md` and runnable verification commands.
- Fix `replit.md`: React 19 not 18, Zod 3 not `zod/v4`
- Record the real decisions in `docs/ADR.md`: two-tier storage, deny-by-default
  authorization, events-in-transaction, polling over WebSockets
- Fix the stray indentation in `services/access/index.ts`; remove
  `scripts/src/hello.ts`
- `attached_assets/` was removed from the public baseline. Decide whether
  `.local/secondary_skills/` belongs in the local developer environment.

---

## Suggested starting point

**Task 0 — resource-level authorization.** The system runs, but the existing
role-only tests do not prove project isolation. Close SEC-000 before adding
features or calling the build production-ready. After that, implement email
delivery so invitations and reset links reach real users.
