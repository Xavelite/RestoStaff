# Code Review v209 — Design System Foundation

## What changed

- Added `assets/css/restostaff-ui.css` as the shared v2 component layer.
- Renamed the old broad operational stylesheet from `assets/css/app.css` to `assets/css/legacy-app.css` and updated `index.html`.
- Expanded `assets/css/base.css` into the single source for RestoStaff v2 tokens: font stack, colors, card surfaces, border radii, shadows, and legacy aliases.
- Moved the Employee My Schedule active-shell styling out of the legacy stylesheet and into `assets/css/employee-schedule.css`.
- Kept Employee My Schedule page-specific layout in `employee-schedule.css`.
- Added reusable classes in markup for the two v2 references:
  - `rs-v2-page`
  - `rs-v2-shell`
  - `rs-v2-frame`
  - `rs-v2-card`
  - `rs-metric-grid`
  - `rs-metric-card`
  - `rs-icon-badge`
  - `rs-metric-copy`

## Intended CSS architecture

```txt
base.css              design tokens + reset only
restostaff-ui.css     reusable v2 components
brand.css             login/entry page only
employee-schedule.css Employee My Schedule only
legacy-app.css        old prototype modules until migrated
```

## Rule for future pages

New modules should use shared `rs-*` component classes for frames, metric cards, icon badges, typography and interactions, then add a small dedicated module stylesheet for only the module-specific layout.

Example:

```txt
assets/css/team.css
assets/js/team.js
```

## Preserved

- Supabase config and adapters
- Prototype login/access behavior
- Employee schedule behavior
- Time Clock terminal
- Old modules and planning calendar markup/behavior

## Known remaining cleanup

`legacy-app.css` is still large and contains many historical module styles. This is intentional for now. As each module is rebuilt in v2 style, move its styling and logic into dedicated files and delete the corresponding legacy block.
