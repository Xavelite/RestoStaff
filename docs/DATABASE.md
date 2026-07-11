# Database

## Canonical lifecycle

`supabase/baseline` recreates an empty hosted project through the version in
`cutoff.txt`. The bootstrap records those versions as applied, then runs every
newer migration normally. Adding a migration does not require recapturing the
baseline. Advance the cutoff only during a deliberate consolidation.

The V503 cutoff is
`202607110019_public_schema_privilege_hardening`. Runtime roles `anon`,
`authenticated`, and `service_role` have schema `USAGE` without `CREATE`.
Administrative owners retain schema management. Public business access uses
explicit object allowlists, RPCs, and RLS.

The generated public type file includes Restogogo routines and extension-owned
public routines/overloads, notably from `citext`; raw routine totals therefore
are not an application API count.

## Verification layers

`npm run validate` checks local application behavior, Svelte/TypeScript, Edge
source, dead code, and the production build. It does not contact a database.

`npm run verify:database:linked` checks the linked development ledger, executes
rollback-contained SQL security/workflow contracts, lints `public`, and compares
freshly generated types with the committed file.

`npm run bootstrap:database -- -ProjectRef <ref>` performs the complete empty
hosted replay. It requires `ALLOW_DESTRUCTIVE_DATABASE_BOOTSTRAP=YES` and
`SUPABASE_DB_PASSWORD`, accepts only an empty project named
`restogogo-acceptance-*`, refuses the linked development ref, uses an isolated
temporary CLI link, and removes local temporary state.

Hosted acceptance then loads guarded Auth fixtures, deploys the three Edge
Functions with exact `APP_ORIGIN`, and runs `npm run verify:hosted`. That layer
executes managed Auth, role RPC, private Realtime, Edge CORS/auth, and private
Storage behavior. Browser QA remains a separate human acceptance layer.

Run the complete disposable lifecycle with a Supabase organization id:

```powershell
npm run verify:hosted:disposable -- -OrganizationId '<ORGANIZATION_ID>'
```

The command creates a uniquely named project, waits for health, bootstraps it,
creates fixtures, deploys Edge Functions, runs acceptance, clears process
secrets, and deletes the project in `finally`.

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
