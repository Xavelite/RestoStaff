# RestoStaff Architecture — v209

RestoStaff is a vanilla HTML/CSS/JS restaurant staff planning and operations prototype deployed as a static site. Shared restaurant data is stored in Supabase through a small adapter layer.

v209 establishes the first shared RestoStaff v2 design-system foundation. The approved brand/login page and Employee My Schedule now share common tokens and reusable UI components, while the old operational prototype CSS is isolated as legacy styling until each module is migrated.

## Files

- `index.html` — private dev gate, neutral RestoStaff restaurant access, app shell, employee My Schedule page, dialogs, and Time Clock terminal markup.
- `assets/css/base.css` — shared design tokens, font stack, reset, and tiny utility helpers.
- `assets/css/restostaff-ui.css` — reusable v2 UI components such as v2 page/frame/card, metric grid/card, icon badges, and button-icon interactions.
- `assets/css/brand.css` — private gate and RestoStaff brand/login entry page styling.
- `assets/css/employee-schedule.css` — Employee My Schedule page-specific layout, shift cards, icons, and active employee shell overrides.
- `assets/css/legacy-app.css` — old prototype app shell, calendar geometry, sticky headers/columns, terminal styling, themes, and non-migrated module-specific styling.
- `assets/js/config.js` — Supabase/runtime configuration.
- `assets/js/data-adapter.local.js` — local prototype session/preferences/workspace compatibility.
- `assets/js/data-adapter.supabase.js` — Supabase workspace storage through `public.planner_state`.
- `assets/js/app.js` — planning, employee My Schedule, costs, dashboard, setup wizard, workspaces, notifications, Time Clock manager, terminal logic, Inventory, Daily Close, Team / HR, Exports, and Reservations / Covers Forecast.
- `docs/TEST_CHECKLIST.md` — manual regression checklist for future changes.
- `docs/CODE_REVIEW_v209.md` — notes for the v2 design-system foundation split.

## Storage

Current prototype storage:

```txt
public.planner_state
- id text primary key
- data jsonb not null
- updated_at timestamptz default now()
```

Each restaurant workspace is one row. The `data` object contains restaurant identity, employees, positions, zones, planning, availability, swaps, history, notifications, time entries, inventory, daily close, HR/absences, and forecast data.

Supabase is the source of truth for shared app data. The app should not silently fall back to local-only planner data when Supabase fails.

## Restaurant object

```js
restaurant: {
  name,
  ownerName,
  city,
  logoUrl,
  accentColor,
  theme // "modern-light" or "modern-dark"
}
```

## Main state areas

The current one-row JSON state includes, broadly:

```js
{
  restaurant,
  weekStart,
  status,
  employees,
  positions,
  zoneRules,
  positionColors,
  zoneColors,
  availability,
  assignments,
  assignmentTimes,
  submitted,
  notes,
  swaps,
  history,
  notifications,
  timeEntries,
  inventory,
  dailyClose,
  hr,
  forecast
}
```

## Prototype access model

Access is intentionally not production auth yet.

- Private development gate: `admin` / `0000`.
- Restaurant owner PIN: `0000`.
- Employee PIN: `0000`.
- Employee manager access is controlled by a lightweight `managerAccess` flag on employee objects.
- No Supabase Auth.
- No production RLS.

Commercial use should move to Supabase Auth, memberships, role permissions, and Row Level Security after product workflow stabilization.

## Workspace routing

The app supports prototype workspace selection in three ways:

1. Main development flow: private dev gate → RestoStaff brand login → app workspace.
2. Query parameter: `?workspace=bouillon-bruxelles` or `?restaurant=bouillon-bruxelles`.
3. Custom subdomain: `bouillon.example.com` maps to the Bouillon workspace alias, and other subdomains map to matching workspace ids.

Subdomain routing is a frontend prototype convenience. During development, the private dev gate still appears before access to any direct restaurant route. Production multi-tenant routing should validate tenant/workspace access server-side after real auth exists.

## Planning

The planning module renders a weekly Monday-Sunday staff calendar with lunch/evening shifts, employee rows, position totals, zone totals, sticky header rows, sticky employee column, and sticky week-total column.

The calendar geometry is delicate. Avoid broad rewrites of calendar HTML/CSS without visual before/after checks.

## Time Clock

The Time Clock module is the current reference for the desired v2 design direction:

- Module landing page.
- Big visual cards.
- Focused subpages for Terminal, Actual Timesheet, and Badge Monitor.
- Tablet terminal mode with employee selection, PIN, photo proof, clock in/out, and success state.

## Costs and Dashboard

The Costs page derives cost, hour, day, employee, position, and zone analysis from current selected plan rows.

The Dashboard uses saved weekly snapshots/history to show longer-term cost, hour, position, and zone trends.

## Operational modules

The current broad prototype includes Inventory, Daily Close / Payments, Team / HR, Absences, Reservations / Covers Forecast, and Exports. These should now be polished rather than expanded with more major modules.

## Setup wizard

The Setup area manages restaurant identity, branding, positions, zones, employees, active status, planning rates, colors, and new workspace creation. It is the natural base for future onboarding.

## Recommended next technical phases

1. Product/design polish with no new large modules.
2. Controlled JS split by module, preserving globals and behavior first.
3. Controlled CSS split by module, preserving selector order and behavior first.
4. Supabase Storage for terminal photos, HR documents/contracts, and logos.
5. Later: real Auth, RLS, billing, and structured SQL tables.


## Current access / split note

The visible restaurant card selector remains removed from the entry flow. During development, users first pass the private dev gate, then use a compact neutral RestoStaff login with restaurant dropdown + username/name + password/PIN. Workspace routing can still be inferred from query string/subdomain, but the prototype dropdown is available while real Auth and restaurant membership do not exist yet. Restaurant creation remains inside future Setup/onboarding work, not the front page.
