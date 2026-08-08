# PDS Security Best-Practices Review

## Executive summary

PDS has a sound baseline for a small invite-only team: PostgreSQL-backed
sessions, Argon2 password verification, session regeneration, a deny-by-default
role gateway, Zod validation, authentication/invitation rate limits, Helmet,
restricted credentialed CORS, sanitized Markdown, and an append-only audit log.
No critical authentication bypass, SQL injection, stored XSS, or
unauthenticated administrative route was confirmed. However, the role gateway
does not enforce project membership and several project-scoped services return
records without a resource-level check. This is the principal open security
risk.

The July/August 2026 stabilization added centralized Origin validation for unsafe
browser requests, explicit JSON/form parser limits, production token-log
redaction, bounded PostgreSQL readiness, explicit dependency-build approvals,
and patched production dependency resolutions. The current production
dependency audit reports no known vulnerabilities. Other residual risks are
operational: SMTP delivery is not implemented, the proxy topology and storage
integrations require production-like validation, and schema evolution still
lacks a migration ledger.

## High severity

### SEC-000 — Project membership is not consistently enforced

**Status: open.**

- **Location:** `artifacts/api-server/src/services/access/index.ts`,
  `services/projects/index.ts`, `services/tasks/index.ts`, `services/kb/index.ts`,
  and project/task routes.
- **Evidence:** `authorize(user, action, _resource)` ignores `_resource` and
  grants members project/task/KB actions by organization role alone.
  `listProjects()` returns all projects and task/KB reads do not verify that a
  member belongs to the owning project. Files and guest comments contain their
  own membership checks, demonstrating a conflicting access model. Guest file
  upload is additionally blocked by the central role gate before its guest
  visibility restriction can run.
- **Impact:** a member can read project, task, knowledge-base, journal, or
  related data outside their assigned projects when an endpoint relies only on
  the role gate. Guest behavior described by the product brief is partly
  unreachable. This conflicts with the documented project-scoped member/guest
  model.
- **Recommended fix:** decide and document the resource model, then enforce
  project membership in service-layer helpers for every project-derived
  resource. Add negative HTTP integration tests using two projects and two
  users before changing the broad role matrix. Treat non-membership as not
  found where entity enumeration is a concern.
- **Risk of change:** high. Authorization behavior spans projects, tasks,
  comments, files, KB, journal, chat, and guest workflows; a piecemeal role
  switch change could either preserve leakage or block legitimate access.

## Medium severity

### SEC-001 — Explicit Origin validation for cookie-authenticated writes

**Status: resolved for modern browsers; CSRF token remains optional
defense-in-depth.**

- **Location:** `artifacts/api-server/src/middleware/originProtection.ts`,
  registered before parsers and sessions in `artifacts/api-server/src/app.ts`.
- **Evidence:** unsafe methods with a browser `Origin` are accepted only when
  the origin matches the request origin, `APP_URL`, or `CORS_ORIGINS`.
  Origin-less CLI/integration traffic remains supported.
- **Tests:** `tests/unit/security-hardening.test.ts`; runtime integration
  validation is part of the release matrix.
- **Residual:** non-browser clients can omit `Origin` by design. This is safe
  only because an attacker cannot set the victim's HttpOnly session cookie in a
  separate non-browser client. A per-session CSRF token could be added later
  for stronger defense in depth.

### SEC-002 — One-time account-token delivery

**Status: production logging fixed; production delivery remains blocked.**

- **Location:** `artifacts/api-server/src/lib/accountLinkDelivery.ts` and the
  invitation/password-reset services.
- **Evidence:** raw links are logged only when delivery is `console` and
  `NODE_ENV !== "production"`. Production logs contain event metadata but no
  bearer token.
- **Residual:** no SMTP provider is wired up. Production invitation and reset
  delivery must remain a release gate, not silently fall back to logs.

### SEC-003 — Patched production dependency graph

**Status: resolved.**

- **Location:** targeted pnpm overrides in `pnpm-workspace.yaml` and
  `pnpm-lock.yaml`.
- **Evidence:** `gaxios` and `teeny-request` resolve to patched `uuid@11.1.1`;
  `express-rate-limit` resolves to `ip-address@10.3.1`; `sanitize-html` resolves
  to `postcss@8.5.23` and `nanoid@3.3.17`. `pnpm audit --prod` reports no known
  vulnerabilities.
- **Residual:** real Replit App Storage behavior must still be exercised in its
  infrastructure before production.

## Low severity

### SEC-004 — Explicit request parser limits

**Status: resolved.**

- **Location:** `artifacts/api-server/src/app.ts`.
- **Evidence:** JSON is limited to `256kb`; URL-encoded bodies to `64kb` and
  1,000 parameters. Multipart limits remain independently enforced by the file
  route.

### SEC-005 — Liveness and PostgreSQL readiness

**Status: resolved for the core dependency.**

- **Location:** `artifacts/api-server/src/routes/health.ts` and
  `artifacts/api-server/src/services/health/index.ts`.
- **Evidence:** `/healthz` remains process liveness; `/readyz` performs a
  one-second bounded PostgreSQL `SELECT 1` and returns `503` on failure.
- **Residual:** Dropbox and App Storage are intentionally separate release
  checks so optional integration outages do not remove core readiness.

### SEC-006 — Reverse-proxy trust is fixed to one hop

- **Location:** `artifacts/api-server/src/app.ts:25`.
- **Evidence:** `app.set("trust proxy", 1)` assumes the production proxy topology.
- **Impact:** if deployment topology changes, attacker-controlled forwarded IP/protocol values could affect rate limiting, audit IPs, or secure-cookie behavior.
- **Recommended fix:** document and verify Replit's actual hop topology during release; change this setting only with matching edge configuration.
- **Current documentation:** `docs/OPERATIONS.md`. Verification against the
  actual production edge remains required.

### SEC-007 — Schema evolution lacks a unified migration ledger

- **Location:** `lib/db/drizzle.config.ts`, `artifacts/api-server/src/scripts/migrate-inc4.ts`, `migrate-inc5.ts`, `migrate-inc6.ts`.
- **Evidence:** the base schema uses Drizzle push while later changes use idempotent hand-written scripts, with no migration history table.
- **Impact:** operators cannot reliably prove which schema transitions ran, increasing rollback and recovery risk.
- **Recommended fix:** adopt a versioned, recorded migration workflow before production data volume grows. Do not retrofit or run destructive migrations without a backup and explicit approval.
- **Current mitigation:** `docs/OPERATIONS.md` records the required order,
  backup gate, restore-first rollback, and evidence requirements.

## Existing controls worth preserving

- Central deny-by-default role gateway in `artifacts/api-server/src/services/access/index.ts`;
  preserve its exhaustive switch while adding resource-level enforcement.
- Suspended-session invalidation in `artifacts/api-server/src/middleware/requireAuth.ts`.
- PostgreSQL session storage and hardened cookie flags in `artifacts/api-server/src/app.ts`.
- HTML sanitization in `artifacts/api-server/src/services/kb/index.ts`.
- MIME and byte limits for uploads in `artifacts/api-server/src/routes/files.ts` and `services/files/index.ts`.
- OAuth state validation and encrypted Dropbox refresh-token storage in the Dropbox integration.
- Append-only database protection for `audit_log`.
- Unsafe-method Origin enforcement and explicit body-size limits.
- Separate liveness and bounded PostgreSQL readiness endpoints.
- Production redaction of invitation and password-reset bearer links.
