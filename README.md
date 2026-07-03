# restogogo

The typed SvelteKit rebuild of the restogogo restaurant-operations application.
The legacy application remains the behavioral reference until each workflow has
been migrated and accepted here.

## Product surface

- Home: operational pulse and action cockpit.
- Planning: employee-row weekly grid with week-owned draft/publish lifecycle.
- Actuals: employee-row weekly grid, corrections and weekly approval.
- Team: employee, access, contract, payroll and absence management.
- Restaurant: areas, positions, opening hours, coverage and policy setup.
- Shifts: employee weekly shifts and availability submission.
- Calendar: employee monthly shifts, worked time, availability and leave.
- Onboarding and invitation acceptance.
- Authenticated, one-use-token badge terminal.

## Local setup

```powershell
Copy-Item .env.example .env
npm install
npm run dev
```

Configure these public browser values in `.env`:

```text
PUBLIC_SUPABASE_URL
PUBLIC_SUPABASE_ANON_KEY
```

The publishable Supabase key is safe to expose to the browser; database security
must remain enforced by authenticated RPCs, grants and RLS.

## Validation

```powershell
npm run validate
```

This runs the business-model regression tests, Svelte/TypeScript diagnostics
and a production build.

## Architecture

```text
src/lib/supabase     generated database types and the single Supabase client
src/lib/api          typed RPC boundaries and snapshot validation
src/lib/workspace    authenticated workspace state
src/lib/home         pure Home cockpit business model
src/lib/components   shared presentation primitives
src/routes/(app)     authenticated, role-guarded product routes
```

Business rules are rebuilt cleanly rather than copied blindly. The legacy app
defines accepted behavior; this codebase owns the new implementation.

The restaurant-native domain uses one `work_areas` concept for where work
happens, `job_functions` plus `employee_job_functions` for what people do,
fixed legal contract types, and a separate explicit work regime.

## Deployment

The application builds as a static SPA with an `index.html` fallback. Configure
the host to serve that fallback for unknown routes. Before production rollout,
apply the reviewed ordered migrations, deploy the invitation function and
regenerate `database.types.ts`; see
[`docs/production-readiness.md`](docs/production-readiness.md).
