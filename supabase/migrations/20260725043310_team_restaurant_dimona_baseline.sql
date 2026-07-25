-- V582: consolidate Restaurant/Team ownership and prepare employer data for Dimona.
-- Additive and backwards-compatible: no operational or payroll history is removed.

alter table public.work_areas
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.work_areas
  drop constraint if exists work_areas_metadata_object_check,
  add constraint work_areas_metadata_object_check
    check (jsonb_typeof(metadata) = 'object');

create table if not exists public.restaurant_employment_settings (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  onss_employer_number text,
  establishment_unit_number text,
  joint_committee_code text not null default '302',
  dimona_submission_mode text not null default 'not_configured',
  social_secretariat_name text,
  external_employer_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_employment_settings_onss_not_blank
    check (onss_employer_number is null or btrim(onss_employer_number) <> ''),
  constraint restaurant_employment_settings_establishment_format
    check (establishment_unit_number is null or regexp_replace(establishment_unit_number, '[^0-9]', '', 'g') ~ '^[0-9]{10}$'),
  constraint restaurant_employment_settings_joint_committee_format
    check (joint_committee_code ~ '^[0-9]{3}(\.[0-9]{2})?$'),
  constraint restaurant_employment_settings_dimona_mode_check
    check (dimona_submission_mode in ('not_configured', 'direct', 'social_secretariat')),
  constraint restaurant_employment_settings_metadata_object_check
    check (jsonb_typeof(metadata) = 'object')
);

alter table public.restaurant_employment_settings enable row level security;
revoke all on table public.restaurant_employment_settings from public, anon, authenticated;
grant all on table public.restaurant_employment_settings to service_role;

create unique index if not exists employee_legal_profiles_niss_unique
  on public.employee_legal_profiles (
    restaurant_id,
    regexp_replace(national_registry_number, '[^0-9]', '', 'g')
  )
  where nullif(regexp_replace(national_registry_number, '[^0-9]', '', 'g'), '') is not null;

