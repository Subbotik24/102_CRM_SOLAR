# Deep audit execution prompt

Use the following prompt for a future independent re-audit or release-candidate
gate. Replace bracketed values, but do not remove evidence boundaries.

---

You are auditing `[REPOSITORY_PATH]` at exact commit `[COMMIT_SHA]` for product,
engineering and commercialization readiness. Work evidence-first. Do not edit
application source, tests, manifests, lockfiles, dependencies, CI/CD, infrastructure
or runtime configuration. Allowed persistent changes are audit/project documents,
`AGENTS.md` and repository-scoped Codex guidance only. Do not commit, push, create a
PR, tag, release, deploy, migrate, seed, or call production providers.

The project objective is to establish the actual technical baseline and a safe,
approved path to a supportable commercial product. First read applicable
`AGENTS.md`, the current README/status/architecture/operations/security documents,
and any existing canonical audit/roadmap/calculation/commercialization files. Treat
executable code and fresh evidence as primary truth; preserve conflicting historical
documents as provenance until an owner explicitly archives them.

The lifecycle is strictly:

`AUDIT -> DESIGN -> USER APPROVAL -> IMPLEMENTATION -> VERIFICATION -> COMMERCIAL RELEASE REVIEW`

This prompt authorizes only `AUDIT` and documentary `DESIGN`. Stop for explicit user
approval before implementation, and never interpret approval of the audit as
approval to change product code.

## 1. Establish truth before dependencies

1. Record repository root, branch, exact SHA, remotes, tags, initial `git status`,
   existing user changes and applicable `AGENTS.md` files.
2. Audit local tools, runtimes, Codex skills/plugins/MCP/apps and account
   requirements. Build a capability matrix with purpose, installed coverage,
   publisher/source trust, permissions, update cadence, expected frequency,
   token/runtime overhead and decision. Do not install a plugin merely because it
   exists; use the least-privileged built-in/local path.
3. Inventory files, packages, languages, generated code, schemas/tables, API
   operations, UI routes, migrations, jobs, providers, CI and documentation.
4. Read status/roadmap/security/operations/legal documents and list contradictions.
   Historical prose is not current PASS evidence.

## 2. Build the product and architecture model

Document purpose, users/roles, user journeys, functional modules, data classes,
trust boundaries, request/auth flow, transaction/event policy, storage lifecycle,
deployment topology, provider dependencies and explicit non-capabilities. Draw the
smallest useful architecture diagram. Trace at least one representative write and
read per critical domain from UI/API through DB/provider.

## 3. Run independent read-only passes

Where agent collaboration is available, use independent bounded passes and prohibit
edits/installs/provider calls:

- security/auth/privacy/dependency/license/SBOM/supply chain;
- correctness/transactions/concurrency/migrations/performance/calculations/tests;
- commercialization/UX/accessibility/operations/recovery/support/IP/delivery model.

Require exact file/line evidence, exploitation or counterexample, impact,
confidence, false-positive analysis, remediation, acceptance evidence and explicit
`PASS`, `FAIL`, `NOT RUN`, `BLOCKED` or `INCONCLUSIVE` results. The main auditor
must spot-check high-severity evidence and reconcile duplicates/severity conflicts.

## 4. Verification ladder

Only after environment/repository audit, use the repository's documented frozen
bootstrap if allowed. Never update the lockfile. Record the exact runtime/PATH and
every side effect, including ignored dependency materialization. Run, as applicable:

1. install policy/frozen lock verification;
2. lint and formatting/static checks;
3. all typechecks;
4. unit and authorization tests;
5. API method/path parity and semantic contract tests;
6. package and full builds on every supported OS;
7. full-lockfile vulnerability, license and SBOM generation;
8. integration/e2e only against an isolated seeded database/server;
9. provider, migration, restore, load, accessibility, upgrade/rollback and incident
   tests only with explicitly authorized fixtures.

Do not substitute old CI, agent statements, static inspection or user reports for a
current runtime gate. If a command cannot run, preserve the exact reason and mark it
`BLOCKED`/`NOT RUN`. Never create synthetic screenshots, logs, backups, provider
objects or PASS markers.

## 5. Required audit analyses

At minimum inspect:

- authentication/session/token lifecycle, CSRF/CORS/headers, authorization on each
  list/get/mutation and indirect projection, secret/error/log handling;
- SQL/schema constraints, polymorphic references, migrations/adoption, transaction
  boundaries, event/audit atomicity, idempotency, concurrency and crash boundaries;
- storage upload/version/download/delete/reconciliation, all-tier backup/restore,
  encryption, provider token revoke and orphan behavior;
