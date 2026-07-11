# Supabase source contract

This directory owns the application's database lifecycle. Generated
TypeScript types describe the deployed database; they are never hand-edited to
pretend that a migration has run.

## Required structure

- `migrations/`: reviewed, ordered changes for existing environments.
- `baseline/`: reviewed fresh-install schema, platform objects, catalog seed,
  safety preflight, and migration cutoff.
- `functions/`: Edge Functions without browser-exposed service credentials.
- `tests/`: SQL verification for grants, RLS, RPC authorization and invariants.
- `seed/`: disposable non-production owner, manager and employee fixtures.

The migration directory is an incremental lineage for existing databases; the
baseline is the current-state initializer for new ones. See `docs/DATABASE.md`
for linked verification, baseline replay, and fixture commands.

## Deployment gate

Prove database changes on a disposable project, dry-run `db push`, regenerate
types only after deployment, and never run `db reset --linked`.
