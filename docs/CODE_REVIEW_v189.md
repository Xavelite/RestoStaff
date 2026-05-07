# RestoStaff Code Review v189

## Summary

v189 is the first controlled structure split for the brand/login entry experience. It does not change operational module behavior, Supabase persistence, or prototype login logic.

## Changes reviewed

- Added `assets/css/base.css` for shared brand/access design tokens and tiny utilities.
- Replaced the previous access CSS file with `assets/css/brand.css`.
- Added `assets/js/brand-entry.js` for the brand page module-preview rendering helper.
- Kept the main operational app logic in `assets/js/app.js` for now.
- Updated the brand login HTML structure with clear comments for private gate, brand login, terminal, and app shell.
- Enforced the desired layout cleanly: login panel on the left, module preview on the right, sponsor marquee below the main card.

## Risk level

Low to medium.

This is mostly CSS/HTML organization plus a small JS extraction for the entry page. Calendar, terminal, Supabase, employee/owner access, and operational modules are intentionally unchanged.

## Recommended manual checks

- Dev gate still unlocks correctly.
- Access screen shows login on the left and modules on the right.
- Restaurant dropdown still switches workspace correctly.
- Owner aliases and employee names still log in with prototype PIN/password `0000`.
- Sponsor marquee sits below the main card without overlap.
- Logged-in owner and employee app flows are unchanged.
