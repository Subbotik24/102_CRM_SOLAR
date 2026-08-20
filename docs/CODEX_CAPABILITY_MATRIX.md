# Codex capability matrix

Audit date: 2026-08-20
Repository baseline: `main` at `77ec63f4505a0eadc1ade2799aad741439059c88`

This matrix records which local capabilities were considered before the project
audit. No plugin, MCP server, connector, skill, or external account was installed
or connected as part of the audit.

| Need | Existing capability used | Coverage | Trust / source | Cost and update notes | Decision |
|---|---|---|---|---|---|
| Repository and Git history | local `git`, `rg`, PowerShell | Full read-only repository and history inspection | OS/Git installation | Negligible token/runtime overhead; update with workstation | Use |
| Node/pnpm verification | Codex bundled Node 24 and pnpm 11 runtime | Lint, typecheck, unit/access tests, parity, build attempts, audit and license inventory | OpenAI desktop bundled runtime | Local compute; project install can materialize ignored `node_modules` | Use with explicit PATH and ledger evidence |
| Parallel independent review | Codex collaboration agents | Security, correctness/performance/calculation, and commercialization/operations passes | Built-in Codex capability | Higher token cost; material value for falsification | Used: three read-only passes |
| Security review method | `security-best-practices` skill | Express/TypeScript/React control checklist | Installed local OpenAI skill | Low runtime, moderate context | Use |
| Systematic failure diagnosis | `systematic-debugging` skill | Root-caused Windows bootstrap, unit-test, and build failures | Installed local skill | Low overhead | Use |
| Planning and evidence gate | `writing-plans`, `verification-before-completion` | Audit sequencing and evidence-before-claim discipline | Installed local skills | Low overhead | Use |
| Public source verification | browser/web access | GitHub Actions run and public advisory verification | Built-in web access; public sources only | Network and citation overhead | Use narrowly |
| GitHub semantic connector | Not installed; `gh` also absent | Not required: no issue/PR/release mutation was authorized | Recommended GitHub plugin would require account permissions | Adds permission and supply-chain surface | Do not install for this audit |
| In-app browser automation | Installed browser plugin | Could inspect authenticated UI or staging | OpenAI bundled plugin | Interactive and session-sensitive | Not used; no staging URL/account supplied |
| Documents/PDF/spreadsheets/slides | Installed primary-runtime plugins | Artifact generation and visual QA | OpenAI primary runtime | Material runtime/token cost | Not needed; deliverables are Markdown |
| Sites hosting/building | Installed bundled plugin | Website deployment | OpenAI bundled plugin | External mutation and deployment risk | Out of scope |
| Additional marketplace plugins | Available but not installed | No missing capability relevant to read-only repository audit | Third-party/curated depending on plugin | Adds permissions, updates, prompt/context overhead | Do not install |

## Environment facts

- Bundled runtime used: Node `v24.19`, pnpm `11.19`; Git `2.55`.
- Global `node`, `gh`, and Docker were not available.
- PostgreSQL/API/frontend ports `5432`, `3000`, and `5173` were closed locally.
- The GitHub remote is public and could be inspected without an account connector.
- No MCP/app connection was necessary for repository truth.

## Re-evaluation triggers

Reconsider the GitHub connector only for an authorized issue/PR/release workflow;
browser control only for an authorized staging smoke; and document/PDF tools only
when a formatted customer artifact is requested. Before enabling any new plugin,
record its publisher, requested permissions, data boundary, update channel,
expected call frequency, and a lower-privilege fallback.
