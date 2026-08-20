# Project improvement roadmap

Baseline: 2026-08-20 audit. This roadmap is dependency- and evidence-driven; it is
not a promise of dates. Finding IDs refer to `audit/FINDINGS_REGISTER.md`.

## Target outcome

Prepare a commercially supportable **managed isolated single-tenant** release:
one customer per API/PostgreSQL/storage data plane, with a minimal control plane
for customer/deployment identity, entitlements, release channel, health and backup
status. Shared multi-tenancy is a later architecture program, not a launch shortcut.

## Gate 0 — Freeze truth and create safe fixtures

- Make `PROJECT_AUDIT_STATUS.md` and the findings register the release baseline.
- Create an isolated PostgreSQL + local/object storage + fake SMTP + Dropbox test
  fixture; define non-production credentials and cleanup ownership.
- Add current CI on Windows and supported production Linux; make bootstrap, unit,
  API and frontend builds deterministic (`AUD-031`).
- Replace weak console-PASS/fallback/early-return integration checks with explicit
  assertions, skips and deterministic fixtures (`AUD-042`).
- Add a single release version manifest and doc-drift checks (`AUD-032`).

**Exit:** clean install/build/test commands run on both supported platforms; the
isolated provider fixture and evidence directory are reproducible.

## Gate 1 — Security and irreversible data safety

1. Remove secret-bearing user/settings/file DTOs (`AUD-002`, `AUD-003`,
   `AUD-030`).
2. Repair subtree/client/file-group/assignee/due-task boundaries
   (`AUD-004`–`AUD-006`, `AUD-008`, `AUD-036`) with negative project-crossing tests.
3. Replace account deletion with transactional tombstone/pseudonymization and
   durable attribution (`AUD-001`); protect last admin (`AUD-035`).
4. Make invitation/reset consumption atomic; revoke prior tokens/sessions and
   genericize anonymous failures (`AUD-009`, `AUD-010`, `AUD-027`); order login
   success/audit after durable session creation (`AUD-043`).
5. Upgrade/triage the high advisory and introduce full-lockfile SCA (`AUD-024`,
   `AUD-034`).
6. Neutralize spreadsheet formulas in exports and revoke Dropbox tokens on
   disconnect (`AUD-046`, `AUD-048`).

**Exit:** independent security review finds no open applicable P1; race,
failure-injection and negative-authorization suites pass.

## Gate 2 — Transaction and domain invariants

- Replace code/version/position allocators with DB-enforced invariants
  (`AUD-006`, `AUD-007`, `AUD-011`).
- Encode/restrict project path segments and prove move/cycle/depth properties
  (`AUD-012`).
- Implement one project archive state machine with round-trip semantics
  (`AUD-013`).
- Make deletion decisions, activity/security events and side effects transactional
  or outbox-driven (`AUD-014`, `AUD-015`).
- Repair conversation/journal compound cursors and membership/state invariants
  (`AUD-022`, `AUD-023`).
- Resolve KB write/move/version invariants (`AUD-044`).
- Make legacy adoption validate the complete schema and version session storage
  (`AUD-021`).

**Exit:** schema constraints exist; concurrency/property/failure tests pass on a
fresh DB and an intentionally incomplete legacy DB is rejected.

## Gate 3 — Durable file lifecycle and recovery

- Replace in-process timers with a durable claimed queue/outbox and idempotent
  Dropbox destination (`AUD-016`).
- Unify staging reads through the storage interface (`AUD-017`).
- Implement tombstoned physical deletion and orphan reconciliation for all tiers,
  preserving the real actor (`AUD-018`).
- Correct local/storage adapter move, retry, timeout and outage semantics
  (`AUD-047`).
- Stream upload/hash/transfer and cap per-user/instance/customer concurrency and
  quota (`AUD-028`).
- Define complete chronicle/export semantics and Unicode output (`AUD-019`).
- Back up and restore DB plus every storage tier with hash verification, declared
  RPO/RTO/retention and backup expiry (`AUD-020`).

**Exit:** crash-at-every-boundary tests, two clean restore drills, orphan report,
provider upload/download/delete and >200-event chronicle all pass.

## Gate 4 — Product and API quality

- Add semantic OpenAPI auth/request/response/error conformance and one client
  strategy (`AUD-030`).
- Normalize date-only/timezone behavior and calculation tests (`AUD-033` and the
  calculation register).
- Unify auth/task query keys and cache invalidation (`AUD-045`).
- Add accessible keyboard Kanban alternative, dynamic language metadata, labels,
  automated axe and manual Ukrainian/Czech keyboard/screen-reader evidence
  (`AUD-037`).
- Verify and enforce SPA edge headers (`AUD-029`).
- Set invite-only indexing/font privacy policy (`AUD-049`).
- Execute realistic performance/cost profiles and set quotas.

**Exit:** current integration/e2e/contract/load/accessibility suites pass on the
release candidate with documented limits.

## Gate 5 — Commercial operations

- Ship OCI/full-compose or equivalent repeatable package, signed version manifest,
  clean install/upgrade/rollback, release channels and supported-version/EOL policy
  (`AUD-039`).
- Add privacy-aware metrics/tracing/frontend reporting, alerts, on-call owner,
  severity/escalation, incident drill and diagnostic bundle (`AUD-038`).
- Define customer/support/SLA, entitlement, seat/storage/feature limits and billing
  metadata in a control plane (`AUD-025`).
- Produce data inventory, purposes/retention, subprocessors/residency, export,
  correction, erasure/offboarding and backup-expiry evidence (`AUD-026`).
- Generate SBOM/third-party notices; review fonts/assets/actions/container images,
  contributor IP and trademark/brand policy (`AUD-034`, `AUD-041`).

**Exit:** a clean customer deployment can be provisioned, licensed, monitored,
backed up, upgraded, rolled back, exported and offboarded using documented evidence.

## Conditional Gate 6 — Shared SaaS only after validated demand

If shared tenancy is chosen later, add organizations and org membership, tenant key
on every owned row, tenant-scoped unique/FK policies, tenant-aware jobs/storage/
settings/audit/cache, database row-level or equivalent isolation defense, and a
systematic cross-tenant negative suite. No existing single-tenant test may be used
as evidence of tenant isolation.
