---
name: Orval + Zod v3 compatibility
description: How to keep Orval-generated Zod schemas compatible with zod v3 entry point
---

## Rule
Do not use `format: email` (or any format that Orval maps to a zod v4-only validator) in `lib/api-spec/openapi.yaml`. Use plain `type: string` instead.

**Why:** The workspace pins `zod@3.x` in the catalog. `@workspace/api-zod` imports from `"zod"` (not `"zod/v4"`), so it gets the v3 API. Orval v8+ emits `z.email()` (a zod v4 top-level function) when it sees `format: email`, which causes a TypeScript error: `Property 'email' does not exist on type 'typeof import(...zod/index")'`.

**How to apply:** Any time a field in the OpenAPI spec would logically use `format: email`, `format: uri`, or another format that has a zod v4 standalone validator — just omit the format and rely on server-side Zod schemas in `@workspace/api-zod` for validation.

The lib-level schema files (`lib/db/src/schema/`) use `from "zod/v4"` and are fine with v4 types.
