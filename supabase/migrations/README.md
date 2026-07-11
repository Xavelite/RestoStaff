# Migration discipline

Only small, reviewed changes for an existing database belong here. Never paste
or rerun a broad baseline over a live environment.

Every migration must:

1. state its preconditions and rollback strategy;
2. preserve historical contracts, time entries, adjustments and audit events;
3. revoke obsolete RPC signatures before granting replacements;
4. pass `supabase/tests/security_contract.sql` and
   `supabase/tests/canonical_schema_security.sql`, plus the relevant workflow
   contract;
5. be deployed to development before generated TypeScript types are refreshed.

The ordered chain currently ends at
`202607110019_public_schema_privilege_hardening.sql`. Apply every unapplied
file in order; never rerun an already recorded migration or skip directly to a
later contract.
