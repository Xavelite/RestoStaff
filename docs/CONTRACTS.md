# restogogo product & build contracts

The source of truth for the rebuild. Every screen is checked against this.
The old app (`_v431_extract`) is the **product/UX reference**, not a code source.
The rebuild removes old patches, duplicated CSS, globals, legacy fallbacks and
messy architecture — but **preserves** product truth, business meaning, UX
contracts, visual consistency and source-of-truth logic.

## 1. One shared app shell

The `(app)` layout owns, once, for every authenticated page:

- topbar, navigation, account menu
- auth/session + sign-out/session handling
- workspace/restaurant loading
- route/page mounting
- notifications/messages

No page invents its own shell, loading, session or navigation.

## 2. One shared page rhythm for ALL module pages

Every normal runtime page follows the same base rhythm:

- module/page header
- shared **metrics row** or setup-readiness summary
- main board / workspace / card area
- page-specific content inside shared primitives

Applies to Home, Planning, Actuals, Team, Restaurant, Shifts, Calendar, and
future Dashboard/Payroll/Inventory. **Employee pages are not second-class** —
Shifts and Calendar use the same shell, metric/card system, board/surface logic,
spacing and header logic as the rest of the app.

## 3. Metrics contract

- Operational module pages use **exactly 4 top metrics**, via one shared `MetricsRow`
  → `MetricCard` component. **No page-specific metric rows.**
- Setup modules such as Restaurant and Coverage may use readiness dials/stats
  instead of the four-metric row when the page is primarily configuration, not
  operational review.
- Actuals is **4** metrics, never 5.
- Same component, spacing, height, typography, icon logic, border logic, responsive behavior.
- Home can be more cockpit-like, but reuses the same metric/card language — not a separate visual system.

## 4. Shared visual primitives (one official system)

page shell · module header · metrics · cards · panels/surfaces · board/workspace
containers · buttons/actions · tabs · filters/toolbars · forms/inputs ·
status pills/badges · empty states · messages/toasts · dialogs · calendar
cells/cards · workbench list/detail.

Inner panels/divs follow the **same** visual contract as main panels — no
"main div looks one way, inner div/header looks another" unless it is a
deliberately different component type.

## 5. Module truths

**Home** — cockpit (Today live / Action required / Week pulse / Quick actions /
live monitor). All numbers/statuses from real source-of-truth data; no fake
cockpit numbers or decorative warnings.

**Planning** — employees as **rows**, Mon–Sun **columns**, lunch/evening service
slots; availability; absences; conflicts; publish/revert lifecycle; work-week
events/audit trail; shared `OperationsBoard` contract (see design-decisions.md
"Board contract"). Supports an optional month-wide review lens; publish/revert
always stays scoped to one Monday-start week regardless of that lens.

**Actuals** — exactly **4** metrics; badge/clock truth; actual hours; missing
clock-outs/corrections; planned vs actual variance; same shared page + metric +
**`OperationsBoard`** structure (employees as rows). Its optional month-wide
review lens is a browsing aid only — approval and payroll lifecycle stay
week-owned.

**Team** — employees, contracts, access/invitation lifecycle, absences, payroll
readiness; no unsafe employee fallback; shared workbench list/detail.

Invitation state is email-first and belongs only to `employee_invitations`.
Pending invitations never create profiles, memberships or temporary access
links. Acceptance proves ownership of the invited email, then atomically links
the profile, membership and employee access. Team bulk save may update badge
permission but never identity linkage or access lifecycle state.

**Restaurant** — setup readiness, restaurant identity, work areas,
positions/job functions, opening/service periods and fixed absence defaults.
Departments, teams and zones are not separate product concepts. Owner-only.

**Coverage** — minimum-staffing rules (area × position × service × weekday),
the direct input to Planning's coverage-gap detection. Split out from
Restaurant as its own page: areas/positions/hours are a one-time blueprint,
coverage rules are what an owner revisits as staffing needs change. Both
pages share one save flow (`save_restaurant_model`/`saveRestaurant()`) and
the same `restaurantDraft`/`restaurantSavePayload` model in
`src/lib/restaurant/restaurant-model.ts` — no separate backend contract.
Owner-only.

**Shifts** (employee) — employee-facing schedule view; clear week rhythm;
shifts, availability, leave and work-pattern exception visibility; same
shell/metrics/board rhythm.

**Calendar** (employee) — employee-facing worked-time view; badge/worked time
overview; leave/availability/work-pattern exception context; same
shell/metrics/board rhythm.

**Badge Terminal** — specialized terminal layout; manager/owner-authenticated;
employee PIN challenge; server-owned timestamp; one-use badge token; no quick-login.

