# Page naming — canonical reference

Restogogo's surfaces were originally named after their *data* (Planning, Actuals,
Restaurant…), which reads too technical for a restaurant manager. This file is the
canonical, business-friendly naming.

**Scope of the rename:** user-facing **labels and page titles only**. Routes, DB
objects, and component/file names are intentionally left unchanged — see
[Deferred](#deferred-align-later-only-if-desired). Keep this in mind before any DB
or route alignment work.

## Mental model — the verb trilogy

The three daily manager surfaces tell one story: **build → run → close**.

- **Schedule** — build next week.
- **Home** — run today.
- **Timesheet** — close last week (→ payroll).

Everything else is supporting (people, venue setup) or a separate mode (the clock).

## Manager surfaces

| Route (unchanged) | Old label | New label | Purpose |
|---|---|---|---|
| `/home` | Home | **Home** | Run today — live floor, exceptions, the one thing to act on now |
| `/planning` | Planning | **Schedule** | Build and publish next week's shifts |
| `/actuals` | Actuals | **Timesheet** | Confirm worked hours, approve, export payroll (hero voice: "the close") |
| `/team` | Team | **Team** | People: contracts, pay readiness, time off |
| `/restaurant` | Restaurant | **Setup** | Configure areas, positions, services, opening hours |
| `/coverage` | Coverage | **Coverage** | Configure staffing rules that Schedule uses for gap detection |
| `/badge-terminal` | Badge | **Time clock** | Shared PIN kiosk to clock in/out — a launchable *mode*, not a daily nav peer |

Manager top-nav is best as the daily trio plus setup surfaces (Home · Schedule ·
Timesheet · Team · Setup · Coverage). Time clock is a mode you launch, not a
daily nav peer. Consider visually grouping the daily trio
(Home/Schedule/Timesheet) apart from the management surfaces (Team/Setup/Coverage).

## Employee surfaces

Today: two pages — **Shifts** (quick weekly availability/absence dashboard) and
**Calendar** (full month recap with detail).

**Recommended target: one page — "My time" — with a timeframe toggle.**
Week view = the quick availability/absence dashboard (default, the frequent action);
Month/longer view = the detailed recap. It is the same data zoomed plus a mode shift
(act vs review), so one surface with a Week/Month toggle is simpler for a casual
phone user than two pages. Make the **week view the action-first default**.

Also (no new page): surface each employee's **worked hours** on their own schedule
for pay transparency — fold into the past/week view.

| Route | Old label | Target |
|---|---|---|
| `/shifts` + `/calendar` | Shifts, Calendar | **My time** — one page, Week/Month toggle — *pending build (structural merge, not a label rename)* |

## Done in this pass

- Manager top-nav **labels** renamed (`+layout.svelte`).
- Manager page **`<title>`** tags renamed.

## Deferred (align later only if desired)

- **Routes** (`/planning`, `/actuals`, `/restaurant`, `/badge-terminal`) — unchanged.
  Renaming them touches role-routing, the `data-atmosphere` keys, readiness links and
  every `href`. Optional future map: `/planning→/schedule`, `/actuals→/timesheet`,
  `/restaurant→/setup`, `/badge-terminal→/time-clock`.
- **DB** — `work_weeks.planning_status` / `actuals_status`, `planned_shifts`, etc. keep
  their names. "Planning/Actuals" stay accurate *domain* terms even though the *UI*
  now says Schedule/Timesheet. No DB rename is required for the label change.
- **Component/file names** — `planning/`, `actuals/`, `PlanningServiceMap`, etc. unchanged.
- **Per-page hero voice** — Codex owns the creative copy; it should reflect the new
  names/verbs (Schedule / Timesheet / Setup / the close) but is not part of this
  mechanical label rename.
- **Employee merge** — Shifts + Calendar → "My time" is a structural change to design
  and build separately; the two pages stay until then.
