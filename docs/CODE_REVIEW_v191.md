# RestoStaff Code Review v191

## Summary

v191 is a proportion/scale tuning pass for the isolated brand/login page introduced in v190. It does not change operational module behavior, Supabase persistence, prototype login rules, or restaurant workspace logic.

## Changes reviewed

- Reduced the brand topbar height slightly.
- Reduced the brand shell vertical margins.
- Reduced the main card height from the previous oversized laptop layout.
- Tightened login panel spacing and field heights.
- Kept the login panel on the left and module grid on the right.
- Slightly enlarged module icons while reducing card padding/vertical air.
- Reduced sponsor footer height so it is easier to see with the topbar and main card on laptop screens.
- Added a simple short-viewport media query for common laptop heights.

## Risk level

Low.

This release is CSS-only for the brand/login page. No app module logic changed.

## Recommended manual checks

- The topbar, main card, and sponsor footer are visible on a typical laptop viewport.
- Login remains readable and usable.
- The 3×3 module grid still fits cleanly inside the right panel.
- Module icons feel slightly larger without making the page too tall.
- Sponsor marquee remains below the main card and does not overlap.
- Logged-in app flow is unchanged.
