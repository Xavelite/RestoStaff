# RestoStaff v198 — Final Login CTA Polish Notes

v198 continues the v2 prototype cleanup phase. It does not add an operational module and keeps the approved brand-page structure intact while improving the module priority, visual icon language, column balance, and CTA gradient.

## What changed

- Kept the strict first-screen private development gate.
- Kept visible `admin` / `0000` hints off the screen.
- Replaced the text-heavy RestoStaff login hero with a compact module tile board.
- Removed the Bouillon-specific login heading from the neutral RestoStaff entry page.
- Added a prototype restaurant dropdown to the login form.
- Login now uses restaurant + username/name + password/PIN.
- Kept automatic owner vs employee resolution from the entered name.
- Added a subtle sliding partners/stack bar.
- Replaced the earlier access-only CSS split with `assets/css/base.css` and `assets/css/brand.css`. Added `assets/js/brand-entry.js` for the brand/login module preview helper.

## What did not change

- No real authentication.
- No Supabase Auth.
- No RLS.
- No SQL table migration.
- No new operational module.
- No Supabase data reset.
- No broad CSS cleanup.
- No framework migration.
- No calendar rewrite.

## Validation performed

- JavaScript syntax check passed for all JS files.
- CSS brace-balance check passed for `base.css`, `brand.css`, and `app.css`.
- Duplicate HTML ID check passed.
- Duplicate function declaration check passed.
- Zip integrity check passed.

## Visual testing note

Please manually verify after deployment:

1. First screen is the private dev gate only.
2. Valid private dev credentials open the RestoStaff access screen.
3. No admin credentials are displayed on screen.
4. Login page is neutral RestoStaff-branded, not Bouillon-branded.
5. Module preview is visual and compact.
6. Restaurant dropdown can select Bouillon/Demo/other existing workspaces.
7. Owner name + password/PIN enters the manager app.
8. Employee name + password/PIN enters My Schedule.
9. Direct restaurant URLs still require the dev gate first during development.