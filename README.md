# Restogogo

Restogogo is a typed SvelteKit restaurant-operations application for schedules,
worked time, employee self-service, team setup, payroll evidence, and PIN-based
time clock workflows.

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

## Current documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): code and runtime ownership.
- [`docs/PRODUCT-CONTRACTS.md`](docs/PRODUCT-CONTRACTS.md): roles and workflows.
- [`docs/DATABASE.md`](docs/DATABASE.md): baseline, migrations, and verification.
- [`docs/QUALITY.md`](docs/QUALITY.md): tests, browser matrix, and guardrails.
- [`docs/PRODUCTION-READINESS.md`](docs/PRODUCTION-READINESS.md): remaining gates.

## Source archive

Create archives from a committed tree so dependencies, builds, local config,
Git metadata, caches, and Supabase CLI state are excluded:

```powershell
git archive --format=zip --output ..\restogogo-clean-source.zip HEAD
```