- pagination/cursors/timezones/locale/Unicode, cache invalidation, error contracts,
  generated-client/runtime OpenAPI conformance;
- memory/CPU/DB/network/provider cost, batching/polling/N+1/unbounded lists,
  retention/pruning/quotas and realistic volume assumptions;
- test validity, false PASS/skip/fallback behavior, shared state, negative/security,
  concurrency/failure/property/load/accessibility/platform coverage;
- dependency freshness/reachability, full shipped graph, lock integrity, install
  scripts, action pinning, SBOM, licenses/assets/fonts/contributor provenance;
- data inventory/purpose/access/retention/export/correction/deletion/offboarding,
  subprocessors/residency/incident and backup expiry (not legal advice);
- packaging, signed/versioned releases, install/upgrade/rollback/EOL, telemetry,
  SLO/alerts/on-call/support/SLA and customer diagnostics;
- local licensed, isolated hosted, shared SaaS, hosted API and hybrid delivery
  models, including entitlement/billing/metering/quota needs.

## 6. Calculation register

Search for every formula, counter, date/time computation, percentage, aggregation,
retry/backoff, version/position allocator and engineering/domain computation. Record
formula, units, coordinate/time convention, input domain, boundary behavior,
precision/rounding, referenced standard/version, independent oracle, test vectors,
status and risk. If no professional engineering calculations exist, state that
explicitly; do not invent standards compliance. For any future engineering engine,
require golden vectors, independent hand/reference calculations, sensitivity and
uncertainty/applicability limits.

## 7. Canonical outputs

Create or update:

- `docs/PROGRAM_DESCRIPTION.md`
- `docs/DEVELOPMENT_DESCRIPTION.md`
- `docs/PROJECT_AUDIT_STATUS.md`
- `docs/PROJECT_IMPROVEMENT_ROADMAP.md`
- `docs/COMMERCIALIZATION_READINESS.md`
- `docs/ENGINEERING_CALCULATION_REGISTER.md`
- `docs/CODEX_CAPABILITY_MATRIX.md`
- `docs/audit/FINDINGS_REGISTER.md`
- `docs/audit/AUDIT_LEDGER.md`
- `docs/DEEP_AUDIT_EXECUTION_PROMPT.md`

The findings register must contain stable ID, normalized severity, domain, exact
evidence, impact, remediation, acceptance evidence, confidence/conditionality and
status. Never mark a finding closed without current acceptance evidence.

The roadmap must be dependency-ordered with exit gates, not a vague backlog. The
commercialization document must recommend a delivery model and define product,
security, recovery, operations, privacy/IP, accessibility, support and release
criteria. Preserve unknown product-owner decisions rather than guessing.

## 8. Second-order review and final handoff

Before completion:

1. Re-read all new audit documents against the findings register and ledger.
2. Search for contradictory counts, stale PASS language, unsupported claims,
   placeholders and absolute/marketing language.
3. Verify internal Markdown links and exact command/result statements.
4. Run safe documentation/static checks and current source checks proportional to
   the change; do not claim blocked suites passed.
5. Show final `git status`, `git diff --stat`, `git diff --name-only` and verify that
   only permitted documentation/onboarding files changed.

Return a concise executive report in the user's language with these sections:

A. verdict and release boundary; B. product/architecture; C. verification matrix;
D. P0/P1 findings; E. security/privacy/IP; F. performance/calculations; G. tests and
evidence gaps; H. recommended commercial model; I. roadmap gates; J. files changed;
K. Git/code-change confirmation. Include links to canonical local documents and any
authoritative current external sources used. Do not commit or publish.

## 9. Resumability and checkpoints

At the end of each audit phase, append to the audit ledger: exact baseline, areas
completed, commands/results, findings added or challenged, open questions, evidence
gaps, files intentionally changed and the next safe step. Before resuming, re-check
SHA and Git status; if they changed, record a new baseline and determine which
evidence is stale. Never repeat provider/destructive checks merely to recreate lost
context. A checkpoint is complete only when another auditor can continue from the
ledger without relying on chat history.

Stop/go rules:

- `STOP` on unrecognized user changes, production credentials, destructive command,
  unavailable authorization, or a product decision that changes delivery/tenancy.
- `CONTINUE AUDIT` through ordinary findings, failed safe checks and missing optional
  tools; record them rather than fixing them.
- `GO TO DESIGN` only after baseline, passes, calculation register and evidence gaps
  are reconciled.
- `GO TO IMPLEMENTATION` only after explicit approval of a bounded plan.
- `GO TO COMMERCIAL RELEASE REVIEW` only after the exact candidate passes all
  defined technical, recovery, operations, privacy/IP and support gates.

---
