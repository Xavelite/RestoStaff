# restogogo acceptance matrix

This is the release gate for the clean rebuild. The legacy application is
evidence of required product behavior, not a code or layout template.

## Global contracts

| Area | Acceptance |
| --- | --- |
| Roles | Owner, manager and employee see only permitted routes, data and actions. Direct URLs enforce the same boundary as navigation. |
| Page rhythm | Every normal module renders the shared page rhythm: header/context, metric or readiness summary where useful, and a shared board/workbench surface. |
| Data truth | Visible totals and statuses derive from focused typed Supabase read models. The shell, manager operations, employee operations, Team and Restaurant never overfetch one another’s domains. |
| Mutations | Business changes use typed transactional RPCs, return a compact acknowledgement and trigger a focused authoritative reload by the owning module. |
| States | Every route has deliberate loading, empty, error, stale/conflict and success behavior. |
| Accessibility | Keyboard operation, visible focus, labelled controls, semantic status announcements and reduced-motion support are required. |
| Responsive | Desktop, tablet and mobile preserve task meaning. Mobile uses focused cards/day navigation instead of a crushed desktop grid. |

## Route and workflow matrix

| Surface | Roles | Required workflow | Improvement direction | Gate |
| --- | --- | --- | --- | --- |
| Home | Owner, manager | Today live, actions, week pulse, quick actions, setup readiness and notifications | Actionable drilldowns with one-click routing | Values reconcile with source modules |
| Planning | Owner, manager | Employee rows, Monday–Sunday, lunch/evening, availability, absence and work-pattern exception conflicts, notes, copy, publish and revert | Focused mobile day view and explicit conflict resolution | Server publish guards, stable shift IDs, revision conflicts and audit scenarios pass |
| Actuals | Owner, manager | Four metrics, badge truth, corrections, cancellations, approve and reopen | Proof/details drawer, filters and exports | Ended-week approval guards pass; owner payroll exports are reproducible immutable runs |
| Team | Owner, manager | Employees, contacts, access, invitations, contracts, legal identity and absences | Compact list/detail workbench and setup guide | Costs and payroll profiles never reach manager reads or writes |
| Restaurant | Owner, manager | Identity, areas, positions, service periods and fixed absence defaults | Guided readiness workbench | Managers can operate setup without receiving financial fields |
| Coverage | Owner, manager | Minimum-staffing rules by area, position, service and weekday | Dedicated staffing-rule workbench separate from one-time restaurant setup | Planning coverage gaps reconcile with saved staffing rules |
| Shifts | Employee | Published schedule, multi-slot availability, time-off and fixed-schedule change actions | Fast weekly editing with one final save | Unpublished manager planning is never exposed |
| Calendar | Employee | Worked time, explicit Lunch/Evening slots, availability, leave, exceptions and balances | Month context using the same self-service actions as Shifts | Employee can access only their own records |
| Onboarding | New owner | Account through review/launch with resume | Clean stepper with server persistence and local recovery | Refresh/device recovery does not lose completed state |
| Invitation | Invited staff | Receive an email-first invitation, accept an expiring token, set app password and separate badge PIN | Explicit expiry, resend and wrong-account guidance | Pending invitations create no membership; token is one-use; no PIN can authenticate the app |
| Badge terminal | Owner, manager terminal | Roster, PIN challenge, one-use token and server timestamp | Fast touch-first kiosk flow | Lockout, replay and timezone tests pass |

## Restaurant-native model gate

- Existing zone UUIDs become work-area UUIDs; auth/profile/membership/access IDs do not change.
- `departments`, `teams`, `zones` and their foreign-key columns are absent after migration.
- Employees may have multiple active positions and at most one primary position.
- CDI/CDD default to fixed schedule; Flexi/Student/Extra default to weekly availability.
- Employees without a configured contract type default to weekly availability;
  manager-only scheduling must be selected explicitly.
- Contract types are exactly CDI, CDD, Flexi, Student, Extra and Freelance.
- Absence types are exactly Holiday, Sick leave, Unpaid leave, Public holiday and Other.
- Payroll export contains matricule, names, national number, date, start/end,
  break minutes and net hours without a provider-specific configuration.
- Payroll export accepts complete Monday-to-Sunday ranges only after every
  included Actuals week is approved. Managers cannot create, list or retrieve
  payroll runs, and owners can re-download the exact recorded CSV later.

## Responsive checkpoints

- Desktop: 1440×900 and 1280×720.
- Tablet: 1024×768 and 768×1024.
- Mobile: 390×844 and 360×800.
- Weekly manager boards retain the employee-by-week grid on desktop.
- Tablet may compact controls but cannot remove operational truth.
- Mobile defaults to one selected day, employee cards and service sections.
- Horizontal scrolling is optional comparison, never the only primary workflow.

## Phase gate rule

A phase closes only when its affected rows have automated business tests,
successful `npm run validate`, and role-based manual checks at relevant
responsive checkpoints. Deferred behavior must be explicit in
`docs/production-readiness.md`; silence is not acceptance.
