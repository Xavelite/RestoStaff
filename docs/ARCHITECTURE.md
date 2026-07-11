# Architecture

Restogogo is a SvelteKit 2 and Svelte 5 static SPA backed by hosted Supabase.
The browser uses a publishable key; authorization remains in grants, RLS, and
transactional RPCs.

## Repository map

- `src/routes`: pages and route-owned orchestration.
- `src/lib/api`: typed RPC calls and read-model validation.
- `src/lib/<domain>`: shared business projections for Schedule, Timesheet,
  Team, employee self-service, notifications, payroll, and calendar behavior.
- `src/lib/components`: globally shared presentation primitives.
- `src/lib/styles`: product tokens and shared visual contracts.
- `supabase/migrations`: incremental changes for existing projects.
- `supabase/baseline`: guarded empty-project bootstrap at an intentional cutoff.
- `supabase/functions`: authenticated Edge Functions and shared HTTP policy.
- `supabase/tests`: executable security and workflow contracts.
- `tests`: focused application behavior and high-value structural guardrails.

## Ownership

Routes own loading, mutations, URL state, and page-specific presentation. Pure
domain modules own reusable calculations and selection rules. Supabase owns
authorization and lifecycle invariants. Frontend checks explain server rules
early but never replace server authority.

Normal authenticated pages use the app topbar, `PageHero`, an optional header
command or toolbar, and a focused workspace. `PageScaffold` provides the flex
boundary for pages whose header and operational body need one; full-width native
flows use the same shell spacing directly. `OperationsBoard`
is the shared manager grid; `EmployeeSlotDrawer` in `src/lib/employee` owns the
shared employee service-slot actions. Onboarding, authentication, and Time clock
remain purpose-built because their interaction models are not normal modules.

Components under a domain folder are domain-shared. Components under
`src/lib/components` are global primitives. Markup that serves only one route
stays route-local until sharing removes real duplication.

## Runtime boundaries

Focused read-model RPCs prevent pages from loading unrelated private data.
Mutations return compact acknowledgements and routes reload the owning model.
Realtime broadcasts are private to `workspace:<restaurant-id>` topics. Badge
proofs use a private Storage bucket and short-lived signed reads through Edge.

Edge source uses pinned Deno imports and is checked with the dev-only
`deno-bin` package. Its downloaded runtime is about 100 MB, remains in
`node_modules`, is absent from production bundles and Git archives, and keeps
normal installation plus Edge validation reproducible on Windows and CI.
