-- A catalogue key describes an area type. Restaurants may have several
-- physical instances of that type, each with a stable ordinal that survives
-- floor moves, archiving and display-label changes.

begin;

alter table public.work_areas
  add column instance_number integer;

with ranked as (
  select
    id,
    row_number() over (
      partition by
        restaurant_id,
        coalesce(
          catalogue_key,
          'custom:' || public.slugify_workspace(name)
        )
      order by sort_order, created_at, id
    )::integer as instance_number
  from public.work_areas
)
update public.work_areas area
set instance_number = ranked.instance_number
from ranked
where ranked.id = area.id;

alter table public.work_areas
  alter column instance_number set not null,
  add constraint work_areas_instance_number_positive
    check (instance_number > 0);

create unique index work_areas_restaurant_type_instance_idx
  on public.work_areas (
    restaurant_id,
    coalesce(
      catalogue_key,
      'custom:' || public.slugify_workspace(name)
    ),
    instance_number
  );

create or replace function public.assign_work_area_instance_number()
returns trigger
language plpgsql
security invoker
set search_path = public
as $assign_work_area_instance_number$
declare
  v_lock_key text;
begin
  if tg_op = 'INSERT' and not exists (
    select 1
    from public.work_areas existing
    where existing.restaurant_id = new.restaurant_id
      and existing.id = new.id
  ) then
    -- The server owns ordinals for genuinely new instances. save_restaurant_model
    -- is an upsert, so an existing ID must keep the number supplied by its row.
    new.instance_number := null;
  elsif tg_op = 'UPDATE' and (
    new.restaurant_id is distinct from old.restaurant_id
    or new.catalogue_key is distinct from old.catalogue_key
    or (
      new.catalogue_key is null
      and old.catalogue_key is null
      and public.slugify_workspace(new.name)
        is distinct from public.slugify_workspace(old.name)
    )
  ) then
    new.instance_number := null;
  end if;

  if new.instance_number is not null then
    return new;
  end if;

  v_lock_key :=
    new.restaurant_id::text || ':' ||
    coalesce(
      new.catalogue_key,
      'custom:' || public.slugify_workspace(new.name)
    );
  perform pg_advisory_xact_lock(hashtextextended(v_lock_key, 0));

  select coalesce(max(area.instance_number), 0) + 1
  into new.instance_number
  from public.work_areas area
  where area.restaurant_id = new.restaurant_id
    and (
      area.catalogue_key = new.catalogue_key
      or (
        area.catalogue_key is null
        and new.catalogue_key is null
        and public.slugify_workspace(area.name)
          = public.slugify_workspace(new.name)
      )
    )
    and area.id <> new.id;

  return new;
end
$assign_work_area_instance_number$;

revoke all on function public.assign_work_area_instance_number()
  from public, anon, authenticated, service_role;

create trigger work_areas_assign_instance_number
  before insert or update of restaurant_id, catalogue_key, instance_number, name
  on public.work_areas
  for each row
  execute function public.assign_work_area_instance_number();

do $area_instance_write_model$
declare
  v_definition text;
  v_next text;
  v_old_area text := $old_area$
    insert into public.work_areas (
      id, restaurant_id, code, name, notes, active, sort_order,
      catalogue_key, color, icon_key, metadata
    ) values (
      v_id, p_restaurant_id,
      coalesce(nullif(btrim(v_item->>'code'), ''), public.slugify_workspace(v_name)),
      v_name,
      nullif(btrim(v_item->>'notes'), ''),
      coalesce((v_item->>'active')::boolean, true),
      coalesce(nullif(v_item->>'sort_order', '')::integer, 0),
      nullif(btrim(v_item->>'catalogue_key'), ''),
      nullif(btrim(v_item->>'color'), ''),
      nullif(btrim(v_item->>'icon_key'), ''),
      coalesce(v_item->'metadata', '{}'::jsonb)
    )
    on conflict (restaurant_id, id) do update set
      code = excluded.code, name = excluded.name, notes = excluded.notes,
      active = excluded.active, sort_order = excluded.sort_order,
      catalogue_key = excluded.catalogue_key,
      color = excluded.color,
      icon_key = excluded.icon_key,
      metadata = excluded.metadata, updated_at = now();
$old_area$;
  v_new_area text := $new_area$
    insert into public.work_areas (
      id, restaurant_id, code, name, notes, active, sort_order,
      catalogue_key, color, icon_key, instance_number, metadata
    ) values (
      v_id, p_restaurant_id,
      coalesce(nullif(btrim(v_item->>'code'), ''), public.slugify_workspace(v_name)),
      v_name,
      nullif(btrim(v_item->>'notes'), ''),
      coalesce((v_item->>'active')::boolean, true),
      coalesce(nullif(v_item->>'sort_order', '')::integer, 0),
      nullif(btrim(v_item->>'catalogue_key'), ''),
      nullif(btrim(v_item->>'color'), ''),
      nullif(btrim(v_item->>'icon_key'), ''),
      nullif(v_item->>'instance_number', '')::integer,
      coalesce(v_item->'metadata', '{}'::jsonb)
    )
    on conflict (restaurant_id, id) do update set
      code = excluded.code, name = excluded.name, notes = excluded.notes,
      active = excluded.active, sort_order = excluded.sort_order,
      catalogue_key = excluded.catalogue_key,
      color = excluded.color,
      icon_key = excluded.icon_key,
      instance_number = excluded.instance_number,
      metadata = excluded.metadata, updated_at = now();
$new_area$;
begin
  select replace(
    pg_get_functiondef(
      'public.save_restaurant_model(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure
    ),
    chr(13),
    ''
  )
  into v_definition;

  v_next := replace(v_definition, v_old_area, v_new_area);
  if v_next = v_definition
      or position('instance_number = excluded.instance_number' in v_next) = 0 then
    raise exception 'Restaurant area-instance write contract drifted.';
  end if;
  execute v_next;
end
$area_instance_write_model$;

notify pgrst, 'reload schema';

commit;
