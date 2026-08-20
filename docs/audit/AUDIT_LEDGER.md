# Audit ledger

Audit date: 2026-08-20
Scope: read-only code/config/runtime verification plus permitted audit/onboarding
documentation. No commit, push, PR, deployment, migration, seed or provider
mutation was performed.

## Baseline

- Workspace: `C:\Users\Enerfis-User\Desktop\102_CRM_SOLAR`
- Branch/commit: `main` / `77ec63f4505a0eadc1ade2799aad741439059c88`
- Remote: `origin https://github.com/Subbotik24/102_CRM_SOLAR.git`
- Initial tracked state: clean, `main...origin/main`
- Visible repository inventory: about 300 files; one root `AGENTS.md`; nine pnpm
  workspace packages; 27 Drizzle application tables; 114 Express operations.

## Phase 1 — Local Codex environment audit

Inspected available local skills, installed plugin cache, bundled runtimes and
tooling before project dependency verification. Built-in Git/shell/web and local
skills covered the task. No external connector or plugin was installed. GitHub
plugin was unnecessary because no authenticated GitHub mutation was authorized and
the repository/run/advisory were public. See `../CODEX_CAPABILITY_MATRIX.md`.

Observed tools: Git 2.55; bundled Node 24.19 and pnpm 11.19; bundled Python;
global `node`, `gh` and Docker absent. PostgreSQL/API/frontend localhost ports were
closed. Decision: use explicit bundled runtime paths, Git `sh`, and mark DB/browser
suites blocked rather than synthesizing evidence.

## Phase 2 — Repository and documentation inventory

Read root/project instructions, manifests, workspace policy/lock, CI/Dependabot,
Replit/Compose/environment files, README/status/architecture/development/operations/
ADR/threat/security/open-question/next-task documents, schema/migration entrypoints,
API/frontend composition and representative routes/services/jobs/storage.

Contradictions found:

- historical status said no remote/public release although `origin` exists;
- historical status/AGENTS said OpenAPI endpoints were missing, while the current
  114/114 parity check passes;
- table counts and SMTP/open-task statements were stale;
- `OPEN_QUESTIONS.md` said none while threat/commercial decisions remained open;
- root/OpenAPI/artifact versions differ.

Decision: create canonical audit documents and update only `AGENTS.md` pointers and
stale counts. Historical documents remain as provenance but are not release truth.

## Phase 3 — Independent review passes

Three agents worked independently and read-only:

1. Security/supply chain: authorization edges, sessions/CSRF, token/secret/file
   controls, dependency/license/SBOM/CI and false-positive review.
2. Correctness/performance/calculation: domain invariants, transactions, races,
   migrations, storage, chat/journal/chronicle, API semantics, tests and formulas.
3. Commercialization/operations: product boundary, privacy/IP, packaging,
   observability/recovery/support, accessibility, delivery models and release gate.

Two passes independently attempted the documented parity command while the installed
tree was absent/partial. pnpm automatically began dependency recovery and failed in
native postinstall because `node` was not on their PATH. They stopped further pnpm
work and reported `NOT RUN`; tracked files were unchanged. The main verification
pass later performed an explicit controlled frozen bootstrap with the bundled
runtime. This discrepancy was reconciled as an environment event, not a code PASS
or product finding.

Cross-pass agreement was strongest on user deletion/history loss, file lifecycle,
multi-instance transfer, chronicle/backup incompleteness, account atomicity,
commercial controls and stale documentation. Severity labels differed: the
commercial pass used P0 for release blockers, while technical passes reserved P0
for confirmed catastrophic compromise. The final register normalizes these to P1;
no confirmed P0 remains.

## Phase 4 — Controlled local verification

Environment for pnpm commands prepended bundled Node/pnpm and Git `bin` to `PATH`.
No manifest/lockfile edit, migration, seed, server or provider call was made.

