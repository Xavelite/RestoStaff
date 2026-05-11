# v2 base review

Current status: the app is a clean v2 foundation containing login/module entry, employee schedule, and owner planning calendar.

## Locked principles

- `app.js` stays a thin shell and shared helper layer.
- Page modules own their own rendering and interactions.
- Shared UI belongs in split shared CSS files (`tokens.css`, `v2-components.css`, `v2-controls.css`, `v2-feedback.css`, `topbar.css`) plus `restogogo-ui.js`.
- Page CSS stays page-specific.
- Legacy modules should be rebuilt as v2 slices, not reactivated.

## Recent technical polish

- Owner previous-week comparison now uses a pure snapshot calculation instead of temporarily mutating global app state.
- Shared CSS is now split by responsibility so new modules do not grow one giant UI stylesheet.
- Owner planning CSS now focuses on calendar-specific layout, availability, shift cards, selection and conflict states.
- Stale historical references and inactive shell leftovers were removed from shipped active files.
- Shared topbar selectors are now self-contained (`.app-topbar-v2`, `.notif-*`, `.user-pill`) instead of defensive body-prefixed selectors.

## CSS maintainability checkpoint

The active CSS is now formatted for readability instead of minified line-count reduction. Selector ownership remains simple, but declarations are expanded into maintainable blocks.

Current active CSS is split by responsibility:

```txt
tokens.css              design tokens only
base.css                reset + shared page background
page-state.css          routing visibility
topbar.css              shared app topbar
notifications.css        notification badge and popover
v2-components.css       shell, cards, metrics, week controls
v2-controls.css         toolbars, search, filters, menus
v2-feedback.css         toast, modal, dialog feedback
brand.css               login/module-entry only
employee-schedule.css   employee schedule only
owner-planning.css      owner calendar/grid only
```

Phase 12 removed unused old token aliases such as `--red`, `--ink`, `--bg`, and `--rs-*`. Phase 13 consolidated CSS logic by replacing one-off visual variants with shared variables, moving notification styling out of topbar ownership, and removing unused selectors. Active CSS still has 0 `!important`.
