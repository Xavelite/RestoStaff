begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- The _v2 suffix was only a transition device: Postgres cannot change a
-- function's signature in place, so the new versions were created beside the
-- old same-named functions. Migration 005 dropped the originals, so the
-- canonical names are now free. One real function per concept, no version
-- suffixes. RENAME preserves the body, security and grants.
alter function public.setup_owner_workspace_v2(
  text, text, citext, text, text, jsonb, jsonb, jsonb, jsonb, jsonb
) rename to setup_owner_workspace;

alter function public.save_manager_planning_v2(
  uuid, date, text, jsonb, jsonb, timestamptz
) rename to save_manager_planning;

alter function public.accept_employee_invite_v2(
  uuid, text, text
) rename to accept_employee_invite;

commit;
