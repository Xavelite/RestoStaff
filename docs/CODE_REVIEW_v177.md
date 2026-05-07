# RestoStaff Code Review — v177 Baseline

This review was performed before the v178 account portal and documentation baseline changes.

## Package validation

- Expected core files were present.
- JavaScript syntax passed for `app.js`, `config.js`, and both data adapters.
- Zip integrity passed.
- No duplicate HTML IDs were found.
- No duplicate function declarations were found.
- No duplicate `window.*` action assignments were found.
- No missing inline `onclick` targets were found.
- CSS brace balance passed.

## Confirmed current state

The app is a broad vanilla HTML/CSS/JS prototype with Supabase persistence through one JSONB row per restaurant workspace.

Current modules include:

- Planning calendar
- Employee My Schedule
- Availability
- Time Clock terminal
- Actual timesheets
- Badge monitor
- Costs
- Dashboard
- Inventory
- Daily Close / Payments
- Exports
- Team / HR profiles
- Absences
- Reservations / Covers Forecast
- Setup / onboarding
- Modern Light and Modern Dark themes

## Strong areas

The state normalization layer in `ensure()` is valuable. It protects old data shapes, initializes new module state, keeps employee PINs normalized for the prototype, and supports the broad v159–v177 feature growth.

The Supabase adapter boundary is worth preserving. The UI mostly works through `window.DataAdapter`, and Supabase remains the source of truth for restaurant data.

The Time Clock landing page is the clearest v2 UX reference. It uses a simple hub, big cards, and focused subpages.

Employee My Schedule is directionally strong: simpler, focused, and more premium than showing employees the full planning surface.

## Main risks

### Full-state saves

The app still loads, mutates, and saves the full workspace JSON object. If a wall terminal and manager planner are open at the same time, one browser can overwrite newer changes from the other.

This does not require an immediate SQL migration, but pilot hardening should add conflict awareness or isolate volatile writes such as time clock entries.

### CSS regression risk

`assets/css/app.css` is large and historically layered. It contains many targeted overrides and high specificity rules. The sticky calendar and topbar should not be broadly rewritten.

The safest path is extraction first, cleanup later.

### JS coupling

`assets/js/app.js` contains all modules, global state, render logic, and inline action handlers. It is still workable for the prototype, but future changes should split code by module after a stable visual baseline.

### Documentation drift

Several v177 docs described older feature focus. The v178 baseline updates README, architecture notes, and cleanup notes.

## Recommended v2 path

1. Documentation and baseline cleanup.
2. One-module-at-a-time UX polish.
3. Controlled JS split with no behavior changes.
4. Controlled CSS split with no selector rewrites.
5. Supabase Storage for uploads/photos/logos.
6. Auth/RLS/billing later.

## Best first UX polish candidates

- Inventory: convert landing cards into focused views.
- Daily Close: focus Today, Payments, Cash Movements, and History.
- Team / HR: focus Profiles, Documents, and Absences.

Planning should be polished later because the sticky calendar layout is high risk.
