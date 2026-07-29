# Quality

## Commands

Use Node 22.12 or newer. `.npmrc` enforces the engine contract and `prepare`
fails when SvelteKit synchronization fails.

```powershell
npm ci
npm run validate
npm run verify:database:linked
```

Application tests protect current business behavior. SQL files protect grants,
RLS, role boundaries, lifecycle invariants, and read models against a real
database. A small set of source guardrails covers asset/route integrity,
official responsive breakpoints, and security-sensitive configuration where a
runtime unit test is not the right layer.

The SQL contract filenames describe the boundary they execute: badge and
operations, work patterns, access, Schedule/Timesheet lifecycle, read models,
payroll, model integrity, private document storage, and notification/payroll
integration.

## Browser matrix

Review Owner, Manager, and Employee routes at 1440x900, 1024x768, 768x1024,
390x844, and 360x800. Check direct URL guards, loading/empty/error/read-only
states, dialogs and drawers, keyboard focus, page overflow, mobile navigation,
and the primary workflow for each role.

The shared maximum-width ladder is 1180, 980, 760, and 520 pixels. Schedule and
Time & attendance retain their complete weekly ledger inside a bounded
horizontal workspace with a sticky employee column; mobile never widens the
document itself. Employee My service and My time use phone-focused cards.
Local scrolling is reserved for dense boards, calendars, dialogs, and bounded
previews.

Before committing, inspect the complete diff, run all validation layers relevant
to the change, confirm generated types and migration parity, and ensure Git
contains no credentials, build output, caches, local Supabase state, or temporary
acceptance material.
