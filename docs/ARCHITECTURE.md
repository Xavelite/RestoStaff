# restogogo architecture — v355 shared visual architecture polish

## Active product loop

The current app now has the first complete prototype loop:

**Team + Restaurant setup → Planning → Badge Terminal → Actuals → Export**

Active pages:

- Login / module entry
- Employee Schedule
- Planning
- Actuals
- Badge Terminal kiosk
- Team management
- Restaurant management

## Data architecture

The app is now Supabase-only for operational data.

The old one-row `planner_state.data` JSONB architecture has been replaced by normalized Supabase tables for core business entities:

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

JSONB remains only where flexibility is useful:

```txt
restogogo_restaurants.settings
restogogo_restaurants.payroll_rules
restogogo_restaurants.ui_preferences
```

This gives us a serious foundation without forcing the whole frontend to be rewritten yet. The Supabase adapter hydrates relational rows into the existing runtime state object, and saves the state back into relational rows.

Every table-level `metadata` JSONB column is treated as preserved extensibility data: if Supabase stores metadata for employees, positions, zones, absences or documents, the adapter now reads it into runtime state and writes it back unchanged unless the relevant feature intentionally edits it. Zone-specific default times remain in `restogogo_zones.metadata.defaultTimes`.

## JavaScript ownership

- `app.js` — bootstrap only.
- `assets/js/config.js` — Supabase URL/key, table names and workspace flags.
- `assets/js/data-adapter.supabase.js` — the only operational persistence boundary. It reads/writes normalized Supabase tables and exposes the existing `DataAdapter` API to the app.
- `assets/js/core/app-globals.js` — shared constants and runtime state.
- `assets/js/core/app-utils.js` — generic DOM, date, time, workspace and formatting helpers.
- `assets/js/core/data-contract.js` — runtime state contract and normalization.
- `assets/js/core/data-factory.js` — non-operational runtime shell only when Supabase cannot return a restaurant row. It never seeds master data.
- `assets/js/core/state-service.js` — persistence queue, week snapshots, planning/actual helper accessors.
- `assets/js/core/brand-service.js` — restaurant branding/theme application.
- `assets/js/core/notification-service.js` — notification rendering and read state.
- `assets/js/core/workspace-auth.js` — workspace selector, pilot login and Badge Terminal launch route.
- `assets/js/core/app-shell.js` — routing, page orchestration, topbar/nav and app-level binding.
- `assets/js/services/export-service.js` — shared CSV helpers and Actuals export downloads.
- `assets/js/services/metric-renderer.js` — shared metric-card/week-selector markup for Planning, Actuals and Employee Schedule.
- `assets/js/services/weekly-grid-renderer.js` — shared Planning/Actuals weekly table skeleton.
- `assets/js/services/business-logic.js` — shared Planning/Actuals totals, variance, slot state, relevance and Actuals export data rules.
- Page slices: `brand-entry.js`, `employee-schedule.js`, `planning.js`, `actuals.js`, `badge-terminal.js`, `team.js`, `restaurant.js`.
- `restogogo-ui.js` — branded toast, alert, confirm and prompt helpers.

Device-only preferences still use localStorage inside the Supabase adapter for login state, selected workspace and read notifications. Business data does not fall back to local mode.

Canonical runtime namespace:

```js
window.Restogogo
```

New modules should attach APIs to `Restogogo.<module>` or `Restogogo.services.<service>`, not random globals.

## CSS ownership

- `tokens.css` — v2 design tokens.
- `base.css` — browser reset, global defaults, app background and focus states.
- `page-state.css` — page visibility/mode display only.
- `v2-components.css` — shared frames, panels, cards, metric cards, week controls, empty states and shift-card primitives.
- `v2-controls.css` — shared toolbar, search, filters and action menus.
- `weekly-grid.css` — shared Planning/Actuals weekly board/table layout and desktop height rules.
- `v2-feedback.css` — shared toast and modal primitives.
- `topbar.css` — app topbar only.
- `notifications.css` — notification button and panel only.
- `brand.css` — login/module entry only.
- `pilot-guide.css` — private pilot guide only.
- `planning.css` — planning slot/content states only.
- `actuals.css` — actual slot/content states only.
- `badge-terminal.css` — standalone badge terminal surface only.
- `employee-schedule.css` — employee schedule page only.
- `team.css` — Team page only.
- `restaurant.css` — Restaurant page only.
- `print.css` — print-only rules.

