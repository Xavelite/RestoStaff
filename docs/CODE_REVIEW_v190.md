# RestoStaff Code Review v190

## Summary

v190 is the first proper isolation pass for the brand/login entry page. It does not change operational module behavior, Supabase persistence, or prototype login rules.

## Changes reviewed

- Replaced legacy entry-page classes such as `login-card`, `rs-entry-panel`, and `rs-entry-hero` with dedicated brand-only classes.
- Kept JavaScript IDs intact for existing behavior: `login`, `restaurantLoginSelect`, `identityLoginName`, `accessPin`, `enterBtn`, and `entryModuleGrid`.
- Preserved the clean structure: topbar, main card, sponsor footer.
- Login remains on the left, modules remain on the right.
- Module grid now uses brand-only card classes and should not fight legacy app CSS.
- Added subtle hover/focus states for cards, inputs, and button.
- Added a small shake feedback when prototype login/PIN validation fails.

## Risk level

Low to medium.

This is mostly HTML/CSS cleanup plus a very small JS feedback hook. It intentionally avoids touching Planning, Time Clock, Supabase adapters, terminal flow, or operational module rendering.

## Recommended manual checks

- Private dev gate unlocks correctly.
- Wrong dev credentials produce a small shake.
- Restaurant login works for owner aliases and employee names.
- Wrong restaurant PIN/name produces a small shake and error message.
- Login appears on the left and module grid on the right.
- Module cards fill the right panel and hover cleanly.
- Sponsor footer sits below the main card and does not overlap.
- Logged-in app behavior is unchanged.
