# Architecture Decision Records

## ADR-001: Monorepo structure adaptation

**Date:** 2025-07-25
**Status:** Accepted

### Context
The brief specifies a flat folder structure (`client/`, `server/`, `shared/`, `tests/`, `docs/`). The workspace uses a pnpm monorepo.

### Decision
- `client/` → `artifacts/pds-app/src/`
- `server/` → `artifacts/api-server/src/`
- `shared/` → `lib/shared/` (to be created as needed)
- `server/db/` → `lib/db/src/`
- `tests/` → `tests/` at workspace root
- `docs/` → `docs/` at workspace root

### Consequences
Imports from `shared/` use `@workspace/shared` package. All other relative imports use the artifact path.
