# Program description

Audit date: 2026-08-20

## Purpose and product boundary

PDS is an invite-only, single-tenant project delivery CRM for a small engineering
practice. It combines project hierarchy, tasks, client records, collaboration,
files, knowledge, manual logs, notifications, audit data, and a project chronicle.
The repository describes a typical deployment of 3–15 users and does not model
public registration, multiple customer organizations, billing, subscriptions, or
professional solar/PV calculations.

The current commercially sensible boundary is one isolated deployment and data
plane per customer. The code must not be presented as a shared multi-tenant SaaS
without a tenant-aware redesign and cross-tenant evidence.

## Users and authorization roles

| Role | Intended scope |
|---|---|
| `admin` | Organization-wide administration, users, settings, audit and all projects |
| `manager` | Organization-wide project/client/knowledge operations without full admin controls |
| `member` | Work in projects with an exact `project_members` row |
| `guest` | Narrow external collaboration in explicitly assigned projects and external-visible data |

Authentication uses invitations and password reset; there is no self-sign-up.
Authorization is centralized in a deny-by-default action policy plus project
membership checks. Audit findings document several list/subtree edge cases that
currently bypass the intended exact-membership boundary.

## Principal journeys

1. An admin invites a user; the user accepts the token, creates a password, and
   starts a PostgreSQL-backed session.
2. Managers/admins create hierarchical projects, stages, members, clients and
   contacts; members work with tasks, checklist items, comments and logs.
3. Users upload project/task/knowledge files to staging; a background job moves
   them to Dropbox and records version metadata.
4. Users collaborate through conversations, messages, mentions and notifications.
5. The knowledge base retains article versions; project activity and manual log
   entries feed a chronicle/export view.
6. Admins manage users/settings, storage integration and security audit records.

## Functional surface

The Express API exposes 114 method/path operations. The React SPA contains
dashboard, project, task, client/contact, chat, knowledge, log, archive and admin
views in Ukrainian and Czech. OpenAPI method/path parity is complete at the audit
baseline; runtime schema conformance and generated-client completeness are not.

Primary inputs are invited-account credentials, project/client/task/chat/knowledge
content, dates/statuses/assignments, files up to the configured size limit and admin
configuration. Outputs are browser views, notifications/email, stored records,
downloaded files, audit/CSV data and Markdown/PDF project chronicle artifacts.

The only calculations are operational counters, ordering/version allocation,
calendar-day labels, percentages, hashes, retry delays and report aggregates. There
is no solar design, energy-yield, electrical, structural or financial calculation.

## Data model

The Drizzle schema models 27 application tables across these domains:

- identity: users, invitations, password reset tokens, preferences;
- delivery: projects, project members, stages, tasks, checklist items, activity;
- CRM: clients and contacts;
- collaboration: comments, conversations, members, messages, notifications;
- files: files, links and deletion requests;
- knowledge and records: KB articles/versions, project log entries, information
  blocks, library, settings and append-only security audit.

The session table is created by the session middleware at runtime rather than by
the versioned migration ledger; this is an audited operational gap.

## Integrations and data movement

- PostgreSQL 16 is the system of record for metadata and session state.
- App Storage/GCS, with a local-filesystem fallback, is the staging tier.
- Dropbox is the archive tier and OAuth integration.
- SMTP delivers invitations and password resets in production.
- Replit artifact configuration describes the current hosted packaging.

## Explicit non-capabilities

The program does not currently provide a tenant/org model, commercial entitlement
or metering, invoicing, a public partner API, complete customer export/erasure and
retention workflows, a complete object-storage backup/restore procedure, signed
release artifacts, or an engineering calculation engine. Absence of these
capabilities is a commercialization constraint, not an implicit promise.

## Deployment and maturity

The implemented packaging targets separate Replit API and static SPA artifacts with
PostgreSQL, SMTP, App Storage/local staging and optional Dropbox integration.
Compose is a development dependency fixture rather than a full self-hosted product.
A local licensed package, dedicated hosted service and hybrid control plane are
commercial design options; they are not all current deployment capabilities.

Maturity is **working product baseline / pre-commercial hardening**, not GA. Core
static checks and the API build pass locally, while unit/full-build/SCA gates have
current failures and production-like data/provider/recovery evidence is missing.
The commercial vision is a supportable isolated-customer deployment first, with
entitlement/version/health control separated from customer project content.

## Current status boundary

This document describes observed behavior and intent. It is not a production
certification. Current evidence, failures, blockers and confidence are maintained
in `PROJECT_AUDIT_STATUS.md` and `audit/FINDINGS_REGISTER.md`.
