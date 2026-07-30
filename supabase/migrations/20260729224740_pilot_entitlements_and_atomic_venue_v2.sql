begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';
select pg_advisory_xact_lock(
  hashtextextended('restogogo:20260729224740:pilot-entitlements-venue-v2', 0)
);

create function public.save_venue_model_v2(
  p_restaurant_id uuid,
  p_expected_workspace_revision bigint,
  p_restaurant jsonb,
  p_settings jsonb,
  p_services jsonb,
  p_job_functions jsonb,
  p_areas jsonb,
  p_opening_hours jsonb,
  p_area_service_defaults jsonb,
  p_coverage_requirements jsonb,
  p_floors jsonb,
  p_rooms jsonb,
  p_tables jsonb,
  p_combinations jsonb default '[]'::jsonb,
  p_expected_floor_revision integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $save_venue$
declare
  v_restaurant_result jsonb;
  v_floor_result jsonb;
begin
  perform public.require_restaurant_module(p_restaurant_id, 'restaurant');

  v_restaurant_result := public.save_restaurant_model_v3(
    p_restaurant_id,
    p_expected_workspace_revision,
    p_restaurant,
    p_settings,
    p_services,
    p_job_functions,
    p_areas,
    p_opening_hours,
    p_area_service_defaults,
    p_coverage_requirements
  );

  v_floor_result := public.save_reservation_floor_plans(
    p_restaurant_id,
    p_floors,
    p_rooms,
    p_tables,
    p_combinations,
    p_expected_floor_revision
  );

  return v_restaurant_result
    || jsonb_build_object(
      'floor_plan_revision',
      v_floor_result->'revision',
      'venue_saved',
      true
    );
end
$save_venue$;

create function public.get_reservation_workspace_v2(
  p_restaurant_id uuid,
  p_business_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $reservation_workspace$
begin
  perform public.require_restaurant_module(p_restaurant_id, 'reservations');
  return public.get_reservation_workspace(p_restaurant_id, p_business_date);
end
$reservation_workspace$;

create function public.get_reservation_setup_v2(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $reservation_setup$
begin
  perform public.require_restaurant_module(p_restaurant_id, 'reservations');
  return public.get_reservation_setup(p_restaurant_id);
end
$reservation_setup$;

create function public.save_reservation_setup_v2(
  p_restaurant_id uuid,
  p_services jsonb,
  p_rooms jsonb,
  p_tables jsonb,
  p_combinations jsonb default '[]'::jsonb,
  p_exceptions jsonb default '[]'::jsonb,
  p_expected_revision integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $save_reservation_setup$
begin
  perform public.require_restaurant_module(p_restaurant_id, 'reservations');
  return public.save_reservation_setup(
    p_restaurant_id,
    p_services,
    p_rooms,
    p_tables,
    p_combinations,
    p_exceptions,
    p_expected_revision
  );
end
$save_reservation_setup$;

create function public.check_reservation_availability_v2(
  p_restaurant_id uuid,
  p_business_date date,
  p_service_key text,
  p_local_time time,
  p_party_size integer,
  p_room_id uuid default null,
  p_exclude_reservation_id uuid default null,
  p_preferred_table_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $reservation_availability$
begin
  perform public.require_restaurant_module(p_restaurant_id, 'reservations');
  return public.check_reservation_availability(
    p_restaurant_id,
    p_business_date,
    p_service_key,
    p_local_time,
    p_party_size,
    p_room_id,
    p_exclude_reservation_id,
    p_preferred_table_id
  );
end
$reservation_availability$;

create function public.save_reservation_v2(
  p_restaurant_id uuid,
  p_reservation jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $save_reservation$
begin
  perform public.require_restaurant_module(p_restaurant_id, 'reservations');
  return public.save_reservation(p_restaurant_id, p_reservation);
end
$save_reservation$;

create function public.set_reservation_status_v2(
  p_restaurant_id uuid,
  p_reservation_id uuid,
  p_status text,
  p_comment text default null,
  p_expected_revision integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $reservation_status$
begin
  perform public.require_restaurant_module(p_restaurant_id, 'reservations');
  return public.set_reservation_status(
    p_restaurant_id,
    p_reservation_id,
    p_status,
    p_comment,
    p_expected_revision
  );
end
$reservation_status$;

create function public.get_reservation_demand_v2(
  p_restaurant_id uuid,
  p_from_date date,
  p_to_date date
)
returns table (
  business_date date,
  service_key text,
  reservation_count bigint,
  expected_covers bigint,
  first_arrival time,
  last_arrival time
)
language plpgsql
stable
security definer
set search_path = public
as $reservation_demand$
begin
  perform public.require_restaurant_module(p_restaurant_id, 'reservations');
  return query
  select *
  from public.get_reservation_demand(
    p_restaurant_id,
    p_from_date,
    p_to_date
  );
end
$reservation_demand$;

create function public.get_reservation_public_channel_v2(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $public_channel$
begin
  perform public.require_restaurant_module(p_restaurant_id, 'reservations');
  return public.get_reservation_public_channel(p_restaurant_id);
end
$public_channel$;

create function public.ensure_reservation_public_channel_v2(
  p_restaurant_id uuid,
  p_default_origin text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $public_channel$
begin
  perform public.require_restaurant_module(p_restaurant_id, 'reservations');
  return public.ensure_reservation_public_channel(
    p_restaurant_id,
    p_default_origin
  );
end
$public_channel$;

create function public.save_reservation_public_channel_v2(
  p_restaurant_id uuid,
  p_enabled boolean,
  p_allowed_origins text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $public_channel$
begin
  perform public.require_restaurant_module(p_restaurant_id, 'reservations');
  return public.save_reservation_public_channel(
    p_restaurant_id,
    p_enabled,
    p_allowed_origins
  );
end
$public_channel$;

create function public.rotate_reservation_public_channel_v2(p_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $public_channel$
begin
  perform public.require_restaurant_module(p_restaurant_id, 'reservations');
  return public.rotate_reservation_public_channel(p_restaurant_id);
end
$public_channel$;

create function public.assert_reservation_public_module(
  p_public_key text,
  p_origin text
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $public_module$
declare
  v_restaurant_id uuid;
begin
  select channel.restaurant_id
  into v_restaurant_id
  from public.reservation_public_channel_context(p_public_key, p_origin) channel
  limit 1;

  if v_restaurant_id is null then
    raise exception 'PUBLIC_CHANNEL_UNAVAILABLE';
  end if;

  if not public.restaurant_module_enabled(v_restaurant_id, 'reservations') then
    raise exception 'PUBLIC_CHANNEL_UNAVAILABLE';
  end if;
end
$public_module$;

revoke all on function public.save_venue_model(
  uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,integer
) from authenticated;

revoke all on function public.get_reservation_workspace(uuid,date)
  from authenticated;
revoke all on function public.get_reservation_setup(uuid)
  from authenticated;
revoke all on function public.save_reservation_setup(
  uuid,jsonb,jsonb,jsonb,jsonb,jsonb,integer
) from authenticated;
revoke all on function public.check_reservation_availability(
  uuid,date,text,time,integer,uuid,uuid,uuid
) from authenticated;
revoke all on function public.save_reservation(uuid,jsonb)
  from authenticated;
revoke all on function public.set_reservation_status(
  uuid,uuid,text,text,integer
) from authenticated;
revoke all on function public.get_reservation_demand(uuid,date,date)
  from authenticated;
revoke all on function public.get_reservation_public_channel(uuid)
  from authenticated;
revoke all on function public.ensure_reservation_public_channel(uuid,text)
  from authenticated;
revoke all on function public.save_reservation_public_channel(uuid,boolean,text[])
  from authenticated;
revoke all on function public.rotate_reservation_public_channel(uuid)
  from authenticated;

revoke all on function public.save_venue_model_v2(
  uuid,bigint,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,integer
) from public, anon, authenticated;
revoke all on function public.get_reservation_workspace_v2(uuid,date)
  from public, anon, authenticated;
revoke all on function public.get_reservation_setup_v2(uuid)
  from public, anon, authenticated;
revoke all on function public.save_reservation_setup_v2(
  uuid,jsonb,jsonb,jsonb,jsonb,jsonb,integer
) from public, anon, authenticated;
revoke all on function public.check_reservation_availability_v2(
  uuid,date,text,time,integer,uuid,uuid,uuid
) from public, anon, authenticated;
revoke all on function public.save_reservation_v2(uuid,jsonb)
  from public, anon, authenticated;
revoke all on function public.set_reservation_status_v2(
  uuid,uuid,text,text,integer
) from public, anon, authenticated;
revoke all on function public.get_reservation_demand_v2(uuid,date,date)
  from public, anon, authenticated;
revoke all on function public.get_reservation_public_channel_v2(uuid)
  from public, anon, authenticated;
revoke all on function public.ensure_reservation_public_channel_v2(uuid,text)
  from public, anon, authenticated;
revoke all on function public.save_reservation_public_channel_v2(uuid,boolean,text[])
  from public, anon, authenticated;
revoke all on function public.rotate_reservation_public_channel_v2(uuid)
  from public, anon, authenticated;
revoke all on function public.assert_reservation_public_module(text,text)
  from public, anon, authenticated;

grant execute on function public.save_venue_model_v2(
  uuid,bigint,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,integer
) to authenticated, service_role;
grant execute on function public.get_reservation_workspace_v2(uuid,date)
  to authenticated;
grant execute on function public.get_reservation_setup_v2(uuid)
  to authenticated;
grant execute on function public.save_reservation_setup_v2(
  uuid,jsonb,jsonb,jsonb,jsonb,jsonb,integer
) to authenticated;
grant execute on function public.check_reservation_availability_v2(
  uuid,date,text,time,integer,uuid,uuid,uuid
) to authenticated;
grant execute on function public.save_reservation_v2(uuid,jsonb)
  to authenticated;
grant execute on function public.set_reservation_status_v2(
  uuid,uuid,text,text,integer
) to authenticated;
grant execute on function public.get_reservation_demand_v2(uuid,date,date)
  to authenticated;
grant execute on function public.get_reservation_public_channel_v2(uuid)
  to authenticated;
grant execute on function public.ensure_reservation_public_channel_v2(uuid,text)
  to authenticated;
grant execute on function public.save_reservation_public_channel_v2(uuid,boolean,text[])
  to authenticated;
grant execute on function public.rotate_reservation_public_channel_v2(uuid)
  to authenticated;
grant execute on function public.assert_reservation_public_module(text,text)
  to service_role;

comment on function public.save_venue_model_v2(
  uuid,bigint,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,integer
) is
  'Atomically saves Restaurant setup and its floor plan with independent optimistic revisions.';
comment on function public.assert_reservation_public_module(text,text) is
  'Service-role gate that keeps the public reservation channel aligned with pilot module entitlements.';

notify pgrst, 'reload schema';
commit;
