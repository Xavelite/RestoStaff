begin;

-- setup_owner_workspace creates a restaurant before it can insert the owner
-- membership. Since restaurants.owner_profile_id is now mandatory, the RPC must
-- write the owner of record directly instead of relying on the membership
-- trigger to backfill it after the row exists.
create or replace function public.setup_owner_workspace(
  p_owner_first_name text,
  p_owner_last_name text,
  p_owner_email citext,
  p_restaurant_name text,
  p_city text default '',
  p_employees jsonb default '[]'::jsonb,
  p_opening_hours jsonb default '[]'::jsonb,
  p_areas jsonb default '[]'::jsonb,
  p_job_functions jsonb default '[]'::jsonb,
  p_coverage jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user uuid := auth.uid();
  v_profile_id uuid;
  v_restaurant_id uuid;
  v_item jsonb;
  v_employee_id uuid;
  v_owner_employee_id uuid;
  v_area_id uuid;
  v_job_id uuid;
begin
  if v_auth_user is null then raise exception 'Authentication required.'; end if;
  if lower(coalesce(auth.jwt()->>'email', '')) <> lower(p_owner_email::text) then
    raise exception 'Owner email must match the authenticated account.';
  end if;

  insert into public.profiles (auth_user_id, first_name, last_name, email)
  values (v_auth_user, btrim(p_owner_first_name), btrim(p_owner_last_name), p_owner_email)
  on conflict (email) do update set
    auth_user_id = excluded.auth_user_id,
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    updated_at = now()
  returning id into v_profile_id;

  insert into public.restaurants (
    workspace_slug, name, legal_name, city, email, country_code, owner_profile_id
  )
  values (
    public.unique_workspace_slug(p_restaurant_name),
    btrim(p_restaurant_name), btrim(p_restaurant_name),
    nullif(btrim(p_city), ''), p_owner_email, 'BE', v_profile_id
  )
  returning id into v_restaurant_id;

  insert into public.restaurant_settings (
    restaurant_id, timezone, locale, currency_code, week_start_weekday
  )
  values (v_restaurant_id, 'Europe/Brussels', 'fr-BE', 'EUR', 1);

  insert into public.restaurant_onboarding_state (
    restaurant_id, state, last_step, workspace_created_at
  )
  values (v_restaurant_id, 'workspace_created', 'workspace_created', now());

  insert into public.restaurant_memberships (
    restaurant_id, profile_id, role, status
  )
  values (v_restaurant_id, v_profile_id, 'owner', 'active');

  insert into public.services (restaurant_id, service_key, name, sort_order)
  values
    (v_restaurant_id, 'lunch', 'Lunch', 10),
    (v_restaurant_id, 'evening', 'Evening', 20);

  for v_item in select value from jsonb_array_elements(coalesce(p_job_functions, '[]')) loop
    insert into public.job_functions (
      restaurant_id, code, name, estimated_hourly_cost, sort_order
    )
    values (
      v_restaurant_id,
      public.slugify_workspace(v_item #>> '{}'),
      v_item #>> '{}', 0, 10
    )
    returning id into v_job_id;
  end loop;

  if not exists (select 1 from public.job_functions where restaurant_id = v_restaurant_id) then
    insert into public.job_functions (restaurant_id, code, name, sort_order)
    values (v_restaurant_id, 'staff', 'Staff', 10);
  end if;

  insert into public.contract_types (
    restaurant_id, code, name, category, sort_order, active, metadata
  )
  values
    (v_restaurant_id, 'CDI', 'CDI', 'permanent', 10, true, '{"system":true}'),
    (v_restaurant_id, 'CDD', 'CDD', 'fixed_term', 20, true, '{"system":true}'),
    (v_restaurant_id, 'FLEXI', 'Flexi', 'flexi', 30, true, '{"system":true}'),
    (v_restaurant_id, 'STUDENT', 'Student', 'student', 40, true, '{"system":true}'),
    (v_restaurant_id, 'EXTRA', 'Extra', 'extra', 50, true, '{"system":true}'),
    (v_restaurant_id, 'FREELANCE', 'Freelance', 'self_employed', 60, true, '{"system":true}');

  insert into public.absence_types (
    restaurant_id, code, name, category, paid_policy, color,
    requires_approval, affects_planning, affects_payroll, sort_order, active, metadata
  )
  values
    (v_restaurant_id, 'HOLIDAY', 'Holiday', 'holiday', 'paid', '#22c55e', true, true, true, 10, true, '{"system":true}'),
    (v_restaurant_id, 'SICK', 'Sick leave', 'sick', 'paid', '#ef4444', true, true, true, 20, true, '{"system":true}'),
    (v_restaurant_id, 'UNPAID', 'Unpaid leave', 'unpaid', 'unpaid', '#f59e0b', true, true, true, 30, true, '{"system":true}'),
    (v_restaurant_id, 'PUBLIC_HOLIDAY', 'Public holiday', 'other', 'paid', '#38bdf8', false, true, true, 40, true, '{"system":true}'),
    (v_restaurant_id, 'OTHER', 'Other', 'other', 'neutral', '#94a3b8', true, true, true, 50, true, '{"system":true}');

  insert into public.employees (
    restaurant_id, display_name, first_name, last_name, sort_order
  )
  values (
    v_restaurant_id,
    btrim(p_owner_first_name || ' ' || p_owner_last_name),
    btrim(p_owner_first_name), btrim(p_owner_last_name), 0
  )
  returning id into v_owner_employee_id;

  insert into public.employee_access (
    restaurant_id, employee_id, profile_id, access_status, badge_enabled
  )
  values (v_restaurant_id, v_owner_employee_id, v_profile_id, 'active', true);

  select id into v_job_id from public.job_functions
  where restaurant_id = v_restaurant_id order by sort_order, name limit 1;

  insert into public.employee_job_functions (
    restaurant_id, employee_id, job_function_id, is_primary
  )
  values (v_restaurant_id, v_owner_employee_id, v_job_id, true);

  for v_item in select value from jsonb_array_elements(coalesce(p_areas, '[]')) loop
    insert into public.work_areas (
      restaurant_id, code, name, sort_order
    )
    values (
      v_restaurant_id,
      public.slugify_workspace(v_item->>'name'),
      v_item->>'name', 10
    )
    returning id into v_area_id;

    insert into public.area_service_defaults (
      restaurant_id, area_id, service_key, start_time, end_time
    )
    values
      (v_restaurant_id, v_area_id, 'lunch', nullif(v_item->>'lunch_start', '')::time, nullif(v_item->>'lunch_end', '')::time),
      (v_restaurant_id, v_area_id, 'evening', nullif(v_item->>'evening_start', '')::time, nullif(v_item->>'evening_end', '')::time);
  end loop;

  insert into public.opening_hours (
    restaurant_id, weekday, service_key, is_open, opens_at, closes_at
  )
  select
    v_restaurant_id, (value->>'weekday')::smallint, value->>'service_key',
    coalesce((value->>'is_open')::boolean, false),
    nullif(value->>'opens_at', '')::time,
    nullif(value->>'closes_at', '')::time
  from jsonb_array_elements(coalesce(p_opening_hours, '[]'));

  for v_item in select value from jsonb_array_elements(coalesce(p_coverage, '[]')) loop
    select id into v_area_id from public.work_areas
    where restaurant_id = v_restaurant_id and name = v_item->>'area' limit 1;

    select id into v_job_id from public.job_functions
    where restaurant_id = v_restaurant_id and name = v_item->>'job_function' limit 1;

    if v_area_id is not null and v_job_id is not null then
      insert into public.coverage_requirements (
        restaurant_id, area_id, job_function_id, service_key,
        coverage_scope, required_count
      )
      values
        (v_restaurant_id, v_area_id, v_job_id, 'lunch', 'default', 1),
        (v_restaurant_id, v_area_id, v_job_id, 'evening', 'default', 1);
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_employees, '[]')) loop
    insert into public.employees (
      restaurant_id, display_name, first_name, last_name
    )
    values (
      v_restaurant_id, btrim(v_item->>'display_name'),
      nullif(btrim(v_item->>'first_name'), ''),
      nullif(btrim(v_item->>'last_name'), '')
    )
    returning id into v_employee_id;

    insert into public.employee_contact_details (
      restaurant_id, employee_id, email, phone, mobile_phone
    )
    values (
      v_restaurant_id, v_employee_id,
      nullif(btrim(v_item->>'email'), '')::citext,
      nullif(btrim(v_item->>'phone'), ''),
      nullif(btrim(v_item->>'phone'), '')
    );

    select id into v_job_id from public.job_functions
    where restaurant_id = v_restaurant_id
      and name = coalesce(nullif(v_item->>'job_function', ''), 'Staff')
    limit 1;

    if v_job_id is null then
      select id into v_job_id from public.job_functions
      where restaurant_id = v_restaurant_id order by sort_order, name limit 1;
    end if;

    insert into public.employee_job_functions (
      restaurant_id, employee_id, job_function_id, is_primary
    )
    values (v_restaurant_id, v_employee_id, v_job_id, true);

    insert into public.employee_access (
      restaurant_id, employee_id, access_status, badge_enabled
    )
    values (v_restaurant_id, v_employee_id, 'not_invited', false);
  end loop;

  return jsonb_build_object(
    'ok', true,
    'restaurant_id', v_restaurant_id,
    'profile_id', v_profile_id,
    'role', 'owner'
  );
end;
$$;

revoke all on function public.setup_owner_workspace(
  text,text,citext,text,text,jsonb,jsonb,jsonb,jsonb,jsonb
) from public, anon, authenticated;
grant execute on function public.setup_owner_workspace(
  text,text,citext,text,text,jsonb,jsonb,jsonb,jsonb,jsonb
) to authenticated;

commit;
