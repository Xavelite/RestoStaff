-- Operational setup concerns are confirmable planning warnings. Publication
-- still rejects structurally unusable times and overlaps, but an archived area,
-- closed service or position outside the employee's usual assignments no
-- longer traps the manager behind a generic database error.

begin;

do $planning_operational_warning_contract$
declare
  v_definition text;
  v_next text;
  v_old_guard text := $old_guard$
    if exists (
      select 1
      from jsonb_array_elements(coalesce(p_planned_shifts, '[]'::jsonb)) item
      left join public.work_areas a
        on a.restaurant_id = p_restaurant_id
       and a.id = nullif(item->>'area_id', '')::uuid
       and a.active
      left join public.job_functions j
        on j.restaurant_id = p_restaurant_id
       and j.id = nullif(item->>'job_function_id', '')::uuid
       and j.active
      left join public.employee_job_functions assignment
        on assignment.restaurant_id = p_restaurant_id
       and assignment.employee_id = nullif(item->>'employee_id', '')::uuid
       and assignment.job_function_id = nullif(item->>'job_function_id', '')::uuid
       and assignment.active
      left join public.opening_hours o
        on o.restaurant_id = p_restaurant_id
       and o.weekday = nullif(item->>'weekday', '')::smallint
       and o.service_key = lower(btrim(item->>'service_key'))
       and o.is_open
      where a.id is null
         or j.id is null
         or assignment.employee_id is null
         or o.id is null
         or nullif(item->>'starts_at', '')::time is null
         or nullif(item->>'ends_at', '')::time is null
         or nullif(item->>'starts_at', '')::time
              = nullif(item->>'ends_at', '')::time
    ) then
      raise exception 'Published shifts require an open service, active area, assigned position and valid times.';
    end if;
$old_guard$;
  v_new_guard text := $new_guard$
    if exists (
      select 1
      from jsonb_array_elements(coalesce(p_planned_shifts, '[]'::jsonb)) item
      where nullif(item->>'starts_at', '')::time is null
         or nullif(item->>'ends_at', '')::time is null
         or nullif(item->>'starts_at', '')::time
              = nullif(item->>'ends_at', '')::time
    ) then
      raise exception 'Published shifts require valid start and end times.';
    end if;
$new_guard$;
begin
  select replace(
    pg_get_functiondef(
      'public.save_manager_planning(uuid,date,text,jsonb,jsonb,bigint,text,boolean,boolean)'::regprocedure
    ),
    chr(13),
    ''
  )
  into v_definition;

  v_next := replace(v_definition, v_old_guard, v_new_guard);
  if v_next = v_definition then
    raise exception 'Planning operational warning guard contract drifted.';
  end if;

  execute v_next;
end
$planning_operational_warning_contract$;

revoke all on function public.save_manager_planning(
  uuid,date,text,jsonb,jsonb,bigint,text,boolean,boolean
) from public, anon;
grant execute on function public.save_manager_planning(
  uuid,date,text,jsonb,jsonb,bigint,text,boolean,boolean
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