| Operation | Result | Observation |
|---|---|---|
| `pnpm install --frozen-lockfile` (initial) | FAIL | Root preinstall invokes POSIX `sh`; default Windows PATH lacked it. Packages had begun linking into ignored `node_modules` |
| Preinstall diagnosis | PASS | Git for Windows `sh.exe` exists; Node `spawnSync('pnpm')` is ENOENT because Windows exposes `pnpm.cmd` |
| `pnpm install --frozen-lockfile` with Git sh | PASS | Lockfile up to date; install-script/workspace supply-chain policies passed; tracked files unchanged |
| `pnpm run lint` | PASS | No lint errors |
| `pnpm run typecheck` | PASS | All workspace typechecks passed |
| `pnpm --filter @workspace/api-server run test:access` | PASS 15/15 | Central authorization matrix only |
| `pnpm run openapi:parity` | PASS | 114 Express method/path operations equal 114 OpenAPI operations |
| `pnpm run test` | FAIL 34/35 | Only `tests/unit/env-bootstrap.test.ts` failed: `spawnSync("pnpm")` returned null/ENOENT on Windows |
| `pnpm --filter @workspace/api-server run build` | PASS | API artifact built |
| `pnpm run build` | FAIL | Vite/Rollup could not load `@rollup/rollup-win32-x64-msvc`, excluded by workspace optional-dependency policy |
| `pnpm audit --prod` | FAIL | One high advisory: `nanoid <3.3.18`, dependency path API -> sanitize-html -> postcss -> nanoid; override pins 3.3.17 |
| `pnpm licenses list --prod --json` | PASS inventory | 238 permissive-license entries; no GPL/AGPL/unknown in this production snapshot |
| Full installed-tree license list | INCONCLUSIVE | Three Replit Vite dev plugins reported unknown license metadata |
| Local port/Docker check | BLOCKED | Docker absent; ports 5432/3000/5173 closed |
| Integration/e2e/provider/restore/load/a11y | NOT RUN/BLOCKED | Required isolated infrastructure/accounts/runtime unavailable |

## Phase 5 — External evidence

Public GitHub inspection confirmed the repository remote and a successful Actions
run for the baseline commit on 2026-08-08. That run covered quality, contract,
integration, e2e and secrets, but is historical and had Node-action deprecation
warnings. The `nanoid` advisory was later updated, and the current registry-backed
audit now fails; therefore historical CI does not close the supply-chain gate.

No authenticated GitHub/Dropbox/SMTP/Replit mutation occurred.

## Phase 6 — Falsification and reconciliation

Potential false positives explicitly rejected or narrowed:

- Markdown `dangerouslySetInnerHTML` is fed by centralized sanitization; no XSS was
  confirmed.
- Storage path traversal was not confirmed because local keys are server-generated
  opaque IDs; original filenames are not local filesystem paths.
- Broad claims that resource membership or SMTP are entirely absent are stale;
  real findings are scoped edge cases and atomicity/runtime evidence.
- The current high advisory is a valid SCA failure, but direct application
  reachability appears low because the app does not call `nanoid`; it remains open
  until fixed or formally dispositioned.
- SPA header concern remains `CONDITIONAL` because Replit edge behavior was not
  observed live.

Main-agent spot checks confirmed high-risk evidence for password-hash response,
encrypted-setting exposure, project subtree, client-linked projects, file version
groups, stage reorder, user deletion FKs, invitation/reset flows, archive/restore,
task code generation, transfer sequencing, chronicle limit and Dropbox deletion.

## Phase 7 — Documentation outputs

Created/updated only:

- `AGENTS.md`
- `docs/CODEX_CAPABILITY_MATRIX.md`
- `docs/PROGRAM_DESCRIPTION.md`
- `docs/DEVELOPMENT_DESCRIPTION.md`
- `docs/PROJECT_AUDIT_STATUS.md`
- `docs/PROJECT_IMPROVEMENT_ROADMAP.md`
- `docs/COMMERCIALIZATION_READINESS.md`
- `docs/ENGINEERING_CALCULATION_REGISTER.md`
- `docs/audit/FINDINGS_REGISTER.md`
- `docs/audit/AUDIT_LEDGER.md`
- `docs/DEEP_AUDIT_EXECUTION_PROMPT.md`

No finding was closed and no source fix was attempted. Final Git status/diff must
show only this permitted documentation/onboarding scope before handoff.

## Phase 8 — Independent second-order challenge

After the documentation set was drafted, the correctness reviewer challenged the
audit itself rather than searching for ordinary product bugs. The pass found one
stale `AGENTS.md` claim, one overclassified stage-reorder security finding, one
commercial finding that needed to be conditional, ambiguous evidence paths, weak
tests omitted from the register, omitted login/KB/frontend correctness issues,
incorrect journal-collapse and transfer-memory wording, incomplete calculation
boundary/oracle metadata, missing end-to-end traces, and a tracked-vs-ignored side
effect wording error.

The main agent independently checked those points and updated only audit/onboarding
documents. Additional confirmed findings were registered for test validity, login
ordering, KB invariants, frontend cache invalidation, CSV formula injection, storage
adapter semantics, Dropbox token revoke and invite-only indexing/font privacy.
Normalized unresolved counts became 24 P1, 21 P2 (two conditional) and four P3;
P0 remained zero. No implementation remediation was performed.
