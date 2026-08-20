# Project audit status

Status date: 2026-08-20
Baseline: branch `main`, commit `77ec63f4505a0eadc1ade2799aad741439059c88`
Remote: `https://github.com/Subbotik24/102_CRM_SOLAR.git`

## Executive verdict

**Commercial/production release: FAIL.** The repository has a substantial working
product, useful security controls and a broad CI definition, but 24 confirmed P1
findings block a paid production release. The most urgent risks are partial data
loss during user deletion, secret/credential and password-hash response exposure,
project-scope list/reorder/file-group authorization gaps, non-atomic account
workflows, non-durable file transfer/deletion, incomplete chronicle/backup behavior,
and a current high-severity dependency advisory.

**Controlled pilot: BLOCKED until the applicable P1 data/security/storage findings
are closed.** A pilot must use an isolated single-tenant deployment, test data or
explicitly accepted data risk, verified backup/restore, and no unsupported claim of
complete history, erasure or shared tenancy.

No confirmed P0 was found. Conditional infrastructure concerns remain conditional;
historical green CI is supporting evidence, not current GA evidence.

## Audit scope and method

The audit covered repository structure and history, product behavior, architecture,
authorization, correctness, data integrity, migrations, storage, concurrency,
performance, calculations, tests, API contract, documentation, privacy/IP,
operations, delivery models and the local Codex capability environment. Three
independent read-only review passes covered security/supply chain,
correctness/performance/calculations and commercialization/operations, followed by
cross-reconciliation and targeted main-agent verification.

Application source, tests, manifests, lockfiles, CI, dependencies and infrastructure
configuration were not edited. Tracked repository changes are limited to
audit/onboarding Markdown and `AGENTS.md`. The frozen bootstrap did materialize the
ignored local `node_modules` tree; this filesystem side effect is recorded in the
ledger and does not appear in the Git diff.

## Current verification evidence

| Check | Result | Evidence boundary |
|---|---|---|
| Initial Git worktree | PASS | Clean tracked tree before audit; `main...origin/main` |
| Frozen bootstrap | PASS after environment correction | First attempt failed because Git `sh` was absent from `PATH`; second used bundled Node/pnpm and Git sh. Ignored `node_modules` was materialized; lockfile unchanged |
| `pnpm run lint` | PASS | Current local installed tree |
| `pnpm run typecheck` | PASS | All TypeScript workspace projects |
| API access suite | PASS 15/15 | Central authorization matrix, not all resource edge cases |
| OpenAPI parity | PASS 114/114 | Method/path only; not schema/auth/runtime conformance |
| Root unit suite | FAIL 34/35 | `env-bootstrap.test.ts` uses `spawnSync("pnpm")`; Windows has `pnpm.cmd`. Other 34 passed |
| API build | PASS | `@workspace/api-server` only |
| Full workspace build | FAIL | Frontend Rollup Windows optional binary is excluded/missing |
| Production dependency audit | FAIL | One high `nanoid <3.3.18` advisory through `sanitize-html > postcss`; override pins 3.3.17 |
| Production license inventory | PASS, inventory scope | 238 entries: MIT 204, Apache-2.0 13, ISC 10, BSD-2 5, BSD-3 3 and three permissive variants; no GPL/AGPL/unknown in `--prod` snapshot |
| Full installed-tree license inventory | INCONCLUSIVE | Three Replit Vite dev plugins report unknown license metadata; no policy/SBOM |
| Integration and Playwright | BLOCKED | No Docker, PostgreSQL on 5432, seeded API, or running frontend |
| SMTP/Dropbox/App Storage | NOT RUN | No authorized production-like accounts or isolated provider fixture |
| Backup/restore, migration adoption | NOT RUN | Would mutate database/storage and no isolated fixture exists |
| Load/accessibility/manual mobile | NOT RUN | No running application fixture |
| Public GitHub Actions at baseline | HISTORICAL PASS | Run 31278328617 succeeded on 2026-08-08; it predates the advisory's latest update and is not the current registry/runtime result |

