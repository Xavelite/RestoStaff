# restogogo — v355 shared visual architecture polish

This package is the first real prototype foundation for restogogo:

**Team + Restaurant master data → Planning → Badge Terminal → Actuals → Export**

Active surfaces:

- Login / workspace access
- Employee Schedule
- Planning
- Actuals
- Badge Terminal
- Team management
- Restaurant management

## Stack

- Vanilla HTML/CSS/JS
- Static hosting target: Vercel
- Supabase REST API
- Supabase Postgres relational tables for core business data
- JSONB only for flexible settings/preferences
- Simple pilot PIN/login only

## Important technical change

This build no longer uses the old `public.planner_state` JSONB row as the operational database.

Core data now lives in normalized Supabase tables:

```txt
restogogo_restaurants
restogogo_employees
restogogo_employee_absences
restogogo_employee_documents
restogogo_restaurant_documents
restogogo_positions
restogogo_zones
restogogo_opening_hours
restogogo_weekly_status
restogogo_availability_slots
restogogo_planned_shifts
restogogo_employee_week_submissions
restogogo_weekly_notes
restogogo_actual_shift_entries
```

Flexible config remains JSONB:

```txt
restogogo_restaurants.settings
restogogo_restaurants.payroll_rules
restogogo_restaurants.ui_preferences
```

The frontend still hydrates these tables into one runtime state object because the current vanilla app is built around a central state contract. That is intentional: the database is now properly structured, while the UI can keep moving fast.

## Supabase setup

Run the schema SQL in Supabase SQL Editor:

```txt
docs/sql/restogogo_supabase_schema_v1.sql
```

The schema file creates the relational tables, indexes, timestamps and pilot RLS policies.

Then run the Bouillon pilot seed, or insert a restaurant row and complete setup deliberately:

```txt
Bouillon pilot data: docs/sql/restogogo_seed_bouillon_v1.sql
Blank restaurant setup: insert the restaurant row first, then add Team + Restaurant master data in the app
```

Important: the frontend does not invent operational master data, does not auto-seed empty workspaces, and does not create default employees/zones/positions/opening hours. Supabase is the source of truth. If a restaurant row or required setup is missing, the app stays empty/read-only until the data is created properly.

The adapter preserves Supabase `metadata` JSONB for employees, positions, zones, absences and documents. Login, page navigation and opening the Badge Terminal do not write business data back to Supabase.

## Pilot warning

The current RLS policies are intentionally open for the public anon key during the prototype. This is fine for a controlled pilot/prototype, but not for production.

Before a real SaaS launch, replace the pilot policies with proper Supabase Auth + restaurant/user permissions.

Also: employee PINs and payroll details are currently prototype fields. For production, PINs should be hashed and sensitive payroll/identity data should be protected with proper access rules.

## Active structure

```txt
index.html
assets/css/
  tokens.css
  base.css
  page-state.css
  v2-components.css
  v2-controls.css
  weekly-grid.css
  v2-feedback.css
  topbar.css
  notifications.css
  brand.css
  pilot-guide.css
  employee-schedule.css
  planning.css
  badge-terminal.css
  actuals.css
  team.css
  restaurant.css
  print.css
assets/js/
  config.js
  data-adapter.supabase.js
  restogogo-ui.js
  app.js
  brand-entry.js
  employee-schedule.js
  planning.js
  badge-terminal.js
  actuals.js
  team.js
  restaurant.js
assets/js/core/
  app-globals.js
  app-utils.js
  data-contract.js
  data-factory.js
  state-service.js
  brand-service.js
  notification-service.js
  workspace-auth.js
  app-shell.js
assets/js/services/
  export-service.js
  metric-renderer.js
  weekly-grid-renderer.js
  business-logic.js
docs/sql/
  restogogo_supabase_schema_v1.sql
  restogogo_seed_bouillon_v1.sql
  clear_bouillon_operational_data.sql
```

Operational app data is Supabase-only; the old local data adapter has been removed from the active package.

## Ownership rules

- `app.js` is bootstrap only.
- `core/*` owns shared shell, state, workspace access, routing, branding, data contract and notifications.
- `data-adapter.supabase.js` is the only operational persistence boundary.
- `services/*` owns reusable helpers such as CSV export, shared metric cards and the shared weekly grid renderer.
- Page files own page-specific rendering/events only.
- `weekly-grid.css` owns Planning/Actuals grid structure.
- `operations.css` owns shared Team/Restaurant operational UI primitives: metric grid placement, tabs, empty states, statuses, modal/forms and small action controls.
- `planning.css` and `actuals.css` only own page-specific slot/content states.
- `team.css` and `restaurant.css` only own page-specific master-data layouts/content.
- `page-state.css` only owns page visibility/mode display.
- `topbar.css` only owns the shared app topbar.

## Quality rules

- No inactive old pages or hidden modules.
- No inline event handlers in active HTML.
- No active CSS `!important`.
- No browser-native `alert`, `confirm`, or `prompt`; use `Restogogo.ui`.
- Planning and Actuals share the same weekly-grid CSS and JS skeleton.
- Team and Restaurant are source-of-truth modules, not isolated mock pages.
- Shared visual primitives must stay shared; module CSS must not recreate metric cards, tabs, modal styles or form controls.

## Data contract

The runtime state contract is version `24`.

Weekly operational data remains sparse in the frontend state and is persisted into relational weekly tables:

```txt
availability      -> restogogo_availability_slots
planning          -> restogogo_planned_shifts.planned
assignments       -> restogogo_planned_shifts.zone_name
assignmentTimes   -> restogogo_planned_shifts.time_range
submitted         -> restogogo_employee_week_submissions
notes             -> restogogo_weekly_notes
actualEntries     -> restogogo_actual_shift_entries
status            -> restogogo_weekly_status
history           -> all weekly tables grouped by week_start
```

## Pilot access

- Owner login name: `manager`
- Owner password/PIN: `0000` for the pilot owner login only
- Employee password/PIN: whatever is stored on the employee row; the seed uses `0000`


## Vercel Web Analytics

This build includes the plain HTML Vercel Web Analytics snippet in `index.html`.

After deploying to Vercel, open the live site once, then check:

```txt
Vercel → Project → Analytics
```

Local `file:///` usage is not counted as real website traffic; analytics start from the deployed Vercel URL.

## Deployment

1. Run the Supabase schema SQL.
2. Run the Bouillon seed SQL for pilot data, or create proper master data deliberately.
3. Unzip this package.
4. Replace the repo files.
5. Commit to `main`.
6. Push origin.
7. Let Vercel auto-deploy.
8. Test Team, Restaurant, Planning, Badge Terminal and Actuals.

## Bouillon cleanup

To clear only weekly operational data while preserving employees/setup, run:

```txt
docs/sql/clear_bouillon_operational_data.sql
```
