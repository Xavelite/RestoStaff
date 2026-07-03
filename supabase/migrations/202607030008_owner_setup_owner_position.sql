begin;

-- The owner employee created during onboarding should not inherit the first
-- operational job function (for example Cook). Give the owner an explicit
-- Owner position while starter employees keep their selected service positions.
do $$
declare
  v_definition text;
  v_before text;
begin
  select pg_get_functiondef(
    'public.setup_owner_workspace(text,text,citext,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure
  )
  into v_definition;
  v_before := v_definition;

  v_definition := replace(
    v_definition,
    '  v_job_id uuid;' || chr(10) || 'begin',
    '  v_job_id uuid;' || chr(10) || '  v_owner_job_id uuid;' || chr(10) || 'begin'
  );

  v_definition := replace(
    v_definition,
    '  if not exists (select 1 from public.job_functions where restaurant_id = v_restaurant_id) then' || chr(10) ||
    '    insert into public.job_functions (restaurant_id, code, name, sort_order)' || chr(10) ||
    '    values (v_restaurant_id, ''staff'', ''Staff'', 10);' || chr(10) ||
    '  end if;' || chr(10) || chr(10) ||
    '  insert into public.contract_types',
    '  if not exists (select 1 from public.job_functions where restaurant_id = v_restaurant_id) then' || chr(10) ||
    '    insert into public.job_functions (restaurant_id, code, name, sort_order)' || chr(10) ||
    '    values (v_restaurant_id, ''staff'', ''Staff'', 10);' || chr(10) ||
    '  end if;' || chr(10) || chr(10) ||
    '  insert into public.job_functions (restaurant_id, code, name, sort_order)' || chr(10) ||
    '  values (v_restaurant_id, ''owner'', ''Owner'', 0)' || chr(10) ||
    '  on conflict (restaurant_id, code) do update set' || chr(10) ||
    '    name = excluded.name,' || chr(10) ||
    '    sort_order = excluded.sort_order,' || chr(10) ||
    '    active = true,' || chr(10) ||
    '    updated_at = now()' || chr(10) ||
    '  returning id into v_owner_job_id;' || chr(10) || chr(10) ||
    '  insert into public.contract_types'
  );

  v_definition := replace(
    v_definition,
    '  select id into v_job_id from public.job_functions' || chr(10) ||
    '  where restaurant_id = v_restaurant_id order by sort_order, name limit 1;' || chr(10) || chr(10) ||
    '  insert into public.employee_job_functions',
    '  v_job_id := v_owner_job_id;' || chr(10) || chr(10) ||
    '  insert into public.employee_job_functions'
  );

  if v_definition = v_before or position('v_owner_job_id' in v_definition) = 0 then
    raise exception 'Owner setup position contract drifted.';
  end if;

  execute v_definition;
end;
$$;

alter function public.setup_owner_workspace(
  text,text,citext,text,text,jsonb,jsonb,jsonb,jsonb,jsonb
) owner to postgres;
revoke all on function public.setup_owner_workspace(
  text,text,citext,text,text,jsonb,jsonb,jsonb,jsonb,jsonb
) from public, anon, authenticated;
grant execute on function public.setup_owner_workspace(
  text,text,citext,text,text,jsonb,jsonb,jsonb,jsonb,jsonb
) to authenticated;

commit;
