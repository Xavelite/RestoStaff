# RestoStaff Code Review v194

## Summary

v194 is a focused brand/access-page polish release. It keeps the approved clean structure while refining the login panel and module preview. Operational modules, Supabase persistence, and prototype access logic are unchanged.

## Changes reviewed

- Restaurant login inputs are dark again; the root cause was a legacy global `input/select/textarea` rule in `app.css` using `!important`. That rule is now scoped to `body.logged-in` so the brand page can own its styles cleanly.
- Login heading/subtitle are left-aligned.
- Login-panel lock icon was removed.
- Module preview now displays 6 cards per page with dot-only paging.
- Module icons were enlarged and the module grid remains responsive.
- `brand.css` remains isolated and avoids `!important`.

## Risk level

Low to medium. The app CSS change scopes one legacy global form rule to logged-in app views, which is the intended area for that rule. Dev gate still has dedicated styling, and the brand page now has its own form styling.

## Recommended manual checks

- Dev gate still unlocks and wrong credentials shake.
- Brand login inputs are dark and readable.
- Wrong restaurant credentials shake the login panel.
- Module dots switch between the two 6-card pages.
- Login succeeds for owner aliases and employee names.
- Main app forms still look correct after login.
