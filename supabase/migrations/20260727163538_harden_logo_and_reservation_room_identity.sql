-- Forward-only corrections for two operator contracts:
-- 1. logo metadata must remain scoped to the restaurant represented by the
--    authenticated owner/manager context;
-- 2. reservation room JSON must expose one canonical area_icon key.
begin;

create or replace function public.set_restaurant_logo(
  p_restaurant_id uuid,
  p_logo_path text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_logo_path text := nullif(btrim(coalesce(p_logo_path, '')), '');
begin
  perform 1
  from public.require_owner_or_manager_context(p_restaurant_id);

  if v_logo_path is not null
      and v_logo_path not like p_restaurant_id::text || '/%' then
    raise exception 'Restaurant logo path does not belong to this restaurant.';
  end if;

  update public.restaurants
     set logo_path = v_logo_path,
         updated_at = now()
   where id = p_restaurant_id;

  if not found then
    raise exception 'Restaurant not found.';
  end if;

  return jsonb_build_object('ok', true);
end
$function$;

revoke all on function public.set_restaurant_logo(uuid, text)
  from public, anon, service_role;
grant execute on function public.set_restaurant_logo(uuid, text)
  to authenticated;

do $deduplicate_reservation_room_identity$
declare
  v_signature regprocedure;
  v_definition text;
  v_next text;
  v_area_icon_pair text := $pair$'area_icon', area.icon_key$pair$;
  v_area_icon_count integer;
  v_duplicate_identity text := $duplicate$
          'area_color', coalesce(area.color, area.metadata->>'color'),
          'area_icon', area.icon_key,
          'area_icon', area.icon_key
$duplicate$;
  v_canonical_identity text := $canonical$
          'area_color', coalesce(area.color, area.metadata->>'color'),
          'area_icon', area.icon_key
$canonical$;
begin
  foreach v_signature in array array[
    'public.get_reservation_workspace(uuid,date)'::regprocedure,
    'public.get_reservation_setup(uuid)'::regprocedure
  ]
  loop
    select replace(pg_get_functiondef(v_signature), chr(13), '')
    into v_definition;

    -- Applied migration 20260727153612 matched the canonical area_color
    -- fragment after introducing area_icon, which inserted the same JSON key
    -- twice. Replace only that exact duplicate block. Already-clean schemas
    -- remain unchanged, while any other definition drift fails closed.
    v_next := replace(
      v_definition,
      v_duplicate_identity,
      v_canonical_identity
    );

    v_area_icon_count := (
      length(v_next) - length(replace(v_next, v_area_icon_pair, ''))
    ) / length(v_area_icon_pair);

    if position(v_duplicate_identity in v_next) > 0
      or position('reservation_area_instance_label' in v_next) = 0
      or position(v_canonical_identity in v_next) = 0
      or v_area_icon_count <> 1
    then
      raise exception 'Authenticated reservation room identity contract drifted for %.',
        v_signature;
    end if;

    if v_next <> v_definition then
      execute v_next;
    end if;
  end loop;
end
$deduplicate_reservation_room_identity$;

revoke all on function public.get_reservation_workspace(uuid,date)
  from public, anon;
revoke all on function public.get_reservation_setup(uuid)
  from public, anon;
grant execute on function public.get_reservation_workspace(uuid,date)
  to authenticated;
grant execute on function public.get_reservation_setup(uuid)
  to authenticated;

notify pgrst, 'reload schema';

commit;
