---
name: ENCRYPTION_KEY optional until Increment 4
description: ENCRYPTION_KEY is Dropbox-only; do not require it at startup until Increment 4
---

## Rule
`ENCRYPTION_KEY` is optional in `artifacts/api-server/src/lib/env.ts` until Increment 4 (Files & Dropbox) is implemented. The Dropbox service validates it at call time, not at startup.

**Why:** Requiring ENCRYPTION_KEY at startup (as a hard z.string().min(32)) blocks all local development until a real key is provisioned, even for developers who only need auth and project management features.

**How to apply:** The current env.ts schema marks it as `z.string().min(32).optional()`. When Increment 4 is implemented, the Dropbox service module should assert it exists before using it:
```typescript
if (!env.ENCRYPTION_KEY) throw new Error("ENCRYPTION_KEY is required for Dropbox storage");
```
Do not move it back to required in the env schema — that would break non-Dropbox environments again.
