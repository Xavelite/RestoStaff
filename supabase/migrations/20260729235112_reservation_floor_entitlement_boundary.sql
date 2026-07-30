begin;

create function public.get_reservation_floor_plans_v2(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $reservation_floors$
begin
  perform public.require_restaurant_module(p_restaurant_id, 'reservations');
  return public.get_reservation_floor_plans(p_restaurant_id);
end
$reservation_floors$;

create function public.save_reservation_floor_plans_v2(
  p_restaurant_id uuid,
  p_floors jsonb,
  p_rooms jsonb,
  p_tables jsonb,
  p_combinations jsonb,
  p_expected_revision integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $reservation_floors$
begin
  perform public.require_restaurant_module(p_restaurant_id, 'reservations');
  return public.save_reservation_floor_plans(
    p_restaurant_id,
    p_floors,
    p_rooms,
    p_tables,
    p_combinations,
    p_expected_revision
  );
end
$reservation_floors$;

revoke all on function public.get_reservation_floor_plans(uuid)
  from authenticated;
revoke all on function public.save_reservation_floor_plans(
  uuid,jsonb,jsonb,jsonb,jsonb,integer
) from authenticated;

revoke all on function public.get_reservation_floor_plans_v2(uuid)
  from public, anon, authenticated;
revoke all on function public.save_reservation_floor_plans_v2(
  uuid,jsonb,jsonb,jsonb,jsonb,integer
) from public, anon, authenticated;

grant execute on function public.get_reservation_floor_plans_v2(uuid)
  to authenticated;
grant execute on function public.save_reservation_floor_plans_v2(
  uuid,jsonb,jsonb,jsonb,jsonb,integer
) to authenticated;

comment on function public.get_reservation_floor_plans_v2(uuid) is
  'Entitlement-gated reservation floor-plan read model.';
comment on function public.save_reservation_floor_plans_v2(
  uuid,jsonb,jsonb,jsonb,jsonb,integer
) is
  'Entitlement-gated reservation floor-plan mutation.';

notify pgrst, 'reload schema';
commit;
