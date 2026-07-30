# Architecture

Restogogo is a SvelteKit 2 and Svelte 5 static SPA backed by hosted Supabase.
The browser uses a publishable key; authorization remains in grants, RLS, and
transactional RPCs.

## Repository map

- `src/routes`: pages, loading, mutations, and route-owned orchestration.
- `src/lib/api`: typed RPC calls and read-model validation.
- `src/lib/<domain>`: shared business projections and domain UI for Schedule,
  Time, Team, Restaurant, employee self-service, reservations,
  notifications, payroll, and calendar behavior.
- `src/lib/workspace-ui`: the current compact-workspace component set, navigation,
  draft models, and shared visual contract. The name is an internal namespace,
  not a second or legacy product shell.
- `src/lib/app-shell` and `src/lib/workspace`: authenticated navigation, page
  framing, toolbars, dialogs, and workspace-level behavior.
- `src/lib/communications`: operational messages, delivery receipts, and their
  phone-notification projection.
- `src/lib/preview` and `src/lib/feedback`: read-only role projection and
  contextual pilot-reporting boundaries.
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

Restaurant module entitlements are server-owned. Navigation and route guards
provide the early user experience; PostgreSQL independently protects enabled
modules and public Edge channels. Reservations and Reports are disabled by
default, while Payroll means preparation/export only. Route-level SvelteKit
chunks keep disabled modules out of the normal navigation path.

Broad Team, Restaurant, and floor-plan models carry workspace revisions.
Mutation RPCs compare the browser's expected revision inside the transaction
and return a conflict before replacing newer work.

`/admin` is a platform-operator console outside the restaurant app shell. Its
authenticated RPCs enforce a separate platform-admin entitlement plus an AAL2
authenticator session, and every operator mutation is audited. Restaurant roles
never imply platform access.
Its preview picker reads dedicated reduced models; it never changes the Auth
session or adopts another person's authorization.

Normal authenticated pages use one app topbar, role-aware navigation, a
compact module toolbar, and a focused workspace. Route groups own related
subtabs without creating another shell. Mobile keeps the same routes and
authorization contracts while selected-day views replace wide weekly boards
where that improves the workflow. Dense editable setup grids use bounded local
scrolling rather than forcing page-level overflow.

`EmployeeSlotDialog` in `src/lib/employee` owns shared employee service-slot
actions. Onboarding, authentication, Badge, public reservation booking, station
mode, and platform administration remain purpose-built because their
interaction models are not normal restaurant workspaces.

Components under a domain folder are domain-shared. Components under
`src/lib/components` are global primitives. Markup that serves only one route
stays route-local until sharing removes real duplication.

## Runtime boundaries

Focused read-model RPCs prevent pages from loading unrelated private data.
Mutations return compact acknowledgements and routes reload the owning model.
Live workspace refreshes use one application-owned event row per restaurant.
Postgres Changes streams that row through its normal tenant RLS; authenticated
clients publish only through a membership-checking RPC. Badge proofs use a
private Storage bucket and short-lived signed reads through Edge.

Edge source uses pinned Deno imports and is checked with Deno's official
dev-only npm runtime. Its downloaded binary remains in `node_modules`, is absent
from production bundles and Git archives, and keeps Edge validation reproducible
on Windows and CI.

The notification bell and Web Push dispatcher derive from the same operational
notification rules. Browser capability endpoints are profile-owned and hidden
behind registration RPCs; restaurant preferences select in-app and phone
channels independently. The `dispatch-push` Edge Function is scheduler-only,
authenticated by `PUSH_DISPATCH_SECRET`, and records a per-device delivery
ledger before sending so repeated runs remain idempotent.

Restaurant communications are RPC-only. Managers can send a message to all
active employees or a deliberate subset and can request acknowledgement.
Employees can read and acknowledge only their own receipt rows. Realtime
invalidation refreshes the same secure communications read model. Messages are
the single team-contact workflow; urgency and recipient selection cover both
general updates and last-minute staffing requests without a parallel inbox.

Preview mode is an application-owned, read-only projection with a persistent
identity banner and inert mutation controls. Pilot feedback captures route,
release, role, locale, viewport, and browser context through a security-definer
RPC; the platform-admin inbox owns triage status and internal notes.
