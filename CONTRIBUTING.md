# Contributing to CRM Solar

Thank you for helping improve CRM Solar. Use GitHub Discussions for proposals
and questions, Issues for reproducible bugs, and Pull Requests for focused
changes.

## Local checks

Use Node.js 24+ and pnpm 11+. Before opening a pull request, run:

```bash
pnpm run verify:core
```

Run database-backed integration and browser tests when your change affects API,
database, authentication, authorization, or UI behavior.

## Contribution rules

- Keep routes thin; business logic and authorization belong in services.
- Every server-side permission decision must use `authorize()`.
- Do not add real credentials, personal data, database dumps, or screenshots
  containing customer data.
- Keep Ukrainian and Czech translation keys in parity.
- Describe public API, database, and migration effects in the pull request.
- Prefer a small focused PR with regression coverage for a fixed bug.
