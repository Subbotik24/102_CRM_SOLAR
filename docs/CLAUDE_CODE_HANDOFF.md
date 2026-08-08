# Claude Code handoff

## Current release state

- Public repository: `Subbotik24/102_CRM_SOLAR` (CRM Solar).
- The default branch is `main`; it contains the first public snapshot.
- Before finalizing, merge pull request #10 using **squash merge** after an
  independent approval. It removes the unused Replit mockup prototype and AI
  service, and fixes the public CI baseline.
- Do not merge the open Dependabot pull requests yet. Rebase or re-run them
  after #10 is merged, then inspect each dependency change separately.

## Product and stack

CRM Solar is a single-tenant, invitation-only project delivery CRM for one
engineering practice. It is a pnpm monorepo with an Express 5 API, React 19
web app, PostgreSQL and Drizzle. The supported UI locales are Ukrainian (`uk`)
and Czech (`cs`).

## Non-negotiable implementation rules

1. Use `pnpm`; npm and yarn are intentionally rejected.
2. Keep HTTP routes thin. Business logic and every authorization decision live
   in `artifacts/api-server/src/services/`.
3. Use `authorize()` in `artifacts/api-server/src/services/access/index.ts`.
   It is deny-by-default. Never implement permissions only in the UI.
4. Project-derived resources must resolve their owning `projectId` before an
   access decision. Parent-project membership does not grant child access.
5. Write activity events in the same database transaction as the domain change.
6. Do not store localized text in the database; store stable event codes and
   render them through i18n.
7. Keep `uk` and `cs` locale keys in parity. The unit suite enforces this.
8. Zod must remain on v3 because the OpenAPI generator depends on it.

## Useful locations

| Path | Purpose |
| --- | --- |
| `lib/db/src/schema/` | Drizzle data model and migrations |
| `lib/api-spec/openapi.yaml` | API contract |
| `artifacts/api-server/src/routes/` | Thin Express HTTP layer |
| `artifacts/api-server/src/services/` | Domain logic and authorization |
| `artifacts/pds-app/src/` | React application |
| `tests/` | Unit, integration and Playwright coverage |
| `.github/workflows/ci.yml` | Public CI gates |

## Safe local workflow

```bash
cp .env.example .env
pnpm install --frozen-lockfile
pnpm run verify:core
pnpm run openapi:parity
```

For database-backed checks, start PostgreSQL (and optionally Mailpit) with
`docker compose up -d`, configure `DATABASE_URL` and a 32+ character
`SESSION_SECRET`, then run:

```bash
pnpm run db:migrate
SEED_ADMIN_PASSWORD='a-long-local-only-password' pnpm --filter @workspace/api-server run db:seed
pnpm run test:integration
pnpm run test:e2e
```

Never commit `.env`, database dumps, generated test results, SMTP credentials,
or reset/invitation tokens.

## Required checks before a pull request

```bash
pnpm install --frozen-lockfile
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm --filter @workspace/api-server run test:access
pnpm run build
pnpm audit --prod
pnpm run openapi:parity
```

If an API route changes, update the OpenAPI contract and run:

```bash
pnpm --filter @workspace/api-spec run codegen
git diff --exit-code
```

The GitHub workflow also runs fresh migrations, integration tests, Playwright
E2E and Gitleaks. Do not weaken or skip those gates to make a PR green.

## Known intentional limits

- The product has no self-registration, multi-tenancy, budget/time tracking,
  Gantt, SSO/OAuth login, PWA/offline mode, AI feature or WebSockets.
- Replit remains supported, but local development and CI must not depend on it.
- Do not alter production data, DNS, deployment configuration or existing
  database contents without explicit maintainer approval.

## First task after merging #10

Re-run CI on `main`, confirm the five required checks are green, then publish
`0.1.1` as the corrected community-preview release. Keep the existing `0.1.0`
release as the historical initial snapshot; do not rewrite public history.
