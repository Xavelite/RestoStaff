# RestoStaff v198 — Final Login CTA Polish

RestoStaff is a premium restaurant staff planning and operations prototype for restaurants in Belgium.

This package keeps the current vanilla static stack:

- `index.html`
- `assets/css/app.css`
- `assets/css/base.css`
- `assets/css/brand.css`
- `assets/js/app.js`
- `assets/js/brand-entry.js`
- `assets/js/config.js`
- `assets/js/data-adapter.local.js`
- `assets/js/data-adapter.supabase.js`
- Supabase one-row JSONB persistence through `public.planner_state`

## v198 focus

v198 keeps the approved brand-entry structure, restores the cleaner line-style module icons, changes module paging to 1–6 then 4–9, and fixes the CTA brand gradient at the source by preventing legacy app button CSS from leaking into the isolated brand page.

## Current modules

- Private dev gate
- Neutral RestoStaff restaurant access
- Prototype restaurant + name + password/PIN access
- Planning calendar
- Employee My Schedule
- Time Clock terminal
- Time Clock landing, actual timesheet and badge monitor
- Inventory MVP
- Daily Close / Payments
- Team / HR profiles and absences
- Reservations / Covers Forecast
- Exports
- Costs
- Dashboard
- Setup wizard
- Notifications

## Access model

Prototype access only:

- Private development gate: `admin` / `0000`
- Restaurant owner password/PIN: `0000`
- Employee password/PIN: `0000`
- No real Supabase Auth yet
- No production roles or RLS yet

The dev gate is useful to keep the deployed prototype hidden during development, but it is not production security. Real owner/employee accounts should come later with Supabase Auth, roles, memberships, and RLS.

For the current prototype, the neutral RestoStaff login uses a restaurant dropdown. Later, direct subdomains such as `bouillon.example.com` should scope the login to one restaurant, while an owner account on the main domain can show that owner’s restaurants after real authentication.

## Storage model

Current prototype storage remains:

```txt
public.planner_state
- id text primary key
- data jsonb not null
- updated_at timestamptz default now()
```

Each restaurant workspace is still one Supabase row. Supabase remains the source of truth for app data. Local storage is used only for prototype dev-gate/session/workspace/theme/preferences.

## Preserved

- Supabase adapter/configuration
- One-row JSONB workspace model
- Prototype owner/employee login model
- Employee/manager visibility split
- Time Clock terminal flow
- Photo proof behavior
- Workspace routing
- Modern Light and Modern Dark themes
- Sticky calendar behavior and existing module markup

## Deployment reminder

Use the usual routine:

1. Unzip this package.
2. Replace the local GitHub Desktop repo files.
3. Commit to `main`.
4. Push origin.
5. Let Vercel auto-deploy.
6. Do not touch DNS.
7. Do not reset Supabase data.