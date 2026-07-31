begin;

-- Audit evidence stores complete before/after snapshots. The History screen only
-- receives its display fields so a mature tenant does not download those payloads.
create or replace function public.get_schedule_history_read_model(
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
      select jsonb_agg(
        jsonb_build_object(
          'id', history_event.id,
          'restaurant_id', history_event.restaurant_id,
          'week_start', history_event.week_start,
          'event_type', history_event.event_type,
          'reason', history_event.reason,
          'actor_role', history_event.actor_role,
          'created_at', history_event.created_at
        )
        order by history_event.created_at desc, history_event.id desc
      )
      from (
        select
          event.id,
          event.restaurant_id,
          event.week_start,
          event.event_type,
          event.reason,
          event.actor_role,
          event.created_at
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

notify pgrst, 'reload schema';
commit;
