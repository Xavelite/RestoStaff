# Product contracts

## Roles and routes

| Route | Name | Roles | Purpose |
| --- | --- | --- | --- |
| `/home` | Home | Owner, Manager | Core module portal and later-module roadmap |
| `/schedule` | Schedule | Owner, Manager | Build, check, publish, and revert shifts |
| `/timesheet` | Time | Owner, Manager | Reconcile badge truth, correct entries, monitor service, and approve weeks |
| `/team` | Team | Owner, Manager | Employees, contracts, access, and leave; payroll data stays owner-only |
| `/restaurant` | Restaurant | Owner, Manager | Areas, positions, services, hours, coverage, and policy |
| `/documents` | Documents | Owner, Manager | Keep private restaurant and employee records with expiry, access, and audit context |
| `/reservations` | Reservations | Owner, Manager | Optional entitlement: configure booking rules and manage bookings; disabled by default |
| `/team/payroll` | Team payroll | Owner | Maintain employee payroll identity and employment values inline with Team |
| `/payroll` | Payroll | Owner | Configure provider-neutral payroll preparation and review readiness |
| `/reports` | Reports | Owner, Manager | Experimental entitlement; disabled until metric contracts are approved |
| `/exports` | Exports | Owner, Manager | Download Schedule and worked-time files; owners may prepare a social-secretariat draft |
| `/badge-terminal` | Badge terminal | Owner, Manager | Pair devices and open the shared touch-first PIN terminal |
| `/my-service` | My service | Employee | Weekly shifts, availability, and requests |
| `/my-time` | My time | Employee | Monthly time, worked hours, leave, and requests |
| `/admin` | Platform admin | Platform admin | Restaurants, account access, read-only previews, pilot feedback, suspension, deletion, and audit |

Badge is an Owner/Manager navigation destination with a deliberately
kiosk-focused page structure. Employees navigate only My service and My time.
Direct URL guards enforce the same boundaries as navigation.

Platform administration is not a restaurant role. It uses a separate audited
entitlement and an AAL2 authenticator session, remains outside the restaurant
shell, and can suspend a restaurant as a complete tenant-access boundary.

Visible product language uses Schedule, Time, Payroll,
Exports, Badge terminal, My service, and My time.
Persisted identifiers such as `planning_status`, `actuals_status`, and
`planned_shifts` remain stable internal database contracts.

## Workflow truth

- Schedule drafts are week-owned, revisioned, and publishable only through the
  server lifecycle. Pending or approved leave and schedule-change requests
  block ordinary assignment until explicitly resolved for the selected record.
  Opening a roster slot is non-destructive; removal is an explicit editor action.
- Time preserves badge truth, corrections, cancellations, live monitoring,
  approval, and reopening. Roster, Calendar, and Live monitor open the shared
  entry editor in place.
- Restaurant-configured service periods own names, order, active state, hours,
  coverage, availability, Schedule, badges, Time, and report
  grouping. Lunch and Evening are starter records, not hard-coded product rules.
- Payroll starts from employee identity and current employment
  facts. Exports produces operational files and an owner-only
  social-secretariat draft from complete weeks. The experimental calculation
  and provider-reconciliation engine is not available to authenticated clients;
  official payroll remains the social secretariat's responsibility.
- Weekly-availability employees can mark a service Available or Not available.
  Time off is a separate, mutually exclusive action whose default type is
  Holiday. Availability and time off cannot occupy the same service slot.
  Historical `partial` values remain readable but are not selectable.
- Fixed-schedule employees request schedule changes; weekly-availability
  employees submit availability. Both regimes share leave actions.
- Invitations are expiring and one-use. A badge PIN authorizes terminal actions
  only and never signs a user into the application.
- Notifications are derived from operational truth. Only personal preferences
  and receipts are directly writable, under owner-row RLS.
- Documents use a private Storage bucket and an atomic database reservation
  before upload. Each file is limited to 10 MB, the included restaurant quota
  is 250 MB, and completed object metadata is verified before the file becomes
  readable. Managers can use management files; owner-only files remain hidden
  from them. Explicit archives keep immutable activity history after the object
  is removed, while cancelled reservations stay out of the visible archive.
- Reservations is a revocable optional entitlement. Availability and table
  assignment are decided transactionally on the server, every lifecycle change
  appends immutable history, and Schedule consumes only a restaurant-scoped
  demand aggregate when the module is enabled. Its current work-area-to-room
  mapping is not the accepted final guest-space architecture.
- Managers can send concise operational messages to all active employees or a
  selected group. Read and acknowledgement receipts are per recipient and phone
  delivery follows each recipient's notification preferences.
- Manager and platform-admin previews are read-only server projections. They do
  not impersonate Auth users, expose mutation RPCs, or change the signed-in
  operator's authorization. Managers can preview employees in their restaurant;
  platform admins can preview Owner, Manager, or Employee personas.
- Pilot feedback carries page and release context automatically. Reporters can
  submit feedback; only platform admins can triage it or write internal notes.
- English is the interface language. English, French and Dutch are account-level
  regional formats for dates and numbers; translated French and Dutch interface
  dictionaries are not part of the current pilot contract. Stored restaurant
  names, areas, positions, and notes
  remain user-authored data and are never machine-translated.

Restaurant areas describe where work happens. Positions describe what people
do. Employees may hold multiple active positions with at most one primary
position. Contract type, work regime, and worker status are separate.
National-registry, bank, salary/cost, tax, and private provider values are
Owner-only; Manager saves preserve those hidden values. Payroll evidence is
provider-neutral and complete-week only.

Team, Restaurant setup, and floor-plan workspaces use server revisions.
Mutations require the revision the browser loaded and reject stale saves
instead of silently replacing another session's work.

## Workspace presentation

The authenticated product uses one compact workspace shell. Module tabs live in
the fixed topbar; filters, period controls, add actions, Save, and Discard stay
in the page toolbar. Schedule, Time, Restaurant, Team, Payroll, and Exports use
shared workspace surfaces, while complete evidence
is opened through Details. Unsaved drafts are guarded before route, period,
restaurant, preview, terminal, or sign-out changes.

Inventory, Recipes, Purchasing & suppliers, Menu costing, Tasks & checklists, and Food safety are Home-only later modules. They do not appear in the everyday sidebar until their operational contracts exist.