**Onboarding** — owner account → restaurant → services/opening hours → areas →
positions → assignments → first employees → review/launch. No old wizard patch
structure; progress is persisted server-side with a local recovery copy.

## 6. Data / source-of-truth

- Supabase/RPC is the source of truth.
- No duplicated business calculations in UI components.
- No fake dashboard data; no silent fallbacks hiding internal errors.
- The app shell loads only workspace bootstrap identity, timezone and readiness.
  It never downloads operational, Team, payroll or setup collections.
- Focused typed read models own manager operations, employee operations, Team
  and Restaurant setup. Manager/employee operational reads require an explicit
  date range and are limited to 63 days.
- Mutations return compact typed acknowledgements. The route that owns the
  affected domain then reloads its focused authoritative read model.
- TypeScript contracts clarify Planning, Actuals, Team, Restaurant, Employee,
  Badge Terminal and Home cockpit data without one universal snapshot type.
- Contract type and work regime are separate. Contract types are the fixed legal
  set CDI, CDD, Flexi, Student, Extra and Freelance. Work regime is one of
  `fixed_schedule`, `weekly_availability` or `manager_only`.
- Employees without completed contract configuration default to
  `weekly_availability`; `manager_only` is always an explicit operational choice.
- Shifts and Calendar expose the same employee self-service actions. Shifts is
  the fast weekly view; Calendar is the monthly context view. Both support
  service-slot availability and time-off selection through shared rules.
- Every calendar day is split into its restaurant service slots. Availability,
  unavailability and conflict color the service-slot background; they are not
  cards. Planned shifts, worked time, leave and badge exceptions are inset cards
  layered inside that service slot. The same presentation contract is shared by
  Planning, Actuals, Shifts and Calendar.
- Direct slot interaction follows the active module mode: employee availability
  stages an available service, employee time off stages the default holiday
  request, Planning creates a default shift, and Actuals opens manual worked-time
  entry. Existing operational cards open details or advanced editing.
- Fixed-schedule one-off unavailability is a `work_pattern_exception`, never an
  absence row or weekly availability rewrite. It has its own audited approval
  lifecycle and does not affect leave balances or payroll.
- Planning weeks, Actuals weeks and time entries use explicit numeric revisions.
  A stale manager action fails visibly and must refresh authoritative truth.
- Published Planning cannot be edited directly. Revert returns it to draft
  without deleting the published shift records; publishing validates conflicts
  and coverage on the server.
- Actuals can be approved only after the week ends and all live, missing,
  conflicting or unaudited entries are resolved. Approved Actuals is immutable
  until explicitly reopened.
- Work-week lifecycle events and time-entry adjustments are append-only
  operational evidence. They record actor, reason, from/to state and a safe
  period snapshot without attempting full event sourcing.
- Absence events and work-pattern exception events follow the same append-only
  evidence contract. Employment contracts are never deleted; once superseded,
  a historical contract cannot be rewritten.
- Employees are deactivated instead of hard-deleted when operational,
  employment, invitation or payroll history exists. Restricted foreign keys
  make accidental evidence loss fail visibly.
- Employees can hold multiple positions through `employee_job_functions`.
- Payroll is generic export/readiness data for a social secretariat; no
  provider-specific configuration belongs in the product model.
- Only owners can create or retrieve payroll export runs. Every run covers
  complete approved Actuals weeks and preserves its exact CSV rows, source
  time-entry revisions, week revisions, totals, actor, timestamp and SHA-256
  fingerprint as immutable evidence.

## 7. Security / auth

Real email/password auth · no quick login · no public restaurant-login list ·
badge terminal gated by an authenticated manager/owner session · employee PIN
only for terminal action (not app auth) · no first-employee fallback ·
clean RLS/RPC boundaries. Every app-owned SQL/PLpgSQL routine has an explicit
`search_path`; browser and service-role execution use separate exact
allowlists, and trigger helpers are never directly callable.

## 8. Responsive

Desktop/tablet/mobile from the component system: page shell, metrics, boards/
workspaces, employee pages all responsive; calendar/grid views adapt instead of
crushing into tiny internal scroll areas.

## 9. Do NOT carry forward

old direct script/style chain · old `config.js` · local Supabase vendor file ·
quick-login history · patch-chain DB as final truth · duplicated CSS systems ·
page-specific metric systems · one-off inner panel/header styles · compatibility
fallbacks hiding internal bugs · fake numbers/statuses · `.git`/`node_modules`/
`dist`/`.env.local` in clean packages.

## Layout decisions

- One-screen overview by default; tabs/sections inside the workbench.
- Compact but readable header + 4 metrics.
- Light page scroll allowed if needed; no tiny crushed internal scrollbars.
