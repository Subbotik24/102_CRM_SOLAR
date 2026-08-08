#!/usr/bin/env sh
# Post-codegen fixup for generated index files.
#
# Orval appends to existing index.ts files instead of replacing them.
# We delete them before codegen runs (so orval generates fresh ones),
# then post-process to:
#   1. Remove the duplicate types re-export from api-zod (name collision).
#   2. Add the custom-fetch re-exports back to api-client-react.

set -e

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

API_ZOD_IDX="$ROOT/lib/api-zod/src/index.ts"
API_CLIENT_IDX="$ROOT/lib/api-client-react/src/index.ts"

# ── api-zod: keep only the Zod schema export (not the types folder) ──────────
cat > "$API_ZOD_IDX" << 'EOF'
// Only export the generated Zod schemas — NOT the types folder.
// The types folder re-exports TypeScript interfaces that share the same names
// as the Zod schema constants exported from generated/api.ts, causing
// TS2308 "already exported a member" errors. Use z.infer<typeof Schema>
// to derive TypeScript types from the Zod schemas instead.
export * from "./generated/api";
EOF

# ── api-client-react: ensure custom-fetch exports are present exactly once ───
cat > "$API_CLIENT_IDX" << 'EOF'
export * from "./generated/api";
export * from "./generated/api.schemas";
export { ApiError, setBaseUrl, setAuthTokenGetter } from "./custom-fetch";
export type { AuthTokenGetter } from "./custom-fetch";
EOF

echo "fix-indices: index files patched"
