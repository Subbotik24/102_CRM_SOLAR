# Commercialization readiness

Assessment date: 2026-08-20

## Decision

**Not ready for GA or a paid production service.** The best near-term model is
managed isolated single-tenant hosting. A controlled design-partner pilot becomes
reasonable only after the applicable P1 security/data/storage blockers and recovery
gate close. Shared multi-tenant SaaS and a public hosted API are not supported by
the current data/auth architecture.

This is an engineering/commercial-readiness assessment, not legal advice.

## Delivery model comparison

| Model | Current fit | Main trade-off |
|---|---|---|
| Managed isolated single-tenant | **Recommended** after release gates | Preserves current model and strong isolation; higher per-customer infrastructure cost |
| Local licensed/self-hosted | Medium after packaging | Customer controls data, but upgrade/backup/support variance is high; MIT core favors support/maintenance/enterprise distribution revenue |
| Hybrid control plane + dedicated customer data plane | Strong strategic target | Central entitlement/version/support with isolated data; requires a robust offline/grace/update contract |
| Shared multi-tenant SaaS | Low | Better unit economics only after a tenant rewrite across every table/query/job/storage/audit path |
| Hosted API + thin client | Low | Needs OAuth/service accounts, scopes, API versioning, quotas and idempotency; current API uses same-origin sessions |

## Recommended target architecture

1. A small control plane stores customer/deployment identity, plan/entitlements,
   licensed seats/storage/features, invoice metadata, release channel/version,
   health and backup state. It does not store project content.
2. Each customer receives one dedicated current-style React/API/PostgreSQL data
   plane with customer-specific storage, SMTP and keys.
3. File transfer/deletion uses a durable outbox/worker and reconciliation.
4. The app stays same-origin; central telemetry is privacy-aware and versioned.
5. The data plane receives a signed entitlement snapshot with an explicit grace
   policy; billing failure must not corrupt project data.

## Entitlement, licensing and billing options

| Option | Appropriate use | Required design |
|---|---|---|
| Managed subscription | Recommended hosted model | Control-plane plan/subscription, seats/storage/features, signed entitlement snapshot, grace/suspension that never corrupts customer data |
| Perpetual self-hosted + maintenance | Viable after packaging | Signed offline license tied to customer/deployment, non-destructive expiry of updates/support, offline recovery and transfer policy |
| Time-limited/offline activation | Viable for hybrid/on-prem | Signed renewable lease, clock rollback tolerance, auditable manual activation and emergency grace |
| Floating/network license | Only if enterprise demand proves it | Highly available license service, borrow/offline behavior, seat concurrency and customer network support |
| SaaS/API usage entitlement | Not near-term | Tenant/service-account auth, idempotent metering, quotas, overage/denial policy and dispute/audit records |

For a hosted subscription, the future billing state machine must explicitly cover
plan catalog, trials, subscription create/change/cancel, invoice/tax provider,
payment failure and grace, refunds/credits where required, seat/storage/feature
metering, idempotent webhooks/reconciliation and customer-visible usage. No billing
provider or logic is implemented or authorized in this phase.

## Readiness scorecard

| Dimension | Status | Evidence / gap |
|---|---|---|
| Core product breadth | AMBER | Broad CRM/project/collaboration surface exists; several high-integrity workflows are defective |
| Authentication baseline | AMBER | Strong session/password/token controls; reset/invite races and anonymous errors remain |
| Authorization | RED | Central deny-by-default exists, but subtree/client/file/stage/assignment edge cases cross intended scope |
| Data integrity/history | RED | User deletion, archive, cursor, chronicle, event and deletion-request defects |
| File lifecycle | RED | Worker race/fallback mismatch, missing Dropbox delete, memory/cost limits |
| Recovery | RED | DB runbook exists; all-tier backup/restore/RPO/RTO evidence absent |
| API/integration quality | AMBER | 114/114 path parity; semantic contract/auth/error/DTO conformance incomplete |
| Operations/support | RED | No metrics/alerts/incident/on-call/diagnostic bundle or current provider evidence |
| Packaging/release | RED | Replit-specific, no complete self-hosted package, signed manifest, supported-version/EOL policy |
| Privacy/data lifecycle | RED | Inventory exists only by audit; retention/export/erasure/offboarding/subprocessors not productized |
| IP/dependencies | AMBER | MIT core and permissive production snapshot; high advisory, no SBOM/policy, unknown dev metadata |
| Accessibility/localization | AMBER | uk/cs parity and basic mobile smoke; semantic/keyboard/screen-reader gate absent |
| Commercial controls | RED | No customer registry, entitlement, metering, quotas, support/SLA or billing metadata |

## Commercial and legal-operational inventory

The product processes account identity/auth data; client contact data; project,
task, comment, chat, knowledge and log content; uploaded filenames, hashes and
bytes; Dropbox account/path metadata; activity/audit actor/action/IP data; and data
replicated into backups/logs. External processors/subprocessors may include the
hosting/storage provider, Dropbox, SMTP provider and Google Fonts.

Before charging customers, define:

- controller/processor roles appropriate to the model, purposes and legal bases;
- retention and deletion for every table/storage/log/backup class;
- access, correction, export, erasure and offboarding procedures;
- subprocessor, residency and transfer inventory;
- breach/incident response and customer communication workflow;
- support hours, severity, response targets, maintenance windows, SLA exclusions;
- version support/EOL, upgrade responsibility and rollback window;
- SBOM, license/NOTICE, fonts/assets/container/Action provenance and contributor IP;
- trademark/brand policy and how MIT-licensed existing code is monetized.

## Unit-economics evidence to collect

Do not price from repository constants alone. Measure per customer/deployment:

- API/worker CPU and memory by journey, peak concurrent uploads and autoscale time;
- PostgreSQL size, connections, query latency, backup size and restore duration;
- staging/Dropbox stored bytes, file growth, transfer/retry/orphan count and egress;
- requests by polling/endpoint/user, email volume and provider failures;
- logs/metrics/traces retention and ingestion;
- deployment, upgrade, incident and ordinary support labor;
- licensed third-party/provider minimums and per-seat/request/storage charges.

These measurements determine plan limits, included storage/seats, overage policy,
support margin and whether dedicated hosting is economically viable; no monetary
values are inferred here.

## Minimum commercial release evidence

- All applicable P1 findings closed with regression/failure/concurrency tests.
- Current clean-install lint/typecheck/unit/access/integration/e2e/build/SCA on the
  exact signed/tagged candidate and all supported platforms.
- Production-like SMTP, staging storage and Dropbox upload/download/delete/retry.
- Two clean all-tier restore drills with hashes and declared RPO/RTO/retention.
- Metrics/alerts, on-call owner, incident drill, diagnostic bundle and rollback.
- Full customer export/offboarding and evidenced data/backup expiry.
- Ukrainian and Czech primary journeys, 360px mobile, keyboard, automated
  accessibility scan and manual assistive-technology smoke.
- One release/version manifest, upgrade notes, support/EOL policy, SBOM and
  third-party/IP review.

## Unknowns requiring product-owner decisions

Real user/file/event volumes; required RPO/RTO/SLA; customer residency/compliance;
support capacity; pricing and provider economics; whether clients require local or
hosted delivery; offline/grace entitlement policy; and ownership/provenance of
brand, fonts, translations and outside contributions. These are not safe to infer
from code.
