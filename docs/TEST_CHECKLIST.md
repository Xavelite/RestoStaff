# restogogo v2 manual test checklist

## Login / workspace

- App opens on restogogo workspace login.
- Bouillon workspace is available only after the restaurant row exists in Supabase.
- No demo/local workspace is exposed.
- Owner PIN `0000` opens Planning.
- Employee PIN opens Employee Schedule only when the employee row has that PIN; the Bouillon seed uses `0000`.
- User pill logs out back to login.

## Planning

- With no active employees/zones/positions/opening hours in Supabase, Planning does not invent rows, zones or shift times.
- Once setup exists, Planning opens next week by default.
- Previous/next week and date picker work.
- Add/remove shifts works.
- Zone and time edits save correctly.
- Publish/unpublish works with branded feedback.
- Search, filters and actions work and close on outside click/Escape.
- Conflict banner appears only when relevant.
- Page itself does not scroll; the weekly board scrolls internally.
- Export CSV and print view work.

## Actuals

- Actuals opens current week by default.
- Default view is Relevant only.
- Planned employees appear before badges.
- Employees who badge without planning appear.
- Missing badges, open check-outs and unplanned badges are visible.
- Badge Terminal button appears only in Actuals.
- Export payroll prep, weekly summary, details and anomalies download correctly.
- Exports include proof status labels but no photo data URLs.
- No destructive clear/reset action is visible.
- Page itself does not scroll; the weekly board scrolls internally.

## Badge Terminal

- Opens in a standalone badge-terminal window.
- No app topbar appears.
- Page itself does not scroll.
- Employee list scrolls internally if needed.
- Selecting an employee shows the complete keypad.
- Correct PIN records check-in/out and attempts low-resolution proof capture.
- Wrong PIN shows branded feedback and returns cleanly.
- Terminal returns to the employee list after a successful badge.

## Employee Schedule

- Week controls work.
- Availability toggles work while schedule is Draft.
- Time edit prompt works.
- Published schedule prevents draft availability edits.

## Technical smoke check

- Browser console has no runtime errors.
- Active CSS contains no `!important`.
- Active CSS contains no ID selectors.
- No inactive old UI is shipped as a hidden page.
- Planning and Actuals share the same weekly-grid structure and scroll behavior.
- Bouillon data persists in Supabase relational tables after refresh/relogin.


## Supabase relational persistence

- Run `docs/sql/restogogo_supabase_schema_v1.sql` once in Supabase.
- Run `docs/sql/restogogo_seed_bouillon_v1.sql` for the v295 Bouillon setup, or insert a restaurant row first and then create employee/zone/position/opening-hour data deliberately.
- Confirm browser network requests go to `restogogo_*` tables, not `planner_state`.
- Edit a Team employee, refresh the browser, and confirm the edit remains.
- Edit a Restaurant zone/opening hour, refresh the browser, and confirm the edit remains.
- Add a planned shift, badge it in Badge Terminal, refresh, and confirm Planning + Actuals still match.
- Run `docs/sql/clear_bouillon_operational_data.sql` only when intentionally clearing weekly data.

## Data-model regression notes

- Test fast repeated planning edits; saves should queue without blocking the UI.
- Test badge check-in/out and confirm Actuals totals/export values match the screen.
- Test week switching between Planning next week and Actuals current week.
- Confirm saving old full-shape data compacts it without losing planned slots, custom times, availability or actual entries.

## Team and Restaurant management

- Open **Team** as manager and confirm the directory, selected employee profile, actions and documents panel render.
- Add or edit an employee, then confirm the employee appears in Planning and the Badge Terminal only when Active.
- Add an absence for the current Planning week and confirm that matching Planning slots become unavailable/conflict-aware.
- Open **Restaurant**, add/edit/archive a zone and confirm Planning zone dropdowns use only active Restaurant zones from Supabase.
- Change Restaurant opening hours and confirm Planning uses the Supabase value unless a custom slot time exists.
- Add/edit a position and confirm Team employee position choices and Planning filters stay aligned.


## v355 shared visual architecture polish

- Planning, Actuals, Team and Restaurant use the same `rs-weekly-metrics` / `rs-metric-card` rhythm for top summary metrics.
- Team and Restaurant top metrics must match Planning/Actuals spacing, height and card behavior.
- `operations.css` owns shared operational tabs, fields, rows, actions, dialogs and form primitives.
- `team.css` and `restaurant.css` contain only page-specific layout/content density.
- Restaurant zone cards are compact enough that the selected editor remains usable without page-level layout drift.
- Topbar is untouched and remains shared across all manager modules.
- Supabase persistence remains source-of-truth only; metadata JSONB is preserved on read/write and passive login/terminal saves are blocked.

- Team and Restaurant metric cards use the shared `rs-metric-card` styling with no page-specific metric overrides.
- `operations.css` owns shared Team/Restaurant tabs, form grids, statuses, empty states and dialogs.
- `team.css` contains Team-specific layout/content only.
- `restaurant.css` contains Restaurant-specific layout/content only.
- Restaurant has no redundant left setup menu and no permanent right action panel; actions live inside the relevant tab.
- Topbar remains shared and unchanged across modules.

## v357 Supabase persistence safety refactor

- Load Bouillon and confirm 24 employees, 12 zones and 5 positions are visible.
- Navigate between Planning, Actuals, Team and Restaurant: no master data should change in Supabase.
- Change planning for one week: only weekly planning tables should change.
- Badge in/out: only actual shift entries should change.
- Edit one employee: employee remains in `restogogo_employees`; no full employee wipe occurs.
- Edit one zone: zones remain in `restogogo_zones`; no full zone wipe occurs.
- Check browser console for `[restogogo:supabase-load]` counts after load.
