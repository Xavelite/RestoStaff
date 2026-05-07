# RestoStaff Code Review v183

## Summary

v183 is a visual/access polish release focused on the first-page experience only. It does not change operational module behavior, Supabase persistence, the prototype login logic, or the in-app navigation model.

## Changes reviewed

- Main access layout tightened so the primary card and sponsor bar fit above the fold more comfortably on desktop.
- Login card updated to a cleaner “Welcome back” composition with a lock icon and simpler visual hierarchy.
- Module board now shows 6 cards at a time with navigation controls while still covering all 9 modules.
- Module tiles were simplified into clearer icon-led cards rather than thumbnail-heavy previews.
- Logo marquee kept, but made more compact.

## Risk level

Low to medium.

This release is mostly HTML/CSS plus lightweight login-page JS for the module-board paging controls. App modules, calendar logic, terminal flow, and Supabase usage remain intentionally unchanged.

## Recommended manual checks

- Dev gate still unlocks correctly.
- Restaurant login still works for owner aliases and employee names.
- Restaurant dropdown still switches workspace correctly.
- Module board next/previous buttons and dots work.
- Access screen stays above the fold on common laptop/desktop sizes.
- Sponsor marquee remains visible and smooth on desktop.
- Logged-in app flow is unchanged.
