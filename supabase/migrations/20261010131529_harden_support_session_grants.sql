-- setup_owner_workspace_v2 is the only browser-facing onboarding boundary.
-- Its legacy implementation helper remained executable after the latest
-- starter-access repair, which violates the canonical RPC allowlist.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';
select pg_advisory_xact_lock(
  hashtextextended('restogogo:20261010131529:harden-support-session-grants', 0)
);

revoke all on function public.setup_owner_workspace(
  text,
  text,
  citext,
  text,
  text,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb
) from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
