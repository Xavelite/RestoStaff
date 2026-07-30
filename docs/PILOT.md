# Pilot baseline

This document records the product decisions behind the development baseline.
It prevents a future redesign or audit from silently reopening settled scope.

## Decisions

| Topic | Pilot decision |
| --- | --- |
| Tenant | One restaurant is one independent venue. Chains, shared legal employers, and organization billing are later architecture. |
| Services | Service periods are restaurant-configurable text keys with names, ordering, active state, hours, coverage, availability, badges, Schedule, Timesheet, and reporting support. Lunch and Evening are starter data only. |
| Workforce | Team, Restaurant, Schedule, Time & attendance, Badge, employee self-service, notifications, Documents, Exports, and Payroll preparation are the core pilot. |
| Reservations | Optional, server-gated, and disabled by default until its separate guest-space model and public acceptance are approved. |
| Reports | Disabled by default until elapsed-window metric contracts and business sign-off replace the current exploratory comparisons. |
| Payroll | Preparation/export only. Experimental calculation and provider-reconciliation RPCs are quarantined from authenticated clients. |
| Sensitive HR | Owner-only: national registry, bank, salary/cost, tax, and private provider data. Managers retain operational employee and contract access. |
| Signup | Invitation/allowlist-controlled pilot access. Public visitors may request access but cannot create a tenant without approval. |
| Editing | Broad Team, Restaurant, and floor-plan saves require expected revisions and reject stale writes. |
| Administration | Platform-admin allowlist plus an AAL2 authenticator session; every mutation is audited. |

## Pilot acceptance

The repository is ready to propose for a pilot only after these are recorded
against a disposable hosted environment:

- empty-project migration replay and generated-type equality;
- Owner, Manager, fixed-schedule Employee, and availability Employee journeys;
- invitation, Schedule publish/revert, stale-write conflict, leave,
  availability, badge/break/resume, correction, approval/reopen, export,
  message/acknowledgement, notification, document, and role-boundary checks;
- 1440, 1024, 390, and 360 pixel browser checks plus keyboard/focus review;
- real Android and iOS PWA/push checks and target badge-device checks;
- configured monitoring with a test alert, named response owner, and release ID;
- backup restore drill and rollback rehearsal;
- reviewed employee privacy notice, processor/subprocessor list, retention
  schedule, support contact, and public-booking notice if Reservations is used;
- production Auth redirects, Edge secrets, scheduler, weather provider terms,
  CSP/HSTS response verification, and admin MFA enrollment.

Passing source tests is necessary but is not evidence for OS permission
dialogs, push delivery, managed backup restoration, legal review, or human
workflow usability. Record those separately; never mark them green by
inspection.

## Non-goals

The workforce pilot does not promise multi-venue organizations, official
payroll, declarations, payslips, accounting, CRM, deposits, recipe costing,
purchasing, HACCP, or other Home roadmap modules.
