# Product contracts

## Roles and routes

| Route | Name | Roles | Purpose |
| --- | --- | --- | --- |
| `/home` | Home | Owner, Manager | Core module portal and later-module roadmap |
| `/schedule` | Schedule | Owner, Manager | Build, check, publish, and revert shifts |
| `/timesheet` | Time & attendance | Owner, Manager | Reconcile badge truth, correct entries, monitor service, and approve weeks |
| `/team` | Team | Owner, Manager | Employees, access, and leave; owner-only contracts and payroll readiness |
| `/restaurant` | Restaurant | Owner | Areas, positions, services, hours, coverage, and policy |
| `/reservations` | Reservations | Owner, Manager | Configure booking rules and floor plans; manage bookings, tables, covers, guests, and service status |
| `/payroll` | Payroll preparation | Owner | Prepare employer and employee data, estimates and approved-hours exports for the social secretariat |
| `/reports` | Reports | Owner, Manager | Parked roadmap module until reporting contracts are redesigned |
| `/badge-terminal` | Badge terminal | Owner, Manager | Pair devices and open the shared touch-first PIN terminal |
| `/my-service` | My service | Employee | Weekly shifts, availability, and requests |
| `/my-time` | My time | Employee | Monthly time, worked hours, leave, and requests |
| `/admin` | Platform admin | Platform admin | Restaurants, account access, read-only previews, pilot feedback, suspension, deletion, and audit |

Badge is an Owner/Manager navigation destination with a deliberately
kiosk-focused page structure. Employees navigate only My service and My time.
Direct URL guards enforce the same boundaries as navigation.

Platform administration is not a restaurant role. It uses a separate audited
entitlement, remains outside the restaurant shell, and can suspend a restaurant
as a complete tenant-access boundary.

Visible product language uses Schedule, Time & attendance, Payroll preparation, Badge terminal, My service, and My time.
Persisted identifiers such as `planning_status`, `actuals_status`, and
`planned_shifts` remain stable internal database contracts.

## Workflow truth

- Schedule drafts are week-owned, revisioned, and publishable only through the
  server lifecycle. Pending or approved leave and schedule-change requests
  block ordinary assignment until explicitly resolved for the selected record.
  Opening a roster slot is non-destructive; removal is an explicit editor action.
- Time & attendance preserves badge truth, corrections, cancellations, live monitoring, approval, and reopening. Calendar and Live monitor deep-link into the same entry editor.
- Payroll preparation starts from employer identity, current employment facts and approved complete weeks. Restogogo may provide basic estimates and immutable export lineage, while official gross-to-net calculation, declarations, settlement and payslips remain the social secretariat's responsibility.
- Flexible employees positively mark a service Available or leave it unselected.
  Time off is a separate, mutually exclusive action whose default type is
  Holiday. Historical `unavailable` and `partial` values remain readable but
  require replacement and are never selectable.
- Fixed-schedule employees request schedule changes; weekly-availability
  employees submit availability. Both regimes share leave actions.
- Invitations are expiring and one-use. A badge PIN authorizes terminal actions
  only and never signs a user into the application.
- Notifications are derived from operational truth. Only personal preferences
  and receipts are directly writable, under owner-row RLS.
- Reservations reuse Restaurant services, opening hours, and work areas.
  Availability and table assignment are decided transactionally on the server,
  every lifecycle change appends immutable history, and Planning consumes only
  the restaurant-scoped demand aggregate.
- Managers can send concise operational messages to all active employees or a
  selected group. Read and acknowledgement receipts are per recipient and phone
  delivery follows each recipient's notification preferences.
- Manager and platform-admin previews are read-only server projections. They do
  not impersonate Auth users, expose mutation RPCs, or change the signed-in
  operator's authorization. Managers can preview employees in their restaurant;
  platform admins can preview Owner, Manager, or Employee personas.
- Pilot feedback carries page and release context automatically. Reporters can
  submit feedback; only platform admins can triage it or write internal notes.
- English is the default account language; French and Dutch are account-level
  presentation settings. Stored restaurant names, areas, positions, and notes
  remain user-authored data and are never machine-translated.

Restaurant areas describe where work happens. Positions describe what people
do. Employees may hold multiple active positions with at most one primary
position. Contract type and work regime are separate. Payroll evidence is
provider-neutral and complete-week only.

## Workspace presentation

The authenticated product uses one classic workspace shell. Module tabs live in the fixed topbar; filters, period controls, add actions, Save, and Discard stay in the page toolbar. Planning, attendance, payroll-preparation, restaurant, and team tables use compact default columns, while complete evidence is opened through Details. Unsaved drafts are guarded before route, period, restaurant, preview, terminal, or sign-out changes.

Reports, Inventory, Recipes, Purchasing & suppliers, Menu costing, Tasks & checklists, and Food safety are Home-only later modules. They do not appear in the everyday sidebar until their operational contracts exist.
