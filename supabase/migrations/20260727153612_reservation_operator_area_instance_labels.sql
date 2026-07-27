-- Authenticated reservation workspaces must use the same physical-area label
-- contract as Restaurant, Team and the public booking channel. A single Bar
-- stays "Bar"; duplicate active Bar instances become "Bar (0.A)",
-- "Bar (+2.B)", and so on without changing the canonical work-area name.
begin;

create or replace function public.reservation_area_instance_label(
  p_restaurant_id uuid,
  p_area_id uuid,
  p_floor_id uuid
)
returns text
language sql
stable
security invoker
set search_path = public
as $function$
  select case
    when (
      select count(*)
      from public.work_areas duplicate
      where duplicate.restaurant_id = area.restaurant_id
        and duplicate.active
        and coalesce(
          nullif(duplicate.catalogue_key, ''),
          'custom:' || public.slugify_workspace(duplicate.name)
        ) = coalesce(
          nullif(area.catalogue_key, ''),
          'custom:' || public.slugify_workspace(area.name)
        )
    ) > 1
    then format(
      '%s (%s.%s)',
      area.name,
      case
        when coalesce(floor.level, area.floor_level, 0) > 0
          then '+' || coalesce(floor.level, area.floor_level, 0)::text
        else coalesce(floor.level, area.floor_level, 0)::text
      end,
      public.reservation_public_area_instance_letter(area.instance_number)
    )
    else area.name
  end
  from public.work_areas area
  left join public.reservation_floors floor
    on floor.restaurant_id = area.restaurant_id
   and floor.id = p_floor_id
  where area.restaurant_id = p_restaurant_id
    and area.id = p_area_id
$function$;

revoke all on function public.reservation_area_instance_label(uuid,uuid,uuid)
  from public, anon, authenticated, service_role;

do $operator_area_labels$
declare
  v_signature regprocedure;
  v_definition text;
  v_next text;
  v_old text := $old$
          'name', area.name,
$old$;
  v_new text := $new$
          'name', public.reservation_area_instance_label(
            room.restaurant_id,
            room.work_area_id,
            room.floor_id
          ),
$new$;
  v_legacy_identity text := $legacy$
          'area_color', area.metadata->>'color'
$legacy$;
  v_canonical_identity text := $canonical$
          'area_color', coalesce(area.color, area.metadata->>'color'),
          'area_icon', area.icon_key
$canonical$;
  v_current_identity text := $current$
          'area_color', coalesce(area.color, area.metadata->>'color')
$current$;
begin
  foreach v_signature in array array[
    'public.get_reservation_workspace(uuid,date)'::regprocedure,
    'public.get_reservation_setup(uuid)'::regprocedure
  ]
  loop
    select replace(pg_get_functiondef(v_signature), chr(13), '')
    into v_definition;

    v_next := replace(v_definition, v_old, v_new);
    v_next := replace(v_next, v_legacy_identity, v_canonical_identity);
    v_next := replace(v_next, v_current_identity, v_canonical_identity);
    if v_next = v_definition
      or position('reservation_area_instance_label' in v_next) = 0
      or position('coalesce(area.color' in v_next) = 0
      or position('area.icon_key' in v_next) = 0
    then
      raise exception 'Authenticated reservation area-label contract drifted for %.',
        v_signature;
    end if;
    execute v_next;
  end loop;
end
$operator_area_labels$;

-- CREATE OR REPLACE preserves the reviewed grants, but keep the boundary
-- explicit here so a future definition cannot accidentally become anonymous.
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
