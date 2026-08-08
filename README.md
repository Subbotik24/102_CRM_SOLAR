# CRM Solar

A self-hosted, single-tenant project delivery CRM for one engineering practice.
Its center of gravity is a complete, permanent, readable project history.
Built for 3–15 invited users (Ukrainian/Czech engineers) on desktop and phone.
The code is available under the [MIT License](LICENSE); contributions are
welcome through [Discussions, Issues and Pull Requests](CONTRIBUTING.md).

The product covers: access management, a client/contact directory, a recursive
project tree, tasks with Kanban and a calendar, team chat, file management with
Dropbox archiving, a knowledge base, an automatic activity journal with
chronicle export, and an admin/audit area.

There is no public sign-up: users are invited by an administrator.

---

## Stack

| Layer | Technology |
|---|---|
| Monorepo | pnpm workspaces, TypeScript 5.9, Node.js 24 (Replit) |
| Frontend | React 19, Vite 7, Wouter, TanStack Query, Tailwind CSS 4, shadcn/ui |
| API | Express 5 |
| Auth | `express-session` + `connect-pg-simple` + argon2id (no SSO, no OAuth login) |
| Database | PostgreSQL 16 + Drizzle ORM |
| Validation | Zod 3 (`zod@3.25.76` — pinned, see below) |
| i18n | i18next + react-i18next (`uk` default, `cs` full parity) |
| API codegen | Orval, from `lib/api-spec/openapi.yaml` |
| API build | esbuild → single ESM bundle |
| Tests | `node:test` (unit + integration), Playwright (e2e) |
| Hosting | Replit Autoscale, Replit App Storage for file staging |

> **Zod is pinned to v3.** Orval's generated schemas target the v3 API. Do not
> upgrade to Zod 4 without regenerating and reviewing the client — see
> `.agents/memory/orval-zod-v3.md`.

---

## Requirements

- **Node.js 24+** (the repo is developed against Node 24; Node 26 also works)
- **pnpm 11+** — npm and yarn are blocked by the `preinstall` guard
- **PostgreSQL 16** with the `citext` extension available

---

## Install

```bash
pnpm install
```

Native dependencies (`argon2`, `esbuild`) run reviewed build scripts. They are
explicitly approved in `pnpm-workspace.yaml`; an unknown dependency build script
still fails installation by design.

## Configure

```bash
cp .env.example .env
```

Then edit `.env`. The only two values required to boot the API are
`DATABASE_URL` and `SESSION_SECRET` (minimum 32 characters); everything else has
a working default. The API server loads `.env` automatically in development —
on Replit the Secrets manager supplies these instead and the file is ignored.

Generate a session secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Local infrastructure with Docker

If Docker is available, start PostgreSQL and a local inbox with:

```bash
docker compose up -d
```

Use `postgres://crm_solar:crm_solar_local_only@localhost:5432/crm_solar` as
`DATABASE_URL`. For local email testing set `EMAIL_PROVIDER=smtp`,
`SMTP_URL=smtp://localhost:1025`, `EMAIL_FROM=CRM Solar <noreply@localhost>`,
and `APP_URL=http://localhost:5173`. Mailpit is available at
`http://localhost:8025`.

## Prepare the database

On macOS with Homebrew (this is the exact sequence verified on 2026-07-26):

```bash
brew install postgresql@16
```

```bash
LC_ALL=en_US.UTF-8 /opt/homebrew/opt/postgresql@16/bin/pg_ctl -D /opt/homebrew/var/postgresql@16 -l /tmp/pg16.log start
```

`LC_ALL` is required — without it the server dies at startup with
`postmaster became multithreaded during startup`.

```bash
/opt/homebrew/opt/postgresql@16/bin/createdb pds
```

Then apply the recorded schema:

```bash
pnpm run db:migrate
```

The migration baseline creates the required PostgreSQL extensions, tables,
indexes, functions and triggers. Do not use `drizzle-kit push` for shared or
production-like databases. Existing databases must be backed up and adopted
once with `pnpm run db:migrate:adopt`; see `docs/OPERATIONS.md`.

Then seed the first administrator. The seed command intentionally has no
default password; set a unique password of at least 12 characters:

```bash
SEED_ADMIN_EMAIL=admin@example.test SEED_ADMIN_PASSWORD='replace-with-a-strong-secret' pnpm --filter @workspace/api-server run db:seed
```

Never commit this password or place it in issue reports.

## Run

Two processes, in two terminals:

```bash
pnpm --filter @workspace/api-server run dev
```

