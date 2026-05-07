# RestoStaff Code Review — v180 Minimal Access Flow

## Scope reviewed

v180 changes only the access layers and documentation:

- private development gate copy and placeholders
- removal of visible admin credential hints
- removal of the visible restaurant/workspace selector from the post-gate flow
- compact RestoStaff-branded name + password/PIN access page
- owner/employee identity resolution for the prototype

Operational modules were intentionally left unchanged.

## Design decision

The entry experience should feel like the Time Clock / Terminal direction: fast, focused and low-reading. The previous v179 post-gate screen was too close to a marketing page and exposed restaurant cards. v180 keeps the first screen private and makes the second screen a clean app login.

## Preserved behavior

- Supabase remains the source of truth.
- The one-row JSONB workspace model remains unchanged.
- Direct workspace routing by subdomain/query string remains supported.
- Prototype owner/employee password/PIN remains `0000` internally.
- Employee visibility rules remain unchanged.
- Existing Time Clock, Planning, Inventory, Daily Close, Team/HR, Forecast, Exports, Costs, Dashboard, and Setup behavior is preserved.

## Notes / risks

- The private gate and PIN flow are prototype-only and not production security.
- The app still relies on full JSONB workspace saves, so concurrent-device overwrite risk remains.
- Visual browser testing should be done after deployment.

## Recommended next step

Approve the new minimal entry flow, then begin controlled file fractioning in v181. Start with access-specific CSS/JS, then move module code gradually without behavior rewrites.