## Findings summary

| Severity | Unresolved | Meaning |
|---|---:|---|
| P0 | 0 | No confirmed immediate catastrophic issue under the normalized definition |
| P1 | 24 | High-impact defects or commercial release blockers |
| P2 | 21 | Material bounded defects/evidence gaps requiring planned closure; two are conditional on runtime/commercial model |
| P3 | 4 | Defense-in-depth/supply-chain/privacy hardening |

The authoritative detail, exact evidence and acceptance conditions are in
`audit/FINDINGS_REGISTER.md`. No finding is marked closed by this documentation
pass.

## Assessment snapshot

| Area | Rating | Evidence-based assessment |
|---|---|---|
| Architecture | AMBER | Clear monorepo/domain structure and central access/storage abstractions; single-tenant assumptions, route/service leakage and in-process worker limit target operation |
| Correctness/data integrity | RED | Confirmed account, archive, allocator, reorder, cursor, chronicle and transaction defects |
| Security/privacy | RED | Strong baseline controls coexist with scoped authorization/secret/file lifecycle gaps and incomplete data lifecycle |
| Testing | RED | Static/access core passes, but one unit failure, blocked integration/e2e and weak race/failure/provider coverage |
| Dependencies/IP | RED | Current high SCA failure; no full shipped-graph SBOM/license policy/provenance gate |
| Performance/cost | AMBER | Small-team scope is plausible, but buffered uploads, 20-file transfer batch, polling/unbounded lists and no quota measurements create cost risk |
| Engineering calculations | N/A for professional engineering | No solar/PV engine; operational formulas include failed allocators/date/retry cases |
| Operations/recovery | RED | Readiness/logging/runbook exist; complete backup/restore, telemetry/alerts/incident/provider evidence absent |
| Documentation | AMBER | Useful existing docs plus new canonical audit set; historical status/version sources still conflict and require governance |
| Commercialization | RED | No supportable release/entitlement/privacy/offboarding/packaging evidence; isolated hosting is only a target recommendation |

## Strong controls worth preserving

- Central deny-by-default authorization and exact project membership policy.
- PostgreSQL sessions, session regeneration and production cookie flags.
- Credentialed CORS plus unsafe-request Origin/Fetch-Site protection.
- Argon2id, hashed invite/reset tokens and encrypted Dropbox refresh token.
- Parameterized DB access and centralized Markdown sanitization.
- Structured redacted logging and an append-only database security-audit trigger.
- Frozen installs, integrity hashes, release-age/install-script policies,
  Dependabot and full-history gitleaks.
- CI lanes for quality, contract, PostgreSQL integration and Playwright.
- Ukrainian/Czech translation parity and a mobile navigation smoke.

These controls reduce risk but do not falsify the scoped edge cases in the findings
register.

## Release stop conditions

Do not tag, deploy, sell or represent this baseline as production-ready until:

1. all applicable P1 findings are closed with code review, regression tests and
   clean current verification;
2. the high advisory is resolved or formally risk-accepted with a valid fixed
   path and full-lockfile SCA evidence;
3. all-tier backup/restore, migration, Dropbox lifecycle and multi-instance worker
   behavior pass in isolated production-like infrastructure;
4. integration, e2e, load, accessibility and primary Ukrainian/Czech journeys pass
   on the exact release candidate;
5. the chosen delivery model has versioning, entitlement, support, incident,
   privacy, retention/export/offboarding, IP/SBOM and upgrade/rollback evidence.

## Confidence and limitations

Confidence is high for static code/config findings and local command outcomes.
Runtime conclusions are deliberately limited: Replit edge headers, production
proxy/TLS/secrets, provider scopes/residency, SMTP behavior, real data volumes,
RPO/RTO/SLA, cost profile and customer compliance constraints were not available.
They are recorded as questions/evidence gaps, not assumed PASS or FAIL.
