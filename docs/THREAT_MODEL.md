# Threat model

## Scope and assumptions

This model covers the CRM Solar web application, PostgreSQL, SMTP, App Storage
and Dropbox integrations. It assumes a single engineering practice deploys one
instance, users are invited rather than self-registered, and TLS is terminated
by the hosting platform. It does not assume multi-tenancy or public anonymous
project access.

## Assets and trust boundaries

| Boundary | Assets crossing it | Existing controls |
| --- | --- | --- |
| Browser → API | sessions, project data, uploads | session auth, origin policy, Zod validation, rate limits |
| API → PostgreSQL | users, project records, activity/audit data | parameterized Drizzle/pg queries, migrations, DB constraints |
| API → SMTP | invitation/reset links | SMTP-only production configuration; tokens not returned in SMTP mode |
| API → object storage/Dropbox | file bytes and archive credentials | allowlisted MIME/size, encrypted Dropbox token, storage cleanup on DB failure |
| CI → repository | source, dependency lockfile, release artifacts | frozen pnpm install, audit, codegen/parity checks |

## Priority threats

| Threat | Likelihood | Impact | Priority | Current mitigation / next action |
| --- | --- | --- | --- | --- |
| Cross-project IDOR | Medium | High | High | Exact `project_members` resolver and negative integration matrix; extend matrix for every new domain route. |
| Invitation/reset token disclosure | Low | High | Medium | Hashed DB tokens, SMTP responses hide raw token, console mode prohibited in production. Keep logs free of links/tokens. |
| Unsafe upload or archive compromise | Medium | High | High | MIME/size limits and membership checks exist. Add malware scanning only if real file-sharing risk requires it. |
| Credential/secret publication | Medium | High | High | `.env` ignored and public snapshot must run secret scan. GitHub secret scanning is a release gate. |
| Resource exhaustion | Medium | Medium | Medium | Auth limits/body limits exist. Add endpoint-specific limits for uploads and chronicle export before broad internet exposure. |
| Activity/audit integrity loss | Low | High | Medium | Activity writes share domain transactions; audit log has immutable DB triggers. Continue failure-injection coverage. |

## Attacker model

Consider an unauthenticated internet client, a legitimate low-privilege guest,
and a compromised ordinary member account. They may know UUIDs from links or
browser history and can send arbitrary HTTP requests. They cannot directly
connect to PostgreSQL, access hosting secrets, break TLS, or obtain a valid
administrator session without a separate compromise.

## Open questions

- Is the production instance publicly reachable or VPN/reverse-proxy limited?
- Does uploaded content include regulated personal data or customer secrets?
- Who owns backup retention and incident response?

Those answers change the relative priority of malware scanning, WAF/rate limits,
data retention and external monitoring, but do not change the existing access
control requirements.
