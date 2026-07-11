# Product contracts

## Roles and routes

| Route | Name | Roles | Purpose |
| --- | --- | --- | --- |
| `/home` | Home | Owner, Manager | Live operations and priority actions |
| `/schedule` | Schedule | Owner, Manager | Build, check, publish, and revert shifts |
| `/timesheet` | Timesheet | Owner, Manager | Reconcile work, approve weeks, and export payroll |
| `/team` | Team | Owner, Manager | Employees, access, contracts, payroll readiness, and leave |
| `/restaurant` | Restaurant | Owner | Areas, positions, services, hours, coverage, and policy |
| `/badge-terminal` | Time clock | Owner, Manager | Shared touch-first PIN terminal |
| `/my-service` | My service | Employee | Weekly shifts, availability, and requests |
| `/my-time` | My time | Employee | Monthly time, worked hours, leave, and requests |

Time clock is a normal Owner/Manager navigation destination with a deliberately
kiosk-focused page structure. Employees navigate only My service and My time.
Direct URL guards enforce the same boundaries as navigation.

Visible product language uses Schedule, Timesheet, My service, and My time.
Persisted identifiers such as `planning_status`, `actuals_status`, and
`planned_shifts` remain stable internal database contracts.

## Workflow truth

- Schedule drafts are week-owned, revisioned, and publishable only through the
  server lifecycle. Pending or approved leave and schedule-change requests
  block ordinary assignment until explicitly resolved for the selected record.
- Timesheet preserves badge truth, corrections, cancellations, approval,
  reopening, and immutable owner-only payroll exports.
- Employee availability is Available or Unavailable. Historical `partial`
  values remain readable but require replacement and are never selectable.
- Fixed-schedule employees request schedule changes; weekly-availability
  employees submit availability. Both regimes share leave actions.
- Invitations are expiring and one-use. A badge PIN authorizes terminal actions
  only and never signs a user into the application.
- Notifications are derived from operational truth. Only personal preferences
  and receipts are directly writable, under owner-row RLS.

Restaurant areas describe where work happens. Positions describe what people
do. Employees may hold multiple active positions with at most one primary
position. Contract type and work regime are separate. Payroll evidence is
provider-neutral and complete-week only.
