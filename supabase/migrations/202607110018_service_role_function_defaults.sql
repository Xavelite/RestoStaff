-- Keep future app-owned routines on the same explicit service-role allowlist
-- enforced for the current schema by migration 017.
alter default privileges for role postgres in schema public
  revoke all on functions from service_role;
