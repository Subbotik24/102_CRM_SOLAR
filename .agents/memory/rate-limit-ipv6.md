---
name: express-rate-limit IPv6 keyGenerator
description: express-rate-limit v8 rejects custom keyGenerators that read req.ip directly
---

## Rule
Do not supply a custom `keyGenerator` to `rateLimit()` that reads `req.headers['x-forwarded-for']` or `req.ip` directly. Let express-rate-limit use its built-in default.

**Why:** express-rate-limit v8 validates that any custom keyGenerator uses its internal `ipKeyGenerator` helper for IPv6 handling. A raw `req.ip` read throws `ERR_ERL_KEY_GEN_IPV6` and crashes the process at module load time (before the server even starts listening).

**How to apply:**
```typescript
// WRONG — throws ERR_ERL_KEY_GEN_IPV6
const limiter = rateLimit({
  keyGenerator: (req) => req.ip ?? "unknown"
});

// CORRECT — use the default
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});
```
