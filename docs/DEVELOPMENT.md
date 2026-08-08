# Development

## Start locally

```bash
pnpm install --frozen-lockfile
cp .env.example .env
pnpm run db:migrate
SEED_ADMIN_EMAIL=admin@example.test SEED_ADMIN_PASSWORD='a-unique-12-character-minimum-secret' pnpm --filter @workspace/api-server run db:seed
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/pds-app run dev
```

For a disposable local PostgreSQL and Mailpit environment, use `docker compose
up -d` when Docker is available. See `README.md` for connection settings.

## Required checks

```bash
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm --filter @workspace/api-server run test:access
pnpm run build
pnpm audit --prod
```

Integration tests require a reachable PostgreSQL database, valid
`SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` values and start a temporary API
server themselves:

```bash
pnpm run test:integration
```

## Conventions

- Use pnpm only.
- Keep routes thin; service code owns business rules and authorization.
- Add an explicit `authorize()` allow branch for every new action.
- Resolve owning project context for every project-derived resource.
- Add i18n keys to both `uk` and `cs` locale trees.
- Update `lib/api-spec/openapi.yaml` and regenerate clients when changing a
  documented endpoint. `pnpm run openapi:parity` is the drift check.
- Never commit `.env`, credentials, account links, database dumps or real user
  data.
