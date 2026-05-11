# restogogo v2 structure guide

## Active v2 pages

- Login / module entry
- Employee schedule
- Owner planning calendar
- Time Clock / Badging Terminal
- Actual Timesheet

## Shared foundation

- `assets/css/tokens.css` — design tokens only.
- `assets/css/base.css` — reset/global defaults only.
- `assets/css/page-state.css` — visibility/routing only.
- `assets/css/v2-components.css` — shared shell, frame, card, metric and week-control primitives.
- `assets/css/v2-controls.css` — shared toolbar, search, dropdown and action-menu primitives.
- `assets/css/v2-feedback.css` — shared toast, modal and dialog primitives.
- `assets/css/topbar.css` — shared app topbar only.
- `assets/css/notifications.css` — notification badge and popover styling.

## Page slices

Each reviewed page has one JS owner and one CSS owner:

```txt
brand-entry.js          + brand.css
employee-schedule.js    + employee-schedule.css
owner-planning.js       + owner-planning.css
time-clock.js           + time-clock.css
actual-timesheet.js     + actual-timesheet.css
```

`app.js` must stay thin. It can orchestrate page rendering, but it should not own page-specific UI behavior.

## CSS rules

- Keep `!important` out of active v2 CSS.
- Do not restyle topbar in page CSS.
- Do not append version-layered overrides. Edit the final section that owns the component.
- Shared primitives belong in the split shared CSS files, not page CSS.

## JS rules

- Bind interactions through JS event listeners/delegation.
- Avoid inline event handlers in generated HTML.
- Page-specific mutations belong in the page JS slice.
- Shared state/persistence belongs in `app.js` and the data adapters.

## Checklist for a new v2 page

1. Add the page section in `index.html`.
2. Add `assets/js/<page>.js`.
3. Add `assets/css/<page>.css`.
4. Register the page through the shell/router.
5. Reuse shared metric cards, topbar, buttons, controls and dropdown patterns.
6. Test login → page → logout → login again.
7. Confirm no hidden old UI renders behind it.


## Interaction rule

No browser-native popups in active v2 modules. Use `window.RestogogoUI.toast`, `window.RestogogoUI.alert`, `window.RestogogoUI.confirm`, or `window.RestogogoUI.prompt` for branded feedback.

## Page CSS rule

Page CSS should only contain page-specific layout and complex page-specific widgets. Shared toolbar, metric, modal, dropdown, topbar and status-dot styling belongs in the shared CSS files.
