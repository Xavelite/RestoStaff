begin;

-- Schedule History is intentionally separate from the date-bounded operations
-- snapshot. History needs a long horizon, while roster reads must remain small.
create function public.get_schedule_history_read_model(
  p_restaurant_id uuid,
  p_limit integer default 500
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $get_schedule_history$
declare
  v_context record;
begin
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'Schedule history reads require a limit between 1 and 1000.';
  end if;

  select *
  into v_context
  from public.require_workspace_read_context(p_restaurant_id);

  if v_context.actor_role not in ('owner', 'manager') then
    raise exception 'Owner or manager access required.';
  end if;

  return jsonb_build_object(
    'restaurant_id', p_restaurant_id,
    'events', coalesce((
      select jsonb_agg(to_jsonb(history_event) order by history_event.created_at desc, history_event.id desc)
      from (
        select event.*
        from public.work_week_events event
        where event.restaurant_id = p_restaurant_id
          and event.event_type like 'planning\_%' escape '\'
        order by event.created_at desc, event.id desc
        limit p_limit
      ) history_event
    ), '[]'::jsonb)
  );
end
$get_schedule_history$;

revoke all on function public.get_schedule_history_read_model(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.get_schedule_history_read_model(uuid, integer)
  to authenticated;

notify pgrst, 'reload schema';
commit;
