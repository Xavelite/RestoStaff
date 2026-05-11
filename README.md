# restogogo — clean v2 base

This package is the clean v2 foundation for the reviewed restogogo prototype.

Active v2 pages:

- Login / module entry
- Employee My Schedule
- Owner Planning Calendar
- Time Clock / Badging Terminal
- Actual Timesheet

The old prototype modules are no longer mounted behind the v2 shell. Future modules should be rebuilt as new v2 slices instead of reusing old UI/render paths.

## Stack

- Vanilla HTML/CSS/JS
- Static hosting target: Vercel
- Supabase REST adapter using the prototype `public.planner_state` JSONB row
- Prototype PIN/login only, not production Auth/RLS

## Active files

```txt
index.html
assets/css/tokens.css
assets/css/base.css
assets/css/page-state.css
assets/css/v2-components.css
assets/css/v2-controls.css
assets/css/v2-feedback.css
assets/css/topbar.css
assets/css/notifications.css
assets/css/brand.css
assets/css/employee-schedule.css
assets/css/owner-planning.css
assets/css/time-clock.css
assets/css/actual-timesheet.css
assets/js/config.js
assets/js/data-adapter.local.js
assets/js/data-adapter.supabase.js
assets/js/restogogo-ui.js
assets/js/brand-entry.js
assets/js/employee-schedule.js
assets/js/owner-planning.js
assets/js/time-clock.js
assets/js/actual-timesheet.js
assets/js/app.js
```

## Ownership rule

`app.js` is the shell: state, routing, persistence, notifications, and shared helpers.

Page behavior belongs to page slices:

- `brand-entry.js`
- `employee-schedule.js`
- `owner-planning.js`
- `time-clock.js`
- `actual-timesheet.js`

Shared UI belongs to:

- `tokens.css` for current v2 design tokens
- `v2-components.css` for shell, panels/cards, metrics, week controls, module tiles and shift-card primitives
- `v2-controls.css` for toolbars, search, filters and action menus
- `v2-feedback.css` for toast, modal and dialog styling
- `topbar.css` for the shared app topbar
- `notifications.css` for the notification badge and popover
- `restogogo-ui.js` for branded interactions

Page CSS should only style page-specific layout and content.

## Prototype access

- Owner password/PIN: `0000`
- Employee password/PIN: `0000`

## Deployment reminder

1. Unzip this package.
2. Replace the local repo files.
3. Commit to `main`.
4. Push origin.
5. Let Vercel auto-deploy.
6. Do not reset Supabase data.

## Current v2 quality rules

- No active legacy pages or hidden legacy modules.
- No inline event handlers in active HTML.
- No active CSS `!important`.
- CSS is formatted for maintainability and consolidated around shared visual primitives, not minified for low line count.
- No browser-native `alert`, `confirm`, or `prompt`; use `window.RestogogoUI`.
- New modules should follow the same page-slice ownership model.

## Latest lock note

See `docs/V2_POLISH_LOCK.md` for the final v2 polish/maintenance rules.

## v310 update
- Fixed page routing/display so Planning and Actuals remain isolated.
- Simplified Actual Timesheet slot content to match the planning grid rhythm.
- Removed extra labels inside actual slots and restored no-horizontal-scroll column sizing.
