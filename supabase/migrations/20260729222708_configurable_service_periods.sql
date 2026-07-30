-- Configurable restaurant service periods.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';
select pg_advisory_xact_lock(
  hashtextextended('restogogo:20260729222708:configurable-services', 0)
);

alter table public.services
  add constraint services_key_format_check
  check (service_key ~ '^[a-z][a-z0-9-]{0,39}$') not valid;

alter table public.services validate constraint services_key_format_check;

create function public.save_restaurant_model_v3(
  p_restaurant_id uuid,
  p_expected_revision bigint,
  p_restaurant jsonb default '{}'::jsonb,
  p_settings jsonb default '{}'::jsonb,
  p_services jsonb default '[]'::jsonb,
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
as $save_restaurant$
declare
  v_current_revision bigint;
  v_next_revision bigint;
  v_result jsonb;
  v_actor uuid := public.current_profile_id();
  v_item jsonb;
  v_service_key text;
  v_active_count integer := 0;
begin
  perform public.require_restaurant_module(p_restaurant_id, 'restaurant');
  perform 1 from public.require_owner_or_manager_context(p_restaurant_id);

  if jsonb_typeof(coalesce(p_services, '[]'::jsonb)) <> 'array' then
    raise exception 'Service periods must be an array.' using errcode = '22023';
  end if;

  select count(*)::integer into v_active_count
  from jsonb_array_elements(coalesce(p_services, '[]'::jsonb)) item
  where coalesce((item->>'active')::boolean, true)
    and nullif(btrim(item->>'name'), '') is not null;

  if v_active_count < 1 then
    raise exception 'At least one active service period is required.'
      using errcode = '23514';
  end if;

  insert into public.restaurant_workspace_revisions (restaurant_id)
  values (p_restaurant_id)
  on conflict (restaurant_id) do nothing;

  select restaurant_revision into v_current_revision
  from public.restaurant_workspace_revisions
  where restaurant_id = p_restaurant_id
  for update;

  if p_expected_revision is distinct from v_current_revision then
    raise exception 'Restaurant setup changed in another session. Reload before saving again.'
      using errcode = '40001',
            detail = 'RESTAURANT_REVISION_CONFLICT',
            hint = 'Reload Restaurant to merge the latest changes.';
  end if;

  for v_item in
    select value
    from jsonb_array_elements(coalesce(p_services, '[]'::jsonb))
  loop
    v_service_key := lower(btrim(v_item->>'service_key'));
    if v_service_key !~ '^[a-z][a-z0-9-]{0,39}$' then
      raise exception 'Invalid service key: %', coalesce(v_service_key, '')
        using errcode = '22023';
    end if;
    if nullif(btrim(v_item->>'name'), '') is null then
      raise exception 'Every service period needs a name.' using errcode = '23502';
    end if;

    insert into public.services (
      restaurant_id, service_key, name, active, sort_order, metadata
    )
    values (
      p_restaurant_id,
      v_service_key,
      btrim(v_item->>'name'),
      coalesce((v_item->>'active')::boolean, true),
      coalesce(nullif(v_item->>'sort_order', '')::integer, 0),
      coalesce(v_item->'metadata', '{}'::jsonb)
    )
    on conflict (restaurant_id, service_key) do update set
      name = excluded.name,
      active = excluded.active,
      sort_order = excluded.sort_order,
      metadata = excluded.metadata,
      updated_at = now();
  end loop;

  update public.services service
  set active = false,
      updated_at = now()
  where service.restaurant_id = p_restaurant_id
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(p_services, '[]'::jsonb)) item
      where lower(btrim(item->>'service_key')) = service.service_key
    );

  select public.save_restaurant_model(
    p_restaurant_id,
    p_restaurant,
    p_settings,
    p_job_functions,
    p_areas,
    p_opening_hours,
    p_area_service_defaults,
    p_coverage_requirements
  ) into v_result;

  update public.restaurant_workspace_revisions
  set restaurant_revision = restaurant_revision + 1,
      updated_at = now()
  where restaurant_id = p_restaurant_id
  returning restaurant_revision into v_next_revision;

  insert into public.workspace_configuration_events (
    restaurant_id, module_key, revision, actor_profile_id, summary
  )
  values (
    p_restaurant_id,
    'restaurant',
    v_next_revision,
    v_actor,
    jsonb_build_object(
      'services', jsonb_array_length(coalesce(p_services, '[]'::jsonb)),
      'areas', jsonb_array_length(coalesce(p_areas, '[]'::jsonb)),
      'positions', jsonb_array_length(coalesce(p_job_functions, '[]'::jsonb)),
      'opening_hours', jsonb_array_length(coalesce(p_opening_hours, '[]'::jsonb)),
      'coverage_rules', jsonb_array_length(coalesce(p_coverage_requirements, '[]'::jsonb))
    )
  );

  return v_result || jsonb_build_object('workspace_revision', v_next_revision);
end
$save_restaurant$;

create function public.get_preview_bootstrap_v2(
  p_restaurant_id uuid,
  p_role text,
  p_employee_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $preview$
declare
  v_result jsonb;
begin
  v_result := public.get_preview_bootstrap(
    p_restaurant_id,
    p_role,
    p_employee_id
  );
  return v_result || jsonb_build_object(
    'module_entitlements',
    public.restaurant_module_entitlements_json(p_restaurant_id)
  );
end
$preview$;

create function public.admin_restaurant_module_entitlements()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $admin_entitlements$
begin
  perform public.require_platform_admin();
  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'restaurant_id', restaurant.id,
        'restaurant_name', restaurant.name,
        'modules', public.restaurant_module_entitlements_json(restaurant.id)
      )
      order by lower(restaurant.name)
    )
    from public.restaurants restaurant
  ), '[]'::jsonb);
end
$admin_entitlements$;

revoke all on function public.save_restaurant_model_v2(uuid,bigint,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)
  from authenticated;
revoke all on function public.save_restaurant_model_v3(uuid,bigint,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)
  from public, anon, authenticated;
revoke all on function public.get_preview_bootstrap_v2(uuid,text,uuid)
  from public, anon, authenticated;
revoke all on function public.admin_restaurant_module_entitlements()
  from public, anon, authenticated;

grant execute on function public.save_restaurant_model_v3(uuid,bigint,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)
  to authenticated, service_role;
grant execute on function public.get_preview_bootstrap_v2(uuid,text,uuid)
  to authenticated;
grant execute on function public.admin_restaurant_module_entitlements()
  to authenticated;

notify pgrst, 'reload schema';
commit;
