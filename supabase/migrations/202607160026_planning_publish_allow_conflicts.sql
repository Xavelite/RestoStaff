-- Publishing is never hard-blocked. Coverage gaps already publish behind
-- p_allow_coverage_gaps; extend the same confirmed-override model to
-- availability/leave conflicts via p_allow_conflicts so a manager can publish
-- a week with known conflicts after confirming, instead of being stopped.
begin;

do $allow_conflicts$
declare
  v_definition text;
  v_new_definition text;
begin
  select replace(
    pg_get_functiondef(
      'public.save_manager_planning(uuid,date,text,jsonb,jsonb,bigint,text,boolean)'::regprocedure
    ),
    chr(13),
    ''
  )
  into v_definition;

  -- 1. Append the new override parameter to the signature.
  v_new_definition := regexp_replace(
    v_definition,
    'p_allow_coverage_gaps boolean DEFAULT false\)',
    'p_allow_coverage_gaps boolean DEFAULT false, p_allow_conflicts boolean DEFAULT false)',
    'i'
  );
  if v_new_definition = v_definition then
    raise exception 'Planning allow-conflicts signature contract drifted.';
  end if;
  v_definition := v_new_definition;

  -- 2. Gate the planning-conflict raise on the override flag. Whitespace is
  --    matched loosely so it survives pg_get_functiondef reformatting.
  v_new_definition := regexp_replace(
    v_definition,
    'if\s+exists\s*\(\s*select\s+1\s+from\s+jsonb_array_elements\(v_issues\)\s+issue\s+where\s+issue->>''kind''\s*<>\s*''coverage_gap''\s*\)\s+then',
    'if not p_allow_conflicts and exists ( select 1 from jsonb_array_elements(v_issues) issue where issue->>''kind'' <> ''coverage_gap'' ) then',
    'i'
  );
  if v_new_definition = v_definition then
    raise exception 'Planning allow-conflicts gate contract drifted.';
  end if;

  execute v_new_definition;
end
$allow_conflicts$;

revoke all on function public.save_manager_planning(
  uuid,date,text,jsonb,jsonb,bigint,text,boolean,boolean
) from public, anon, authenticated;
grant execute on function public.save_manager_planning(
  uuid,date,text,jsonb,jsonb,bigint,text,boolean,boolean
) to authenticated;

drop function public.save_manager_planning(
  uuid,date,text,jsonb,jsonb,bigint,text,boolean
);

commit;
