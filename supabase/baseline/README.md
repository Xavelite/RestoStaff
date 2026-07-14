# Fresh-project baseline

This directory is the canonical current-state bootstrap for a completely empty
hosted Supabase project. It is separate from `supabase/migrations`, which
preserves the incremental history of existing projects.

Apply the files in this order:

1. `assert-empty.sql`
2. `prerequisites.sql`
3. `public.sql`
4. `platform.sql`
5. `seed.sql`

Use `scripts/bootstrap-disposable-database.ps1`; it enforces the order, records
the consolidated migration cutoff, applies any newer migrations normally, runs
every executable SQL contract, lints the schema, and compares generated public
types. It accepts only an empty project named `restogogo-acceptance-*` and
refuses the linked development project.

`public.sql` is a reviewed schema-only capture of the linked development public
schema after migration `202607120020_preserve_elapsed_availability`. It does
not contain application rows, auth identities, secrets, environment-specific
URLs, or Storage objects.
