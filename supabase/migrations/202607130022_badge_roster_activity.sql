-- Show the latest server-recorded state on the shared terminal roster.
begin;

create or replace function public.list_badge_roster(p_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
begin
  perform 1 from public.require_owner_or_manager_context(p_restaurant_id);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'employee_id', e.id,
        'display_name', e.display_name,
        'clocked_in', coalesce(latest_badge.status = 'open', false),
        'service_key', latest_badge.service_key,
        'last_action', case
          when latest_badge.status = 'open' then 'in'
          when latest_badge.id is not null then 'out'
          else null
        end,
        'last_local_time', case
          when latest_badge.id is null then null
          else to_char(latest_badge.badged_at at time zone latest_badge.timezone, 'HH24:MI')
        end
      )
      order by e.display_name
    ),
    '[]'::jsonb
  )
  into v_rows
  from public.employees e
  join public.employee_access ea
    on ea.restaurant_id = e.restaurant_id and ea.employee_id = e.id
  join public.employee_pin_credentials pc
    on pc.restaurant_id = e.restaurant_id and pc.employee_id = e.id
  left join lateral (
    select
      t.id,
      t.service_key,
      t.status,
      coalesce(t.clock_out_at, t.clock_in_at, t.updated_at) as badged_at,
      coalesce(nullif(trim(rs.timezone), ''), 'Europe/Brussels') as timezone
    from public.time_entries t
    left join public.restaurant_settings rs on rs.restaurant_id = t.restaurant_id
    where t.restaurant_id = e.restaurant_id
      and t.employee_id = e.id
      and (
        t.status = 'open'
        or t.business_date = (
          now() at time zone coalesce(nullif(trim(rs.timezone), ''), 'Europe/Brussels')
        )::date
      )
    order by (t.status = 'open') desc, coalesce(t.clock_out_at, t.clock_in_at, t.updated_at) desc
    limit 1
  ) latest_badge on true
  where e.restaurant_id = p_restaurant_id
    and e.active
    and ea.access_status = 'active'
    and ea.badge_enabled
    and pc.pin_status = 'active';

  return jsonb_build_object('restaurant_id', p_restaurant_id, 'employees', v_rows);
end;
$$;

revoke all on function public.list_badge_roster(uuid) from public, anon, authenticated;
grant execute on function public.list_badge_roster(uuid) to authenticated;

commit;
