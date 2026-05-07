# RestoStaff Code Review v197

## Summary

v197 is a focused brand-entry polish release. It keeps the approved v196 layout and interaction structure, restores the cleaner line-style module icons, changes the module preview pages to 1–6 then 4–9, and fixes the CTA button styling conflict cleanly.

## Changes reviewed

- Restored lighter line-style module icons.
- Preserved the core module order on page one: Planning, Time Clock, Costs, Daily Close, Inventory, Team / HR.
- Changed page two to overlap naturally: Daily Close, Inventory, Team / HR, Forecast, Exports, Setup.
- Fixed CTA color leakage by removing legacy global `#enterBtn` from old app button rules and scoping the remaining logged-out `#enterBtn` rule to the old restaurant login card only.
- Kept `brand.css` free of `!important` rules.

## Risk level

Low.

This release is limited to the brand entry page and legacy CSS leakage cleanup around the `#enterBtn` selector. Operational modules, Supabase persistence, and prototype login logic remain unchanged.

## Recommended manual checks

- Brand CTA uses the RestoStaff gradient, not restaurant burgundy.
- Module page one shows modules 1–6.
- Module page two shows modules 4–9.
- Wrong-login and loading interactions still work.
- Logged-in app buttons still use restaurant theme styling.
