---
name: argon2 native build approval
description: How to allow argon2's native bindings to build in pnpm
---

## Rule
`argon2` must appear in the `onlyBuiltDependencies` list in `pnpm-workspace.yaml`. Without it, pnpm silently skips the post-install build script and the native addon is missing at runtime.

**Why:** pnpm v10 requires explicit opt-in for packages that run build scripts. The list was already present for `@swc/core`, `esbuild`, etc.; argon2 must be added to the same list.

**How to apply:**
```yaml
onlyBuiltDependencies:
  - '@swc/core'
  - argon2       # <-- this line
  - esbuild
  - msw
  - unrs-resolver
```

After editing `pnpm-workspace.yaml`, run `pnpm install` to trigger the build. The install log will show: `argon2@x.y.z install$ cross-env ZERO_AR_DATE=1 node-gyp-build`.