```bash
pnpm --filter @workspace/pds-app run dev
```

- API → `http://localhost:8080/api`
- App → `http://localhost:5173`
- Liveness → `http://localhost:8080/api/healthz`
- PostgreSQL readiness → `http://localhost:8080/api/readyz`

The Vite dev server proxies `/api` to `http://localhost:8080`. Point it
elsewhere with `API_PROXY_TARGET`. In the Replit deployment the platform router
handles that mapping instead and the proxy never fires.

---

## Common commands

| Command | Purpose |
|---|---|
| `pnpm run typecheck` | Typecheck every package |
| `pnpm run build` | Typecheck, then build all packages |
| `pnpm run test` | Unit tests — no database needed |
| `pnpm run test:integration` | Integration tests — starts an isolated API; requires a seeded local database |
| `pnpm run test:e2e` | Playwright end-to-end tests |
| `pnpm --filter @workspace/api-server run test:access` | Authorization matrix tests |
| `pnpm --filter @workspace/api-spec run codegen` | Regenerate API hooks and Zod schemas from the OpenAPI spec |
| `pnpm run db:migrate` | Apply recorded database migrations |
| `pnpm run db:migrate:status` | Show recorded migration status |
| `pnpm run openapi:parity` | Verify Express routes and OpenAPI stay aligned |

---

## Structure

```
.
├── artifacts/                  # deployable units (Replit "artifacts")
│   ├── api-server/             # Express 5 API
│   │   └── src/
│   │       ├── routes/         # HTTP layer (15 modules; some still contain DB/business logic)
│   │       ├── services/       # primary business-logic layer (20 domains)
│   │       ├── storage/        # App Storage + Dropbox adapters, content hashing
│   │       ├── jobs/           # in-process background transfer job
│   │       ├── middleware/     # requireAuth, error handler
│   │       ├── scripts/        # seed scripts
│   │       └── lib/            # env, logger, encryption, object storage
│   ├── pds-app/                # React frontend (25 pages, 57 shadcn/ui components)
│   │   └── src/
│   │       ├── pages/
│   │       ├── components/     # feature components + components/ui (shadcn)
│   │       └── i18n/locales/   # uk + cs, 12 namespaces each
├── lib/
│   ├── db/                     # Drizzle schema (27 modeled tables) + pool
│   ├── api-spec/               # openapi.yaml + Orval config
│   ├── api-zod/                # generated Zod schemas
│   └── api-client-react/       # generated TanStack Query hooks + custom fetch
├── tests/
│   ├── unit/                   # node:test, no infrastructure required
│   ├── integration/            # node:test over HTTP against a running server
│   └── e2e/                    # Playwright
├── docs/                       # maintained architecture and operations docs
└── .env.example                # environment template
```

### Architectural rules

- **No mock data, no in-memory stores.** Everything is PostgreSQL.
- **Authorization is server-side only.** `authorize(user, action, resource)` in
  `services/access/` is the deny-by-default role gateway. Project-derived
  operations resolve exact membership in the service layer; parent membership
  never grants child-project access.
- **Routes should stay thin.** Business logic and permission checks belong in
  services. Several legacy routes still violate this boundary and are tracked
  as architecture debt.
- **Activity events are emitted in the same transaction** as the change that
  caused them.
- **No localized strings in the database.** Event payloads store codes; the UI
  renders them from i18n templates at display time.
- **Two-tier file storage.** App Storage is the staging tier, Dropbox the
  archive; a synchronous upload never touches Dropbox.

---

## Gotchas

- All `timestamptz` columns are stored in UTC; display uses the user's
  `timezone` field via `Intl`.
- Czech strings run 10–20% longer than Ukrainian — verify layouts against `cs`,
  not `uk`.
- `pnpm-workspace.yaml` prunes platform binaries it does not need. macOS and
  Linux x64 are kept; if you develop on another platform you may need to
  re-enable the matching `@rollup/*`, `@tailwindcss/oxide-*`, `lightningcss-*`
  and `@esbuild/*` entries in `overrides`.
- The brief explicitly forbids: time tracking, budgets, Gantt charts, SSO/OAuth
  login providers, multi-tenancy, offline/PWA, AI features and WebSockets.

---

## Status

See [PROJECT_STATUS.md](PROJECT_STATUS.md) for what is verified working and what
is not, [NEXT_TASKS.md](NEXT_TASKS.md) for the prioritized backlog, and
[docs/OPERATIONS.md](docs/OPERATIONS.md) for backup, restore, secret rotation,
migrations, health checks, and rollback.
