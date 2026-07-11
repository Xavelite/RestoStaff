begin;

do $allow_confirmed_coverage_gaps$
declare
  v_definition text;
  v_new_definition text;
begin
  select replace(
    pg_get_functiondef(
      'public.save_manager_planning(uuid,date,text,jsonb,jsonb,bigint,text)'::regprocedure
    ),
    chr(13),
    ''
  )
  into v_definition;

  v_new_definition := regexp_replace(
    v_definition,
    'p_reason text DEFAULT NULL::text\)',
    'p_reason text DEFAULT NULL::text, p_allow_coverage_gaps boolean DEFAULT false)',
    'i'
  );
  if v_new_definition = v_definition then
    raise exception 'Planning publish signature contract drifted.';
  end if;

  v_definition := v_new_definition;
  v_new_definition := replace(
    v_new_definition,
    $old$
    if jsonb_array_length(v_issues) > 0 then
      raise exception 'Resolve planning conflicts and coverage gaps before publishing.';
    end if;
$old$,
    $new$
    if exists (
      select 1
      from jsonb_array_elements(v_issues) issue
      where issue->>'kind' <> 'coverage_gap'
    ) then
      raise exception 'Resolve planning conflicts before publishing.';
    end if;
    if not p_allow_coverage_gaps and exists (
      select 1
      from jsonb_array_elements(v_issues) issue
      where issue->>'kind' = 'coverage_gap'
    ) then
      raise exception 'Review or confirm coverage gaps before publishing.';
    end if;
$new$
  );
  if v_new_definition = v_definition then
    raise exception 'Planning publish issue split contract drifted.';
  end if;

  v_definition := v_new_definition;
  v_new_definition := replace(
    v_new_definition,
    $old$
        'shift_count', jsonb_array_length(v_new_snapshot->'shifts'),
        'note_count', jsonb_array_length(v_new_snapshot->'notes')
$old$,
    $new$
        'shift_count', jsonb_array_length(v_new_snapshot->'shifts'),
        'note_count', jsonb_array_length(v_new_snapshot->'notes'),
        'coverage_gap_count', case
          when v_status = 'published' then (
            select count(*)
            from jsonb_array_elements(coalesce(v_issues, '[]'::jsonb)) issue
            where issue->>'kind' = 'coverage_gap'
          )
          else 0
        end,
        'planning_conflict_count', case
          when v_status = 'published' then (
            select count(*)
            from jsonb_array_elements(coalesce(v_issues, '[]'::jsonb)) issue
            where issue->>'kind' <> 'coverage_gap'
          )
          else 0
        end
$new$
  );
  if v_new_definition = v_definition then
    raise exception 'Planning publish metadata contract drifted.';
  end if;

  execute v_new_definition;
end
$allow_confirmed_coverage_gaps$;

revoke all on function public.save_manager_planning(
  uuid,date,text,jsonb,jsonb,bigint,text,boolean
) from public, anon, authenticated;
grant execute on function public.save_manager_planning(
  uuid,date,text,jsonb,jsonb,bigint,text,boolean
) to authenticated;

drop function public.save_manager_planning(
  uuid,date,text,jsonb,jsonb,bigint,text
);

commit;