create or replace function public.build_restaurant_read_model(p_restaurant_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $function$
  select jsonb_build_object(
    'restaurant', to_jsonb(r),
    'restaurant_settings', coalesce((select to_jsonb(s) from public.restaurant_settings s where s.restaurant_id = r.id), '{}'::jsonb),
    'restaurant_employment_settings', case
      when public.is_owner(r.id) then coalesce((select to_jsonb(s) from public.restaurant_employment_settings s where s.restaurant_id = r.id), '{}'::jsonb)
      else '{}'::jsonb
    end,
    'restaurant_onboarding_state', coalesce((select to_jsonb(o) from public.restaurant_onboarding_state o where o.restaurant_id = r.id), '{}'::jsonb),
    'job_functions', coalesce((select jsonb_agg(to_jsonb(j) order by j.sort_order, j.name) from public.job_functions j where j.restaurant_id = r.id), '[]'::jsonb),
    'work_areas', coalesce((select jsonb_agg(to_jsonb(a) order by a.sort_order, a.name) from public.work_areas a where a.restaurant_id = r.id), '[]'::jsonb),
    'services', coalesce((select jsonb_agg(to_jsonb(s) order by s.sort_order) from public.services s where s.restaurant_id = r.id), '[]'::jsonb),
    'area_service_defaults', coalesce((select jsonb_agg(to_jsonb(d)) from public.area_service_defaults d where d.restaurant_id = r.id), '[]'::jsonb),
    'coverage_requirements', coalesce((select jsonb_agg(to_jsonb(c)) from public.coverage_requirements c where c.restaurant_id = r.id), '[]'::jsonb),
    'opening_hours', coalesce((select jsonb_agg(to_jsonb(h)) from public.opening_hours h where h.restaurant_id = r.id), '[]'::jsonb),
    'absence_types', coalesce((select jsonb_agg(to_jsonb(t) order by t.sort_order) from public.absence_types t where t.restaurant_id = r.id and t.active), '[]'::jsonb)
  )
  from public.restaurants r
  where r.id = p_restaurant_id
$function$;

create or replace function public.save_restaurant_model(
  p_restaurant_id uuid,
  p_restaurant jsonb default '{}'::jsonb,
  p_settings jsonb default '{}'::jsonb,
  p_job_functions jsonb default '[]'::jsonb,
  p_areas jsonb default '[]'::jsonb,
  p_opening_hours jsonb default '[]'::jsonb,
  p_area_service_defaults jsonb default '[]'::jsonb,
  p_coverage_requirements jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_item jsonb;
  v_id uuid;
  v_name text;
  v_employment jsonb := coalesce(p_restaurant->'employment_settings', '{}'::jsonb);
begin
  perform 1 from public.require_owner_context(p_restaurant_id);

  update public.restaurants set
    name = nullif(btrim(coalesce(p_restaurant->>'name', name)), ''),
    legal_name = nullif(btrim(coalesce(p_restaurant->>'legal_name', legal_name, p_restaurant->>'name')), ''),
    company_number = nullif(regexp_replace(coalesce(p_restaurant->>'company_number', ''), '[^0-9]', '', 'g'), ''),
    email = nullif(btrim(p_restaurant->>'email'), '')::citext,
    phone = nullif(btrim(p_restaurant->>'phone'), ''),
    address_line1 = nullif(btrim(p_restaurant->>'address_line1'), ''),
    postal_code = nullif(btrim(p_restaurant->>'postal_code'), ''),
    city = nullif(btrim(p_restaurant->>'city'), ''),
    country_code = 'BE',
    updated_at = now()
  where id = p_restaurant_id;

  if p_restaurant ? 'employment_settings' then
    insert into public.restaurant_employment_settings (
      restaurant_id, onss_employer_number, establishment_unit_number,
      joint_committee_code, dimona_submission_mode,
      social_secretariat_name, external_employer_id, metadata
    ) values (
      p_restaurant_id,
      nullif(btrim(v_employment->>'onss_employer_number'), ''),
      nullif(regexp_replace(coalesce(v_employment->>'establishment_unit_number', ''), '[^0-9]', '', 'g'), ''),
      coalesce(nullif(btrim(v_employment->>'joint_committee_code'), ''), '302'),
      coalesce(nullif(btrim(v_employment->>'dimona_submission_mode'), ''), 'not_configured'),
      nullif(btrim(v_employment->>'social_secretariat_name'), ''),
      nullif(btrim(v_employment->>'external_employer_id'), ''),
      coalesce(v_employment->'metadata', '{}'::jsonb)
    )
    on conflict (restaurant_id) do update set
      onss_employer_number = excluded.onss_employer_number,
      establishment_unit_number = excluded.establishment_unit_number,
      joint_committee_code = excluded.joint_committee_code,
      dimona_submission_mode = excluded.dimona_submission_mode,
      social_secretariat_name = excluded.social_secretariat_name,
      external_employer_id = excluded.external_employer_id,
      metadata = excluded.metadata,
      updated_at = now();
  end if;

  insert into public.restaurant_settings (
    restaurant_id, timezone, locale, currency_code, active_week_start,
    week_start_weekday, settings, payroll_settings
  ) values (
    p_restaurant_id, 'Europe/Brussels', 'fr-BE', 'EUR',
    nullif(p_settings->>'active_week_start', '')::date,
    1, coalesce(p_settings->'settings', '{}'::jsonb),
    coalesce(p_settings->'payroll_settings', '{}'::jsonb)
  )
  on conflict (restaurant_id) do update set
    timezone = 'Europe/Brussels', locale = 'fr-BE', currency_code = 'EUR',
    active_week_start = excluded.active_week_start,
    week_start_weekday = 1,
    settings = excluded.settings,
    payroll_settings = excluded.payroll_settings,
    updated_at = now();

  for v_item in select value from jsonb_array_elements(coalesce(p_job_functions, '[]')) loop
    v_id := (v_item->>'id')::uuid;
    v_name := nullif(btrim(v_item->>'name'), '');
    if v_id is null or v_name is null then raise exception 'Every position requires id and name.'; end if;
    insert into public.job_functions (
      id, restaurant_id, code, name, estimated_hourly_cost, active, sort_order, metadata
    ) values (
      v_id, p_restaurant_id,
      coalesce(nullif(btrim(v_item->>'code'), ''), public.slugify_workspace(v_name)),
      v_name,
      greatest(0, coalesce(nullif(v_item->>'estimated_hourly_cost', '')::numeric, 0)),
      coalesce((v_item->>'active')::boolean, true),
      coalesce(nullif(v_item->>'sort_order', '')::integer, 0),
      coalesce(v_item->'metadata', '{}')
    )
    on conflict (restaurant_id, id) do update set
      code = excluded.code, name = excluded.name,
      estimated_hourly_cost = excluded.estimated_hourly_cost,
      active = excluded.active, sort_order = excluded.sort_order,
      metadata = excluded.metadata, updated_at = now();
  end loop;
  update public.job_functions set active = false, updated_at = now()
  where restaurant_id = p_restaurant_id
    and id not in (select (value->>'id')::uuid from jsonb_array_elements(coalesce(p_job_functions, '[]')));

  for v_item in select value from jsonb_array_elements(coalesce(p_areas, '[]')) loop
    v_id := (v_item->>'id')::uuid;
    v_name := nullif(btrim(v_item->>'name'), '');
    if v_id is null or v_name is null then raise exception 'Every area requires id and name.'; end if;
    insert into public.work_areas (
      id, restaurant_id, code, name, notes, active, sort_order, metadata
    ) values (
      v_id, p_restaurant_id,
      coalesce(nullif(btrim(v_item->>'code'), ''), public.slugify_workspace(v_name)),
      v_name,
      nullif(btrim(v_item->>'notes'), ''),
      coalesce((v_item->>'active')::boolean, true),
      coalesce(nullif(v_item->>'sort_order', '')::integer, 0),
      coalesce(v_item->'metadata', '{}'::jsonb)
    )
    on conflict (restaurant_id, id) do update set
      code = excluded.code, name = excluded.name, notes = excluded.notes,
      active = excluded.active, sort_order = excluded.sort_order,
      metadata = excluded.metadata, updated_at = now();
  end loop;
  update public.work_areas set active = false, updated_at = now()
  where restaurant_id = p_restaurant_id
    and id not in (select (value->>'id')::uuid from jsonb_array_elements(coalesce(p_areas, '[]')));

  delete from public.opening_hours where restaurant_id = p_restaurant_id;
  insert into public.opening_hours (restaurant_id, weekday, service_key, is_open, opens_at, closes_at)
  select p_restaurant_id, (value->>'weekday')::smallint, value->>'service_key',
         coalesce((value->>'is_open')::boolean, false),
         nullif(value->>'opens_at', '')::time, nullif(value->>'closes_at', '')::time
  from jsonb_array_elements(coalesce(p_opening_hours, '[]'));

  delete from public.area_service_defaults where restaurant_id = p_restaurant_id;
  insert into public.area_service_defaults (restaurant_id, area_id, service_key, start_time, end_time)
  select p_restaurant_id, (value->>'area_id')::uuid, value->>'service_key',
         nullif(value->>'start_time', '')::time, nullif(value->>'end_time', '')::time
  from jsonb_array_elements(coalesce(p_area_service_defaults, '[]'));

  delete from public.coverage_requirements where restaurant_id = p_restaurant_id;
  insert into public.coverage_requirements (
    restaurant_id, area_id, job_function_id, service_key,
    coverage_scope, weekday, required_count, active, sort_order
  )
  select p_restaurant_id, (value->>'area_id')::uuid, (value->>'job_function_id')::uuid,
         value->>'service_key', 'weekday', (value->>'weekday')::smallint,
         greatest(0, coalesce(nullif(value->>'required_count', '')::integer, 0)),
         coalesce((value->>'active')::boolean, true),
         coalesce(nullif(value->>'sort_order', '')::integer, 0)
  from jsonb_array_elements(coalesce(p_coverage_requirements, '[]'));

  return jsonb_build_object('ok', true, 'restaurant_id', p_restaurant_id);
end
$function$;

create or replace function public.save_team_workspace(
  p_restaurant_id uuid,
  p_employees jsonb default '[]'::jsonb,
  p_employee_job_functions jsonb default '[]'::jsonb,
  p_recurring_schedule_slots jsonb default '[]'::jsonb,
  p_contacts jsonb default '[]'::jsonb,
  p_legal_profiles jsonb default '[]'::jsonb,
  p_contracts jsonb default '[]'::jsonb,
  p_payroll_profiles jsonb default '[]'::jsonb,
  p_access jsonb default '[]'::jsonb,
  p_employment_terms jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_item jsonb;
  v_employee_id uuid;
  v_contract_id uuid;
begin
  perform public.save_team_model(
    p_restaurant_id,
    p_employees,
    p_employee_job_functions,
    p_recurring_schedule_slots,
    p_contacts,
    p_legal_profiles,
    p_contracts,
    p_payroll_profiles,
    p_access
  );

  if jsonb_array_length(coalesce(p_employment_terms, '[]'::jsonb)) > 0 and not public.is_owner(p_restaurant_id) then
    raise exception 'Only an owner can change payroll employment terms.';
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_employment_terms, '[]'::jsonb)) loop
    v_employee_id := (v_item->>'employee_id')::uuid;
    select c.id into v_contract_id
    from public.employee_contracts c
    where c.restaurant_id = p_restaurant_id
      and c.employee_id = v_employee_id
      and c.active and c.is_current
    order by c.created_at desc
    limit 1;
    if v_contract_id is null then
      raise exception 'A current contract is required before employment terms can be saved.';
    end if;
    perform public.save_employee_employment_terms(
      p_restaurant_id,
      v_employee_id,
      jsonb_set(v_item - 'employee_id', '{contract_id}', to_jsonb(v_contract_id::text), true)
    );
  end loop;

  return jsonb_build_object(
    'ok', true,
    'restaurant_id', p_restaurant_id,
    'employment_terms_saved', jsonb_array_length(coalesce(p_employment_terms, '[]'::jsonb))
  );
end
$function$;

revoke all on function public.save_team_workspace(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.save_team_workspace(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
