# v2 polish lock

This version keeps the reviewed v2 foundation focused on three active pages:

- Login / module entry
- Employee schedule
- Owner planning calendar

## Final cleanup notes

- Active CSS has no `!important` rules.
- Active HTML has no inline event handlers.
- Browser-native `alert`, `confirm`, and `prompt` are not used in active v2 flows.
- Unused shared CSS primitives were removed from active CSS.
- Owner planning rendering is split into named helper functions for toolbar, filters, calendar header, employee rows, and slots.
- Page CSS should remain layout-specific. Shared visuals should continue to use `rs-*` primitives.

## Build rule for next modules

New modules must be added as fresh v2 slices:

```text
assets/js/<module>.js
assets/css/<module>.css
one page container in index.html
shared components from assets/css/v2-*.css and restogogo-ui.js
```

Do not reintroduce old module DOM, old CSS files, inline handlers, or browser-native popups.

## v311 Actuals grid alignment

Actual Timesheet v2 now follows the same weekly grid rhythm as Owner Planning:
- same toolbar alignment pattern
- same employee/day/week column structure
- same two-slot-per-day layout
- same row height and card fill behavior
- actual-specific content only inside the slot card

The Actuals page should remain a weekly-grid variant, not a separate calendar implementation.

## v315 Time Clock rebuild

The Time Clock page was rebuilt as a clean v2 slice:
- no day/service selector and no internal title block
- employee-first terminal flow: tap name -> enter PIN -> badge is recorded
- shift/day are inferred from the active week and current weekday/time
- correct PIN captures a low-resolution camera proof when available
- wrong PIN and success states reuse the shared `RestogogoUI.toast` feedback component
- after check-in/check-out, the terminal resets to the main tap-your-name screen
- actual entries store clock-in/out timestamps plus optional photo proof metadata
- Actuals cards show a photo-proof marker and open a small proof viewer when proof metadata exists

Keep `time-clock.css` focused on the terminal layout only. Shared feedback, cards, buttons and tokens must continue to come from `v2-components.css` / `v2-feedback.css`.
