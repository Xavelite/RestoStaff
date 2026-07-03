-- Preconditions:
-- - restaurant_memberships and the canonical manager mutation RPCs exist.
-- - Migration 012 has been applied.
--
-- Rollback:
-- - Restore the three RPC definitions from the pre-deployment schema backup
--   and drop public.active_membership_role(uuid, uuid).
--
-- The legacy require_owner_or_manager_context() helper intentionally returns
-- identity context only. Older RPC bodies incorrectly assumed that its record
-- also exposed a field named "role". Resolve the active membership role
-- through one explicit, reusable owner instead.

begin;

create or replace function public.active_membership_role(
  p_restaurant_id uuid,
  p_profile_id uuid
)
returns text
language sql
stable
security definer
set search_path = public
as $active_membership_role$
  select m.role::text
  from public.restaurant_memberships m
  where m.restaurant_id = p_restaurant_id
    and m.profile_id = p_profile_id
    and m.status = 'active'
    and m.role in ('owner', 'manager')
  limit 1
$active_membership_role$;

revoke all on function public.active_membership_role(uuid, uuid)
  from public, anon, authenticated;

do $repair_actor_role$
declare
  v_signature text;
  v_definition text;
  v_repaired text;
begin
  foreach v_signature in array array[
    'public.save_actuals_lifecycle(uuid,text,jsonb)',
    'public.save_schedule_exception_lifecycle(uuid,uuid,uuid,text,jsonb)',
    'public.save_manager_planning(uuid,date,text,jsonb,jsonb,timestamptz)'
  ]
  loop
    select pg_get_functiondef(to_regprocedure(v_signature))
    into v_definition;

    if v_definition is null then
      raise exception 'Required RPC % is missing.', v_signature;
    end if;

    v_repaired := replace(
      v_definition,
      'v_actor.role',
      'public.active_membership_role(p_restaurant_id, v_actor.profile_id)'
    );

    if v_repaired = v_definition
        and position(
          'active_membership_role(p_restaurant_id, v_actor.profile_id)'
          in v_definition
        ) = 0 then
      raise exception 'RPC % does not contain the expected actor-role contract.', v_signature;
    end if;

    if v_repaired <> v_definition then
      execute v_repaired;
    end if;
  end loop;
end
$repair_actor_role$;

commit;
