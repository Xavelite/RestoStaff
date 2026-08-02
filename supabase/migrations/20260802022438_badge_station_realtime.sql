-- A paired station has no authenticated restaurant membership, so it cannot
-- call the public Realtime publisher used by signed-in clients. Publish the
-- actuals event inside the already-authorized station RPC instead.
begin;

create or replace function public._publish_badge_actuals_event(p_restaurant_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.workspace_realtime_events (
    restaurant_id,
    event,
    source,
    sequence,
    updated_at
  )
  values (p_restaurant_id, 'actuals-updated', 'badge', 1, now())
  on conflict (restaurant_id) do update set
    event = excluded.event,
    source = excluded.source,
    sequence = public.workspace_realtime_events.sequence + 1,
    updated_at = now();
$$;

revoke all on function public._publish_badge_actuals_event(uuid)
  from public, anon, authenticated;

create or replace function public.record_badge_entry_station_v2(
  p_token text,
  p_employee_id uuid,
  p_badge_token uuid,
  p_photo_url text default null,
  p_photo_status text default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_accuracy_meters double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $record_badge_entry_station_v2$
declare
  v_ctx record;
  v_result jsonb;
begin
  select * into v_ctx from public.resolve_station_token(p_token) limit 1;
  v_result := public._badge_record_core(
    v_ctx.restaurant_id, p_employee_id, p_badge_token, null, v_ctx.station_id,
    null, p_photo_url, p_photo_status
  );
  v_result := public._badge_apply_evidence(
    v_ctx.restaurant_id, v_result, p_photo_url, p_latitude, p_longitude, p_accuracy_meters
  );
  perform public._publish_badge_actuals_event(v_ctx.restaurant_id);
  return v_result;
end
$record_badge_entry_station_v2$;

create or replace function public.record_badge_entry_station(
  p_token text,
  p_employee_id uuid,
  p_badge_token uuid,
  p_photo_url text default null,
  p_photo_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $record_badge_entry_station_legacy$
declare
  v_ctx record;
  v_result jsonb;
begin
  select * into v_ctx from public.resolve_station_token(p_token) limit 1;
  v_result := public._badge_record_core(
    v_ctx.restaurant_id, p_employee_id, p_badge_token, null, v_ctx.station_id,
    null, p_photo_url, p_photo_status
  );
  v_result := public._badge_apply_evidence(
    v_ctx.restaurant_id, v_result, p_photo_url, null, null, null
  );
  perform public._publish_badge_actuals_event(v_ctx.restaurant_id);
  return v_result;
end
$record_badge_entry_station_legacy$;

commit;
