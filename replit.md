# CRM Solar

A self-hosted, single-tenant project delivery CRM for one engineering practice. Its center of gravity is a complete, permanent, readable project history. Used by 3–15 invited users (Ukrainian/Czech engineers) on desktop and phone.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port from workflow)
- `pnpm --filter @workspace/pds-app run dev` — run the frontend (port from workflow)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm run db:migrate` — apply reviewed versioned SQL migrations
- `pnpm --filter @workspace/api-server run db:seed` — seed the initial admin user
- Required env: `DATABASE_URL`, `SESSION_SECRET`; SMTP production also needs `SMTP_URL`, `EMAIL_FROM`, and `APP_URL`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 19 + Vite + Wouter + TanStack Query + Tailwind CSS + shadcn/ui
- API: Express 5
- Auth: express-session + connect-pg-simple + argon2 (no Clerk, no SSO)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod 3 (`zod@3.25.76`), `drizzle-zod`
- i18n: i18next + react-i18next (uk default, cs full parity)
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — API contract; parity is enforced in CI
- `lib/db/src/schema/` — Drizzle schema (one file per domain)
- `artifacts/api-server/src/services/` — primary business-logic and authorization layer
- `artifacts/api-server/src/routes/` — HTTP layer; some legacy modules still contain DB/business logic
- `artifacts/pds-app/src/i18n/locales/{uk,cs}/` — translation files (12 namespaces)
- `PROJECT_STATUS.md` — current verified status and release gates
- `docs/ADR.md` — architecture decision records

## Architecture decisions

- **No mock data, no in-memory stores**: everything is PostgreSQL
- **Authorization is server-side only**: `authorize(user, action, resource)` in `services/access/` — UI button hiding is not access control. Project access requires direct membership for members and guests.
- **Activity events are emitted in the same DB transaction** as the change that caused them.
- **No localized human-readable strings persisted in the DB**: event payloads store codes, rendered at display time from i18n templates
- **Two-tier file storage**: App Storage (staging) → Dropbox (archive); synchronous upload never touches Dropbox

## Product

A project delivery system covering: access management, client/contact directory, recursive project tree, tasks with Kanban, team chat, file management with Dropbox archiving, knowledge base, automatic activity journal with chronicle export, and admin/audit area.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- `pnpm run db:migrate` is the supported schema workflow; `drizzle-kit push` is not a deployment interface
- All `timestamptz` columns are stored in UTC; display uses user's `timezone` field via `Intl`
- Czech strings run 10–20% longer than Ukrainian — verify layouts against `cs`, not `uk`
- The product deliberately excludes: time tracking, budgets, Gantt, SSO/OAuth login providers, multi-tenancy, offline/PWA, AI features, and WebSockets.

## Pointers

- See `README.md` and `docs/DEVELOPMENT.md` for setup and verification
- See `docs/ADR.md` for architecture decisions
