# RestoStaff Code Review — v179 Access / Welcome Portal

## Scope reviewed

v179 changes only the first access layers and documentation:

- private development gate
- RestoStaff welcome / module overview page
- restaurant owner/employee access screen styling and fields
- removal of front-page restaurant creation/payment CTA
- docs update

The operational modules were intentionally left unchanged.

## Main design decision

The first screen is now a private lock, not a marketing page. This keeps the deployed prototype hidden while development continues.

After unlocking, the user sees the RestoStaff-branded welcome page with product/module information and restaurant workspace cards. This separates development protection from product storytelling.

## Preserved behavior

- Supabase remains configured as the source of truth.
- The one-row JSONB workspace model remains unchanged.
- Existing restaurant workspaces remain selectable.
- Owner and employee prototype password/PIN remains `0000`.
- Employee visibility rules remain unchanged.
- Existing Time Clock, Planning, Inventory, Daily Close, Team/HR, Forecast, Exports, Costs, Dashboard, and Setup behavior is preserved.

## Notes / risks

- The private dev gate is not real production security. It is a prototype lock only.
- The current full-state JSONB save model still has concurrency risk if multiple devices edit the same restaurant at once.
- Visual browser testing should be done after deployment because the container browser was blocked by environment policy.

## Recommended next step

Manually smoke-test the v179 access flow after Vercel deployment, then continue with one focused module polish pass, ideally Inventory or Daily Close, before touching Planning calendar CSS.
