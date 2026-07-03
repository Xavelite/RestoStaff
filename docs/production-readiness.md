# Production readiness

## Implemented application foundation

- Typed SvelteKit/Svelte 5 static SPA with strict role-aware routes.
- Runtime Supabase environment validation and one authenticated workspace shell.
- Transactional RPC boundaries for Planning, Actuals, Team, Restaurant,
  employee availability and absences.
- Shared four-metric, panel, dialog, toast, toolbar, tabs, workbench, setup-guide
  and adaptive calendar systems.
- Resumable owner onboarding, invitation acceptance and a service-role Edge
  Function for staff invitations.
- Badge terminal UI wired exclusively to the hardened one-use-token contract.
- Private workspace realtime client for planning, actuals and notification refresh.
- Expiring one-use staff invitations, server-backed onboarding recovery,
  account/password recovery and guarded disposable role fixtures.
- Optional privacy-minimal client error reporting through
  `PUBLIC_ERROR_ENDPOINT`, plus offline/reconnect feedback.
- Automated model, TypeScript/Svelte and production-build validation through
  `npm run validate`.

## Database baseline

The linked development database is aligned through migration `202606270039`.
The application uses the restaurant-native model: Areas replace
departments/teams/zones, employees can hold multiple positions, contract type
and work regime are separate fixed concepts, payroll exports are
provider-neutral and immutable, and operational lifecycle evidence is retained.

Public business tables are RPC-only with RLS enabled, except the intentionally
personal notification preferences/receipts surface, which uses narrow
authenticated table grants plus owner-row RLS. Browser and service-role routines
use explicit separate allowlists, and generated Supabase types are regenerated
from the deployed development schema.

Apply and verify future changes with `docs/DATABASE-MIGRATION.md`. Generated
types must never be hand-edited to simulate a deployment.

## Remaining authenticated release gates

- Deploy and verify `send-employee-invitation`, `upload-badge-proof` and
  `get-badge-proof` with `APP_ORIGIN` configured for staging/production.
- Verify private Realtime policies and event producers.
- Create disposable owner, manager and employee fixture accounts.
- Run every journey and breakpoint in `docs/ACCEPTANCE.md`.
- Verify keyboard use, screen-reader semantics, contrast and reduced motion.
- Test overnight services, timezone boundaries, stale revisions, reconnects,
  invitation expiry, PIN lockout and token replay.
- Configure client/Edge Function monitoring, backups and a tested rollback procedure.
- Execute every item in `docs/RELEASE-CHECKLIST.md` on staging.

## Notification data-access contract

- Notification items are derived from operational source truth, not stored as a
  mutable public `notifications` table.
- `notification_types` is a read-only authenticated catalog.
- `notification_preferences` and `notification_receipts` are the only direct
  authenticated table-write surface. They are scoped to the current profile and
  active restaurant membership by RLS, and they store only personal UI state.
- Notification trigger helpers are not directly executable by browser or
  service clients.
- Every app-owned SQL/PLpgSQL routine has an explicit `search_path`.
- Actuals approval can auto-finalize a past draft Planning baseline, but the
  finalized baseline still enforces missing-badge approval guards before payroll
  truth can be approved.
