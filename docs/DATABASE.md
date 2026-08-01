# Database

## Canonical lifecycle

`supabase/baseline` recreates an empty hosted project through the version in
`cutoff.txt`. The bootstrap records those versions as applied, then runs every
newer migration normally. Adding a migration does not require recapturing the
baseline. Advance the cutoff only during a deliberate consolidation.

The current cutoff is `202607120020_preserve_elapsed_availability`.
Runtime roles `anon`, `authenticated`, and `service_role` have schema `USAGE`
without `CREATE`. Administrative owners retain schema management. Public
business access uses explicit object allowlists, RPCs, and RLS.

The generated public type file includes Restogogo routines and extension-owned
public routines/overloads, notably from `citext`; raw routine totals therefore
are not an application API count.

## Verification layers

`npm run validate` checks local application behavior, Svelte/TypeScript, Edge
source, dead code, and the production build. It does not contact a database.

`npm run verify:database:linked` checks the linked development ledger, executes
rollback-contained SQL security/workflow contracts, lints `public`, and compares
freshly generated types with the committed file.

After deploying `dispatch-push`, configure its environment-specific scheduler:

```powershell
npm run configure:push-scheduler
```

The command reads the linked project's URL from `.env`, generates and synchronizes
a dispatch secret when one is not supplied, stores only the URL and secret in
Supabase Vault, schedules the Edge invocation every minute, and verifies
the complete database-to-Edge path with a dry run. Pass `-ProjectUrl`,
`-ProjectRef`, `-DispatchSecret`, or `-Schedule` explicitly when configuring
another environment. An explicit project ref uses isolated temporary CLI state
and does not change the repository's development link.

For the production project, set the canonical Auth site and redirect URL with:

```powershell
npm run configure:hosted-auth -- -ProjectRef '<REF>' -AppOrigin 'https://restogogo.com'
```

The command accepts only a hosted project named exactly `Restogogo Production`
and updates only the granular Auth configuration. It uses
`SUPABASE_ACCESS_TOKEN` when present and otherwise reuses the Supabase CLI
credential on Windows.

`npm run bootstrap:database -- -ProjectRef <ref>` performs the complete empty
hosted replay. It requires `ALLOW_DESTRUCTIVE_DATABASE_BOOTSTRAP=YES` and
`SUPABASE_DB_PASSWORD`, accepts only an empty project named
`restogogo-acceptance-*`, refuses the linked development ref, uses an isolated
temporary CLI link, and removes local temporary state.

For a permanent empty production project named exactly `Restogogo Production`,
run `npm run bootstrap:production -- -ProjectRef <ref>` with
`SUPABASE_DB_PASSWORD` and `ALLOW_PRODUCTION_DATABASE_BOOTSTRAP` set to that
exact project ref. The command uses the same replay and validation path, refuses
the linked development project, and cannot target a differently named project.

Run the complete disposable hosted lifecycle with:

```powershell
npm run verify:hosted:disposable -- -OrganizationId '<ORGANIZATION_ID>'
```

The command creates a uniquely named project, waits for health, bootstraps it,
creates managed Auth fixtures, deploys Edge Functions, executes role/Realtime/
Storage acceptance, clears process secrets, and deletes the project in `finally`.
Workspace Realtime uses the RLS-protected `workspace_realtime_events` table and
`publish_workspace_realtime_event` RPC; the bootstrap never alters objects in
Supabase's platform-owned `realtime` schema.
Browser QA remains a separate human acceptance layer.

Private restaurant documents use the `restaurant-documents` Storage bucket.
`begin_restaurant_document_upload` reserves restaurant quota and an exact object
path; Storage policies accept only that signed-in Owner/Manager reservation;
`finalize_restaurant_document_upload` verifies the completed size and MIME type
before publication. The included defaults are 10 MB per file and 250 MB per
restaurant. Paid capacity changes are explicit setting changes after commercial
confirmation, never a client-side quota bypass.

## Consolidation

With PostgreSQL 17 `pg_dump.exe` available:

```powershell
npm run capture:database-baseline -- -PgDumpPath '<PATH_TO_PG_DUMP.EXE>'
```

Review the schema-only diff, update platform/catalog files when needed, choose
and record the intentional cutoff, replay on a disposable hosted project, and
commit them together. The capture rejects incomplete output, encoding damage,
credentials, and row data.

Never run `supabase db reset --linked`, bootstrap development or production,
load disposable fixtures outside an acceptance project, or hand-edit generated
types to imitate a deployment.

## Advisor posture

Supabase advisors are reviewed, not applied mechanically. Direct table access is
deliberately narrow and many tables are reachable only through exact-grant,
security-definer RPCs whose tenant and role checks are exercised by the SQL
contracts. An RLS-enabled table with no direct policy can therefore be an
intentional deny-by-default boundary.

The executable access manifest is `supabase/tests/canonical_schema_security.sql`:

- `anon` can execute only the four token-protected badge-station routines;
- `authenticated` can execute only the reviewed application RPC allowlist;
- `service_role` can execute only invitation, proof, push and other explicitly
  server-owned routines;
- direct authenticated table access is limited to notification types, personal
  notification preferences and receipts, plus the read-only Realtime event
  stream; every other business table is RPC-only;
- every application-owned SQL routine has an explicit `search_path`, and
  trigger helpers are never directly executable.

On 2026-08-01, the linked DEV advisor review reported 101 RLS-enabled tables
without direct policies, 115 executable security-definer routines, 131 foreign
keys without covering indexes and 23 unused indexes. The first two groups match
the deny-by-default/RPC access model above. DEV tables are currently small, so
the index notices are a profiling backlog, not permission to add or remove
indexes mechanically. Recheck query plans with representative pilot volume and
index only demonstrated joins, deletes or lifecycle queries.

Moving extension-owned objects, changing function security mode, or adding
indexes can alter generated types, grants, query plans, and bootstrap behavior.
Make those changes only for a demonstrated security or performance need and
validate the complete disposable replay afterward. Hosted Auth leaked-password
protection is available only on paid Supabase plans; the current DEV organization
is on Free, so this remains an explicit production-plan gate. Backup retention
and recovery guarantees are also environment settings, not migration substitutes.

`citext` and `btree_gist` are intentionally retained in `public` for the current
baseline because the captured schema contains `public.citext` routine and column
signatures. Relocating either extension requires a reviewed baseline recapture
and disposable replay; moving it only to silence an advisor would make the two
bootstrap paths disagree.

## Pilot tenant promotion

The production bootstrap intentionally contains no development identities or
restaurant rows. A reviewed pilot tenant can be copied from the hosted
development project only while production is still empty:

```powershell
npm run promote:pilot-tenant -- `
  --source-ref '<DEVELOPMENT_REF>' `
  --target-ref '<PRODUCTION_REF>' `
  --restaurant-id '<RESTAURANT_UUID>' `
  --owner-email '<OWNER_EMAIL>'
```

The default is a read-only dry run. It checks the exact hosted project names,
the selected restaurant and owner, all tenant-scoped row counts, Auth identity,
Storage, push, onboarding, and platform-admin boundaries. It refuses test-lab
restaurants, non-email identities, environment-specific owner records, Storage
objects, or any non-empty production target.

After reviewing the dry-run manifest, set
`ALLOW_PRODUCTION_TENANT_PROMOTION` to the exact production ref and add
`--execute`. The import runs in one transaction, preserves the owner's existing
password hash and stable IDs, then re-exports production and compares every
tenant-table count. Auth sessions and push subscriptions are deliberately not
portable; the owner signs in again against the production Auth project.
