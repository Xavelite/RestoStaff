# Disposable database replay

Use this procedure before a release when managed backups are unavailable. Never
run reset, repair or replay commands against the production-linked project.

## Current baseline constraint

The reviewed migration directory is an incremental chain for the existing
restogogo schema. It is not yet a fresh-install baseline: migrations 001-015
expect the accepted pre-migration public schema. A canonical empty-database
baseline will be assembled only after the model-hardening phases stabilize.

Until then, a disposable replay means:

1. Create a disposable Supabase project or database branch.
2. Restore a schema-only export of the accepted pre-migration public schema.
3. Link the CLI to that disposable project.
4. Confirm its migration ledger matches the restored baseline.
5. Run `npx supabase db push --dry-run`, inspect the ordered plan, then run
   `npx supabase db push`.
6. Run:
   - `npx supabase db query --linked --file supabase/tests/security_contract.sql`
   - `npx supabase db query --linked --file supabase/tests/canonical_schema_security.sql`
   - `npx supabase db lint --linked --schema public --level error`
7. Load only disposable fixtures and exercise owner, manager, employee and badge
   flows.
8. Delete the disposable project after preserving the verification report.
9. Relink the CLI to development and verify the project reference before doing
   any further database work.

When Docker is available, the same checks may run locally after the canonical
fresh-install baseline exists. `supabase db reset --linked` is never permitted.
