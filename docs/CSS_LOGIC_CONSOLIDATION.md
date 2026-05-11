# CSS logic consolidation

The active v2 CSS is organized around a small number of reusable visual primitives. The goal is not to minimize line count; the goal is to avoid creating a new visual system for every page.

## Current rule

Ask for every CSS block:

> Is this a real unique visual concept, or just a variant of an existing component?

If it is only a variant, use shared primitives and CSS variables.

## Shared primitives

- `rs-panel` / `rs-card` for glass surfaces.
- `rs-metric-card` for all metric/status cards.
- `rs-week-metric` for week selectors.
- `rs-control`, `rs-control-button`, `rs-icon-button` for toolbar controls.
- `rs-filter-menu`, `rs-actions-menu`, `rs-choice-menu` for menus.
- `rs-module-card` for login module tiles.
- `rs-shift-card` for employee availability cards and owner planning slots.
- `rs-toast` / `rs-modal` for feedback.

## Page CSS ownership

Page CSS should only own:

- page layout;
- grid dimensions;
- true page-specific placement;
- true page-specific states such as owner calendar availability/conflict backgrounds.

Page CSS should not recreate generic cards, buttons, menus, modals, or metric cards.

## Current outcomes

- Login module cards share the module-card primitive.
- Employee schedule cards and owner slots share the shift-card primitive.
- Owner CSS now focuses on calendar structure, availability, conflicts, row/column selection, and slot placement.
- Brand CSS now focuses on login layout/form/module grid.
- Employee CSS now focuses on weekly schedule layout and availability state variables.
- Active CSS still has no `!important` rules.
