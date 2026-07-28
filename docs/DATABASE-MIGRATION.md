# Database migration

This procedure updates an existing hosted Restogogo project. It is not the
empty-project bootstrap described in `DATABASE.md`.

## Before deployment

1. Confirm the intended project name and ref. Never infer the target from a
   browser URL or a copied `.env`.
2. Back up the environment using the managed backup workflow available for its
   plan. For identity-sensitive changes, capture reviewed before-state counts
   and stable identifiers.
3. Compare the target migration ledger with `supabase/migrations`.
4. Run migration-specific preflight SQL. Reservation identity changes require
   `supabase/tests/reservation_identity_preflight.sql`.
5. Run `npm run validate` from a clean committed source tree.

## Apply and verify

1. Apply only the unapplied, reviewed migrations to the explicit target. Never
   rewrite applied migration files or run `supabase db reset --linked`.
2. Regenerate `src/lib/supabase/database.types.ts` from that database and review
   the diff. Generated types must describe the deployed schema.
3. Deploy all five Edge Functions with the target environment's secrets and
   exact `APP_ORIGIN`.
4. Run `npm run verify:database:linked` when the repository is linked to the
   intended non-production verification target. For production, use isolated
   CLI state or the guarded scripts documented in `DATABASE.md`; do not replace
   the development link casually.
5. Compare the migration ledger, identity counts, grants, and generated types
   with the reviewed before-state. Run role and browser acceptance against the
   deployed frontend.

## Failure handling

Stop on the first mismatch. Do not mark migrations as applied, edit ledger
history, or patch generated types to make a gate pass. Restore through the
environment's reviewed recovery path or add a forward-only corrective
migration after the actual database state is understood.
