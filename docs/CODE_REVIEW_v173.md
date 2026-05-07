# RestoStaff v173 Code Review

This review was performed as a conservative stabilization pass after v172 Inventory MVP.

## Scope reviewed

- `index.html`
- `assets/css/app.css`
- `assets/js/app.js`
- `assets/js/config.js`
- `assets/js/data-adapter.local.js`
- `assets/js/data-adapter.supabase.js`
- project documentation

## Validation results

| Check | Result |
| --- | --- |
| JS syntax: `app.js` | Pass |
| JS syntax: `config.js` | Pass |
| JS syntax: local adapter | Pass |
| JS syntax: Supabase adapter | Pass |
| Duplicate HTML IDs | None found |
| Missing inline `onclick` targets | None found |
| Duplicate function declarations | None found |
| Duplicate `window.*` action assignments | None found |
| CSS brace balance | Pass after cleanup |
| Zip integrity | Pass |

## Stabilization fixes made

### 1. Removed invalid orphan CSS fragments

Old v94–v96 metric cleanup fragments contained declaration blocks without selectors. They were invalid CSS and not safely applied by the browser. These fragments were removed and replaced with a short cleanup comment.

The current WHO/WHERE metric styling remains controlled by the later valid consolidated rules.

### 2. Consolidated Time Clock landing CSS

The Time Clock landing had separate v170 and v171 CSS override blocks. v173 consolidates them into one focused Time Clock landing/subpage block. This reduces legacy duplicate override layering while preserving the visual card layout.

### 3. Updated docs/version references

Documentation now marks this package as v173 stabilization/code-review baseline.

## Code architecture notes

### Current strengths

- The app remains simple to deploy as a static Vercel package.
- Supabase persistence remains isolated in the adapter.
- The one-row JSON model is still appropriate for prototype iteration.
- Manager/employee mode separation is preserved.
- New modules such as Time Clock and Inventory are still stored inside the main app state without schema migration.

### Main remaining risk

`app.css` is still a large historical patch stack. Many repeated selectors are intentional override layers from previous UI recoveries. Removing them broadly would be risky without visual screenshot comparisons.

### Recommended next technical step

Before a full refactor, stabilize product workflows and exports. Then split gradually:

- `planning.js`
- `time-clock.js`
- `inventory.js`
- `costs-dashboard.js`
- `setup.js`
- `base.css`
- `planning.css`
- `time-clock.css`
- `inventory.css`

Do this only after a known-good visual baseline is available.

## What was intentionally not changed

- No Supabase schema changes.
- No auth changes.
- No localStorage fallback changes.
- No calendar sticky rewrite.
- No Time Clock terminal rewrite.
- No Inventory model migration.
- No broad CSS cleanup beyond clearly invalid/duplicate review targets.
