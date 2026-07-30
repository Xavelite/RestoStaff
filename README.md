# Restogogo

Restogogo is a typed SvelteKit restaurant-operations application for Schedule,
Time, employee self-service, restaurant and team setup, payroll handoff,
documents, and PIN-based time clock workflows. It also includes
operational team messages, read-only role previews, Web Push notifications, and
contextual pilot feedback. Reservations is an optional, separately gated track.

## Start

Use Node 22.12 or newer.

```powershell
Copy-Item .env.example .env
npm ci
npm run dev
```

Set `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` in `.env`. The browser
key is public by design; grants, RLS, and authenticated RPCs enforce access.

## Validate

```powershell
npm run validate
npm run verify:database:linked
```

The first command is local and does not contact Supabase. The second executes
the linked database contracts, lint, migration parity, and generated-type
comparison. Database bootstrap and hosted acceptance are documented in
[`docs/DATABASE.md`](docs/DATABASE.md).

## Deploy

This repository is the canonical Vercel source and uses the official SvelteKit
Vercel adapter. Connect this Git repository to Vercel and set the required
`PUBLIC_*` values from `.env.example` for Preview and Production. Before opening
a production environment, apply its database migrations, deploy the five Edge
Functions, provision the platform operator, and configure the push scheduler as
described in [`docs/PRODUCTION-READINESS.md`](docs/PRODUCTION-READINESS.md).

## Current documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): code and runtime ownership.
- [`docs/PRODUCT-CONTRACTS.md`](docs/PRODUCT-CONTRACTS.md): roles and workflows.
- [`docs/PILOT.md`](docs/PILOT.md): settled pilot scope and honest acceptance gates.
- [`docs/DATABASE.md`](docs/DATABASE.md): baseline, migrations, and verification.
- [`docs/DATABASE-MIGRATION.md`](docs/DATABASE-MIGRATION.md): existing-project deployment procedure.
- [`docs/QUALITY.md`](docs/QUALITY.md): tests, browser matrix, and guardrails.
- [`docs/PAYROLL.md`](docs/PAYROLL.md): payroll authority and engine quarantine.
- [`docs/RESERVATIONS.md`](docs/RESERVATIONS.md): optional booking track and unresolved space model.
- [`docs/PRODUCTION-READINESS.md`](docs/PRODUCTION-READINESS.md): remaining gates.

## Source archive

Create archives from a committed tree so dependencies, builds, local config,
Git metadata, caches, and Supabase CLI state are excluded:

```powershell
git archive --format=zip --output ..\restogogo-clean-source.zip HEAD
```
