# RestoStaff Code Review v195

## Summary

v195 is a brand-entry interaction polish release. It keeps the approved page structure and does not change operational modules, Supabase persistence, or the prototype access model.

## Changes reviewed

- Added soft fade/slide transitions when switching module preview pages.
- Added staggered module-card entrance timing.
- Added wrong-login feedback with shake, temporary red field state, and focus return.
- Added success feedback on the access button: “Opening workspace…” and a small spinner.
- Added sponsor-pill hover brightening while preserving the existing pause-on-hover marquee.
- Kept `brand.css` free of `!important` rules.

## Risk level

Low.

The release touches `brand-entry.js`, `brand.css`, and a small call site in `app.js` for passing login-error messages and success-state feedback. Operational modules and data adapters are untouched.

## Recommended manual checks

- Dev gate still unlocks correctly.
- Wrong dev-gate login still shakes the card.
- Restaurant login shows wrong-name/PIN feedback and returns focus to the relevant field.
- Successful restaurant login briefly shows “Opening workspace…” and enters the app.
- Module preview dots switch pages with a subtle transition.
- Sponsor marquee pauses on hover and sponsor pills brighten subtly.
- Logged-in app modules are unchanged.
