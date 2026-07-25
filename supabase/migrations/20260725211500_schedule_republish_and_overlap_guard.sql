-- V590: direct republishing and one structural overlap guard.
-- Published weeks can be edited locally and republished in one explicit action;
-- there is no ordinary unpublish/revert step in the manager workflow.

begin;

do $schedule_republish$
declare
  v_definition text;
  v_next text;
begin
  select replace(
    pg_get_functiondef(
      'public.save_manager_planning(uuid,date,text,jsonb,jsonb,bigint,text,boolean,boolean)'::regprocedure
    ),
    chr(13),
    ''
  ) into v_definition;

  -- Remove the obsolete two-step "revert to draft before changing" contract.
  v_next := regexp_replace(
    v_definition,
    E'\\n\\s*if v_current\\.planning_status = ''published'' and v_status = ''published'' then\\s*\\n\\s*raise exception ''Revert the published plan to draft before changing it\\.'';\\s*\\n\\s*end if;',
    '',
    'i'
  );
  if v_next = v_definition then
    raise exception 'Planning republish guard contract drifted.';
  end if;
  v_definition := v_next;

  -- Lunch and evening are separate service slots, so the unique slot key alone
  -- cannot prevent two shifts for the same employee/day from overlapping.
  v_next := replace(
    v_definition,
    E'  if v_status = ''published'' then\n',
    E'  if v_status = ''published'' and exists (\n'
    || E'    with normalized as (\n'
    || E'      select\n'
    || E'        nullif(value->>''employee_id'', '''')::uuid as employee_id,\n'
    || E'        nullif(value->>''weekday'', '''')::smallint as weekday,\n'
    || E'        lower(btrim(value->>''service_key'')) as service_key,\n'
    || E'        extract(hour from nullif(value->>''starts_at'', '''')::time)::integer * 60\n'
    || E'          + extract(minute from nullif(value->>''starts_at'', '''')::time)::integer as start_minute,\n'
    || E'        case\n'
    || E'          when nullif(value->>''ends_at'', '''')::time <= nullif(value->>''starts_at'', '''')::time\n'
    || E'            then extract(hour from nullif(value->>''ends_at'', '''')::time)::integer * 60\n'
    || E'              + extract(minute from nullif(value->>''ends_at'', '''')::time)::integer + 1440\n'
    || E'          else extract(hour from nullif(value->>''ends_at'', '''')::time)::integer * 60\n'
    || E'              + extract(minute from nullif(value->>''ends_at'', '''')::time)::integer\n'
    || E'        end as end_minute\n'
    || E'      from jsonb_array_elements(coalesce(p_planned_shifts, ''[]''::jsonb))\n'
    || E'    )\n'
    || E'    select 1\n'
    || E'    from normalized first_shift\n'
    || E'    join normalized second_shift\n'
    || E'      on second_shift.employee_id = first_shift.employee_id\n'
    || E'     and second_shift.weekday = first_shift.weekday\n'
    || E'     and second_shift.service_key > first_shift.service_key\n'
    || E'     and first_shift.start_minute < second_shift.end_minute\n'
    || E'     and second_shift.start_minute < first_shift.end_minute\n'
    || E'  ) then\n'
    || E'    raise exception ''Overlapping shifts must be resolved before publishing.'';\n'
    || E'  end if;\n\n'
    || E'  if v_status = ''published'' then\n'
  );
  if v_next = v_definition then
    raise exception 'Planning overlap guard insertion contract drifted.';
  end if;
  v_definition := v_next;

  -- A republish is an audited planning publication even though the lifecycle
  -- status stays published. It increments the revision and refreshes published_at.
  v_next := replace(
    v_definition,
    E'  if coalesce(v_current.planning_status, ''draft'') <> v_status then\n',
    E'  if coalesce(v_current.planning_status, ''draft'') <> v_status\n'
    || E'      or (v_current.planning_status = ''published'' and v_status = ''published'') then\n'
  );
  if v_next = v_definition then
    raise exception 'Planning republish audit contract drifted.';
  end if;

  execute v_next;
end
$schedule_republish$;

revoke all on function public.save_manager_planning(
  uuid,date,text,jsonb,jsonb,bigint,text,boolean,boolean
) from public, anon;
grant execute on function public.save_manager_planning(
  uuid,date,text,jsonb,jsonb,bigint,text,boolean,boolean
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
