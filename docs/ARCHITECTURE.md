# restogogo architecture — clean v2 foundation

## Active product shell

The live prototype runs a clean v2 shell only:

- private dev gate
- login / module entry
- employee schedule
- owner planning calendar

No old module DOM/CSS is shipped as an active page. Future modules should be added as new v2 slices.

## File ownership

### HTML

`index.html` contains only the v2 shell, page containers, and shared dialogs still used by v2.

### JavaScript

- `app.js` — state, normalization, routing, session/login/logout, persistence, notifications, shared helpers.
- `brand-entry.js` — login/module-entry visual behavior.
- `employee-schedule.js` — employee schedule renderer and interactions.
- `owner-planning.js` — owner calendar renderer, owner metrics, publish/draft, slot editing, filters, exports, owner toasts and micro-interactions.
- `restogogo-ui.js` — branded toast, alert, confirm and prompt helpers.
- `data-adapter.local.js` / `data-adapter.supabase.js` — storage adapters.
- `config.js` — prototype runtime config.

### CSS

- `tokens.css` — current v2 design tokens only; no old restaurant/theme aliases.
- `base.css` — browser reset, global defaults, and shared reviewed-page screen background only.
- `page-state.css` — page visibility/routing only.
- `v2-components.css` — shared shell, frames, cards, metrics and week controls.
- `v2-controls.css` — shared toolbars, search controls, filters and action menus.
- `v2-feedback.css` — shared toast, modal and dialog styling.
- `topbar.css` — the only shared app topbar/notification owner.
- `brand.css`, `employee-schedule.css`, `owner-planning.css` — page-specific styling.

## State model

The prototype stores one JSON object per workspace in `public.planner_state.data`.

Important planning fields:

```txt
availability      employee availability input
planning          owner planned schedule
assignments       zone/role assignment per planned shift
assignmentTimes   custom time range per planned shift
submitted         employee availability submission state
status            Draft / Published
history           saved week snapshots
notifications     shared prototype notifications
```

## Rules for next modules

1. Add one page-specific JS file.
2. Add one page-specific CSS file.
3. Reuse shared v2 classes (`rs-*` / `app-*` / page scopes) before adding new styles.
4. Do not add topbar-specific CSS in a page file.
5. Avoid inline event handlers; bind behavior in the page JS file.
6. Use `window.RestogogoUI` for premium interactions.
7. Do not use native dropdowns for premium controls.
8. Do not reintroduce legacy DOM/CSS as hidden inactive UI.
