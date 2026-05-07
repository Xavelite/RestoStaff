# RestoStaff Code Review v193

## Summary

v193 is a CSS hygiene release for the approved brand/login page. It keeps the v192 visual direction and does not change operational module behavior, Supabase persistence, prototype login rules, or restaurant workspace logic.

## Changes reviewed

- `base.css` now owns shared RestoStaff tokens plus low-level reset helpers.
- `brand.css` remains isolated to the brand/access page.
- Removed `!important` rules from `brand.css` so the brand page is controlled by normal selector specificity and cascade order.
- Kept the clean page structure: topbar, main card, sponsor footer.
- Kept login left and modules right.
- Left legacy operational app styling in `app.css` unchanged for safety.

## Risk level

Low. This is CSS-only hygiene around the brand entry page. The operational app, terminal, planner, Supabase adapters, and prototype auth behavior are unchanged.

## Notes

`app.css` still contains broad legacy global rules for the operational prototype. The brand page is now shielded by isolated class names and normal brand selectors. Future CSS splitting should move module-specific blocks out of `app.css` one module at a time rather than rewriting it broadly.

## Recommended manual checks

- Dev gate still unlocks correctly.
- Restaurant login still works for owner aliases and employee names.
- Wrong login/PIN still shakes the panel.
- Brand page visually matches v192.
- Logged-in app flow is unchanged.
- Time Clock terminal is unchanged.
