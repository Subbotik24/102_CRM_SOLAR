---
name: citext extension gating
description: citext PostgreSQL extension must exist before drizzle-kit push
---

## Rule
Run `CREATE EXTENSION IF NOT EXISTS citext` before `drizzle-kit push` whenever the schema references the `citext` custom Drizzle type.

**Why:** `lib/db/src/schema/users.ts` defines the `email` column as `citext` (case-insensitive text). The `citext` type requires the `citext` extension to be installed in the database. `drizzle-kit push` will fail if it tries to create the column before the extension exists.

**How to apply:**
- The seed script (`artifacts/api-server/src/scripts/seed.ts`) runs `CREATE EXTENSION IF NOT EXISTS citext` as its first step.
- For a fresh environment or production: run the seed first, or execute the extension SQL manually as a superuser before pushing schema.
- On Replit PostgreSQL: the database user has superuser privileges, so the extension creation succeeds without special configuration.
