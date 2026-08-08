# Architecture

CRM Solar is a single-tenant project-delivery CRM for one engineering practice.
It is a pnpm TypeScript monorepo with a React client, an Express API and a
PostgreSQL 16 database.

## Runtime components

```text
Browser (React/Vite, uk + cs)
        │ HTTPS / session cookie
        ▼
Express API ───────── PostgreSQL / Drizzle
    │                        │
    ├── App Storage staging   ├── project data, sessions, audit log
    ├── Dropbox archive       └── versioned SQL migration ledger
    └── SMTP (optional) → invitation/reset messages
```

The frontend lives in `artifacts/pds-app`; the API lives in
`artifacts/api-server`; shared database code is in `lib/db`. `lib/api-spec`
is the public HTTP contract and generates Zod/TanStack Query client packages.

## Request flow and boundaries

- Routes validate HTTP input with Zod and delegate to `services/*`.
- Services own domain logic and authorization. `authorize()` is deny-by-default.
- Project-derived resources resolve their owning project and call
  `requireProjectAccess()`. Admins/managers are organization-wide; members and
  guests require a direct `project_members` row. Parent membership does not
  grant child access.
- Unassigned project resources are represented as `404`, preventing ID
  enumeration. Guest access is intentionally narrower: assigned project/tasks/
  stages, external comments/files and assigned project conversations only.
- Business writes and their activity events share a PostgreSQL transaction.
  External object storage is outside that transaction and has compensating
  cleanup on database failure.

## Data and migrations

`lib/db/drizzle/` contains versioned SQL migrations. Use `pnpm run db:migrate`
for a new database. A legacy database is adopted only through the guarded
`pnpm run db:migrate:adopt` procedure after a verified backup. Do not use
`drizzle-kit push` as a shared-environment deployment mechanism.

## Operational constraints

- Users are invited; there is no self-registration.
- Production requires SMTP. Console links are allowed only outside production.
- Replit remains supported, but local development and CI do not depend on it.
- File uploads stage in App Storage and may later transfer to Dropbox; storage
  availability is therefore tested separately from database integration tests.
