# Supabase source contract

This directory owns the new application's database lifecycle. Generated
TypeScript types describe the deployed database; they are never hand-edited to
pretend that a migration has run.

## Required structure

- `migrations/`: reviewed, ordered changes for existing environments.
- `baseline/`: a fresh-install schema assembled after the migration chain and
  verification suite agree.
- `functions/`: Edge Functions without browser-exposed service credentials.
- `tests/`: SQL verification for grants, RLS, RPC authorization and invariants.
- `seed/`: disposable non-production owner, manager and employee fixtures.

The legacy `_v431_extract/db/current` SQL is an audit input only. Before SQL is
promoted here, it must be reviewed against `docs/ACCEPTANCE.md`, split into safe
migrations, tested on a disposable project and regenerated from that accepted
chain. A broad legacy baseline must never be applied to an existing database.

## Deployment gate

Follow `docs/DATABASE-MIGRATION.md` exactly. Capture public schema/data dumps
and identity-link JSON before and after, prove the chain on a disposable
project when managed backups are unavailable, dry-run `db push`, regenerate
types only after deployment, and never run `db reset --linked`.
