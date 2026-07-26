-- Restaurant operations are part of a manager's daily workspace. Keep the
-- existing owner-or-manager membership guard consistent across Restaurant,
-- Planning, Team, Reservations and Time & attendance.

create or replace function public.get_restaurant_read_model(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $get_restaurant$
declare
  v_context record;
begin
  select * into v_context from public.require_workspace_read_context(p_restaurant_id);
  if v_context.actor_role not in ('owner', 'manager') then
    raise exception 'Owner or manager access required.';
  end if;
  return public.build_restaurant_read_model(p_restaurant_id);
end
$get_restaurant$;

do $manager_restaurant_save$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'public.save_restaurant_model(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure
  )
  into v_definition;

  v_definition := replace(
    v_definition,
    'perform 1 from public.require_owner_context(p_restaurant_id);',
    'perform 1 from public.require_owner_or_manager_context(p_restaurant_id);'
  );

  if v_definition not like '%require_owner_or_manager_context(p_restaurant_id)%' then
    raise exception 'save_restaurant_model authorization contract could not be updated';
  end if;

  execute v_definition;
end
$manager_restaurant_save$;

revoke all on function public.get_restaurant_read_model(uuid) from public, anon;
grant execute on function public.get_restaurant_read_model(uuid) to authenticated;

notify pgrst, 'reload schema';