Active CSS intentionally avoids ID selectors, `!important`, old page-specific metric aliases and old Planning/Actuals table alias classes.


## Supabase source-of-truth rule

Employees, zones, positions, opening hours and employee PINs are strict Supabase master data. The frontend may render forms, but it must not create fake operational defaults, demo data, default services or default shift times by itself.

Required setup before Planning can be used:

```txt
at least one active employee
at least one active zone
at least one active position
```

If those requirements are missing, Planning remains empty/blocked by the real missing data. The Bouillon SQL seed is the only place where pilot starter employees/zones/positions/opening hours are inserted intentionally.

## Runtime state model

The active runtime contract is schema/version `24`.

The frontend state remains sparse for weekly operations:

```txt
availability      only available/partial responses; absence + submitted means unavailable
planning          only planned slots
assignments       only selected slot zones
assignmentTimes   only custom time ranges
submitted         only employees who submitted availability
notes             only non-empty notes
actualEntries     only badge entries/proof metadata with real content
status            Draft/Published
history           sparse weekly snapshots keyed by Monday week start
notifications     workspace-level notifications stored in restaurant settings JSONB
```

Persistence mapping:

```txt
Team employees        -> restogogo_employees
Team absences         -> restogogo_employee_absences
Team documents        -> restogogo_employee_documents
Restaurant profile    -> restogogo_restaurants
Restaurant documents  -> restogogo_restaurant_documents
Positions             -> restogogo_positions
Zones                 -> restogogo_zones
Opening hours         -> restogogo_opening_hours
Weekly status         -> restogogo_weekly_status
Availability          -> restogogo_availability_slots
Planned shifts        -> restogogo_planned_shifts
Submitted availability-> restogogo_employee_week_submissions
Notes                 -> restogogo_weekly_notes
Actual clock entries  -> restogogo_actual_shift_entries
```

Week changes and sparse migration still use central helpers in `state-service.js`:

```txt
weeklyPayloadFromState
applyWeeklyPayloadToState
saveWeekSnapshot
loadWeekSnapshot
setWeekStartAndLoad
compactWeeklyPayload
```

## Team + Restaurant management

- **Team** owns employee profile data, active/inactive status, PIN, payroll fields, documents metadata and absences.
- **Restaurant** owns operational setup: zones, positions, opening hours, payroll/export rules and restaurant document metadata.

These modules are linked back into the execution pages:

- Planning uses active employees, active Restaurant zones and Restaurant opening hours as stored in Supabase. If opening hours are missing, Planning has no shift time.
- Absences created in Team are treated as unavailable slots in Planning availability/conflict logic.
- Badge Terminal only lists active Team employees and validates their configured PIN.
- Payroll readiness is calculated from Team payroll fields while Restaurant export readiness comes from setup completeness.

Document upload is metadata-only in this prototype. Real binary uploads should use Supabase Storage after authentication and restaurant/user permissions are introduced.

## Security roadmap

Current SQL creates open anon CRUD policies because this is still a prototype with a public static frontend.

Before launch:

1. Add Supabase Auth.
2. Add `organization_id` / user-to-restaurant membership tables.
3. Replace pilot anon policies with tenant RLS.
4. Hash PINs or replace PIN login with proper auth flows.
5. Move document files to Supabase Storage buckets with access policies.
6. Limit sensitive payroll fields by role.

## Shared UI architecture

Shared visual primitives are centralized:

```txt
v2-components.css       -> base panels, cards, metric cards
v2-controls.css         -> generic app controls and menus
operations.css          -> Team/Restaurant operational primitives
team.css                -> Team-specific layout/content only
restaurant.css          -> Restaurant-specific layout/content only
topbar.css              -> shared topbar only
```

Team and Restaurant must use the shared `rs-metric-card` renderer and `operations.css` primitives. Page CSS may control layout density and grid placement, but should not restyle the shared metric component or create duplicate tab/form/modal systems. Restaurant setup is now a single full-width tabbed profile; there is no redundant left setup menu or permanent right action panel.

