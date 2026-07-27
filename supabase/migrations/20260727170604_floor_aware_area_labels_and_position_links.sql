-- Physical area locators are floor-aware, while position-to-area links are a
-- canonical many-to-many set. The legacy "primary area" bit remains derived
-- for one compatibility cycle, but is no longer an authored domain choice.
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
  with target as (
    select
      area.id,
      area.name,
      coalesce(
        nullif(area.catalogue_key, ''),
        'custom:' || public.slugify_workspace(area.name)
      ) as type_key,
      coalesce(floor.level, area.floor_level, 0)::integer as floor_level
    from public.work_areas area
    left join public.reservation_floors floor
      on floor.restaurant_id = area.restaurant_id
     and floor.id = p_floor_id
    where area.restaurant_id = p_restaurant_id
      and area.id = p_area_id
  ),
  same_type as (
    select
      duplicate.id,
      duplicate.instance_number,
      coalesce(duplicate.floor_level, 0)::integer as floor_level
    from public.work_areas duplicate
    cross join target
    where duplicate.restaurant_id = p_restaurant_id
      and duplicate.active
      and coalesce(
        nullif(duplicate.catalogue_key, ''),
        'custom:' || public.slugify_workspace(duplicate.name)
      ) = target.type_key
  ),
  floor_peers as (
    select
      peer.id,
      row_number() over (
        order by peer.instance_number, peer.id
      )::integer as floor_rank,
      count(*) over ()::integer as floor_count
    from same_type peer
    cross join target
    where peer.floor_level = target.floor_level
  )
  select case
    when (select count(*) from same_type) <= 1
      then target.name
    when coalesce(current_peer.floor_count, 1) <= 1
      then format(
        '%s (%s)',
        target.name,
        case
          when target.floor_level > 0 then '+' || target.floor_level::text
          else target.floor_level::text
        end
      )
    else format(
      '%s (%s.%s)',
      target.name,
      case
        when target.floor_level > 0 then '+' || target.floor_level::text
        else target.floor_level::text
      end,
      public.reservation_public_area_instance_letter(
        coalesce(current_peer.floor_rank, 1)
      )
    )
  end
  from target
  left join floor_peers current_peer
    on current_peer.id = target.id
$function$;

revoke all on function public.reservation_area_instance_label(uuid,uuid,uuid)
  from public, anon, authenticated, service_role;

-- The public booking context previously carried a second, global instance
-- algorithm. Route it through the same reviewed helper used by operators.
do $floor_aware_public_area_labels$
declare
  v_definition text;
  v_next text;
  v_old text := $old$
          'name', case
            when (
              select count(*)
              from public.work_areas duplicate
              where duplicate.restaurant_id = area.restaurant_id
                and duplicate.active
                and coalesce(
                  duplicate.catalogue_key,
                  'custom:' || public.slugify_workspace(duplicate.name)
                ) = coalesce(
                  area.catalogue_key,
                  'custom:' || public.slugify_workspace(area.name)
                )
            ) > 1
            then format(
              '%s (%s.%s)',
              area.name,
              case
                when coalesce(floor.level, 0) > 0
                  then '+' || floor.level::text
                else coalesce(floor.level, 0)::text
              end,
              public.reservation_public_area_instance_letter(
                area.instance_number
              )
            )
            else area.name
          end
$old$;
  v_new text := $new$
          'name', public.reservation_area_instance_label(
            room.restaurant_id,
            room.work_area_id,
            room.floor_id
          )
$new$;
begin
  select replace(
    pg_get_functiondef(
      'public.reservation_public_context(text,text)'::regprocedure
    ),
    chr(13),
    ''
  )
  into v_definition;

  v_next := replace(v_definition, v_old, v_new);
  if v_next = v_definition
      or position('reservation_area_instance_label' in v_next) = 0 then
    raise exception 'Public reservation floor-aware label contract drifted.';
  end if;
  execute v_next;
end
$floor_aware_public_area_labels$;

-- Employee preferred areas must be evaluated against the final link set, not
-- an intermediate row while a multi-link position is being synchronized.
drop trigger if exists job_function_areas_clear_employee_defaults
  on public.job_function_areas;
create constraint trigger job_function_areas_clear_employee_defaults
  after update or delete
  on public.job_function_areas
  deferrable initially deferred
  for each row execute function public.clear_invalid_employee_position_defaults();

-- Preserve any last legacy-only relationship before removing duplicated JSON.
with legacy_links as (
  select
    job.restaurant_id,
    job.id as job_function_id,
    relation.area_id::uuid as area_id
  from public.job_functions job
  cross join lateral jsonb_array_elements_text(
    case
      when jsonb_typeof(job.metadata->'area_ids') = 'array'
        then job.metadata->'area_ids'
      when nullif(job.metadata->>'area_id', '') is not null
        then jsonb_build_array(job.metadata->>'area_id')
      else '[]'::jsonb
    end
  ) relation(area_id)
  join public.work_areas area
    on area.restaurant_id = job.restaurant_id
   and area.id = relation.area_id::uuid
)
insert into public.job_function_areas (
  restaurant_id, job_function_id, area_id, is_primary, active
)
select distinct
  legacy.restaurant_id,
  legacy.job_function_id,
  legacy.area_id,
  false,
  true
from legacy_links legacy
on conflict (restaurant_id, job_function_id, area_id) do update set
  active = true,
  updated_at = now();

update public.job_functions
set metadata = metadata - 'area_id' - 'area_ids',
    updated_at = now()
where metadata ? 'area_id'
   or metadata ? 'area_ids';

-- Patch the existing, access-reviewed write function in place. Managers retain
-- their financial restrictions; only metadata persistence and relation sync
-- change here.
do $canonical_position_area_links$
declare
  v_definition text;
  v_next text;
  v_old_metadata text := $old_metadata$
      coalesce(v_item->'metadata', '{}')
$old_metadata$;
  v_new_metadata text := $new_metadata$
      coalesce(v_item->'metadata', '{}') - 'area_id' - 'area_ids'
$new_metadata$;
  v_old_relations text := $old_relations$
  delete from public.job_function_areas
  where restaurant_id = p_restaurant_id;

  insert into public.job_function_areas (
    restaurant_id, job_function_id, area_id, is_primary, active
  )
  select
    p_restaurant_id,
    (position.value->>'id')::uuid,
    relation.area_id::uuid,
    (
      nullif(position.value->'metadata'->>'area_id', '') is not null
      and relation.area_id = position.value->'metadata'->>'area_id'
    )
    or (
      nullif(position.value->'metadata'->>'area_id', '') is null
      and relation.ordinality = 1
    ),
    true
  from jsonb_array_elements(coalesce(p_job_functions, '[]'::jsonb)) position(value)
  cross join lateral jsonb_array_elements_text(
    case
      when jsonb_typeof(position.value->'metadata'->'area_ids') = 'array'
        then position.value->'metadata'->'area_ids'
      when nullif(position.value->'metadata'->>'area_id', '') is not null
        then jsonb_build_array(position.value->'metadata'->>'area_id')
      else '[]'::jsonb
    end
  ) with ordinality relation(area_id, ordinality)
  join public.job_functions job
    on job.restaurant_id = p_restaurant_id
   and job.id = (position.value->>'id')::uuid
  join public.work_areas area
    on area.restaurant_id = p_restaurant_id
   and area.id = relation.area_id::uuid
  on conflict (restaurant_id, job_function_id, area_id) do update set
    is_primary = excluded.is_primary,
    active = true,
    updated_at = now();
$old_relations$;
  v_new_relations text := $new_relations$
  -- is_primary is derived compatibility only. Clear it before selecting the
  -- first valid link so changing link order cannot hit the partial index.
  update public.job_function_areas relation
  set is_primary = false,
      updated_at = now()
  where relation.restaurant_id = p_restaurant_id
    and relation.is_primary
    and relation.job_function_id in (
      select (position.value->>'id')::uuid
      from jsonb_array_elements(
        coalesce(p_job_functions, '[]'::jsonb)
      ) position(value)
    );

  with desired_raw as (
    select
      (position.value->>'id')::uuid as job_function_id,
      relation.area_id::uuid as area_id,
      relation.ordinality
    from jsonb_array_elements(
      coalesce(p_job_functions, '[]'::jsonb)
    ) position(value)
    cross join lateral jsonb_array_elements_text(
      case
        when jsonb_typeof(position.value->'area_ids') = 'array'
          then position.value->'area_ids'
        when jsonb_typeof(position.value->'metadata'->'area_ids') = 'array'
          then position.value->'metadata'->'area_ids'
        when nullif(position.value->'metadata'->>'area_id', '') is not null
          then jsonb_build_array(position.value->'metadata'->>'area_id')
        else '[]'::jsonb
      end
    ) with ordinality relation(area_id, ordinality)
    join public.job_functions job
      on job.restaurant_id = p_restaurant_id
     and job.id = (position.value->>'id')::uuid
    join public.work_areas area
      on area.restaurant_id = p_restaurant_id
     and area.id = relation.area_id::uuid
     and area.active
  ),
  desired_distinct as (
    select
      desired.job_function_id,
      desired.area_id,
      min(desired.ordinality) as ordinality
    from desired_raw desired
    group by desired.job_function_id, desired.area_id
  ),
  desired_links as (
    select
      desired.job_function_id,
      desired.area_id,
      row_number() over (
        partition by desired.job_function_id
        order by desired.ordinality, desired.area_id
      ) = 1 as is_primary
    from desired_distinct desired
  )
  insert into public.job_function_areas (
    restaurant_id, job_function_id, area_id, is_primary, active
  )
  select
    p_restaurant_id,
    desired.job_function_id,
    desired.area_id,
    desired.is_primary,
    true
  from desired_links desired
  on conflict (restaurant_id, job_function_id, area_id) do update set
    is_primary = excluded.is_primary,
    active = true,
    updated_at = now();

  with desired_links as (
    select distinct
      (position.value->>'id')::uuid as job_function_id,
      relation.area_id::uuid as area_id
    from jsonb_array_elements(
      coalesce(p_job_functions, '[]'::jsonb)
    ) position(value)
    cross join lateral jsonb_array_elements_text(
      case
        when jsonb_typeof(position.value->'area_ids') = 'array'
          then position.value->'area_ids'
        when jsonb_typeof(position.value->'metadata'->'area_ids') = 'array'
          then position.value->'metadata'->'area_ids'
        when nullif(position.value->'metadata'->>'area_id', '') is not null
          then jsonb_build_array(position.value->'metadata'->>'area_id')
        else '[]'::jsonb
      end
    ) relation(area_id)
    join public.job_functions job
      on job.restaurant_id = p_restaurant_id
     and job.id = (position.value->>'id')::uuid
    join public.work_areas area
      on area.restaurant_id = p_restaurant_id
     and area.id = relation.area_id::uuid
     and area.active
  )
  update public.job_function_areas relation
  set active = false,
      is_primary = false,
      updated_at = now()
  where relation.restaurant_id = p_restaurant_id
    and relation.active
    and not exists (
      select 1
      from desired_links desired
      where desired.job_function_id = relation.job_function_id
        and desired.area_id = relation.area_id
    );
$new_relations$;
begin
  select replace(
    pg_get_functiondef(
      'public.save_restaurant_model(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure
    ),
    chr(13),
    ''
  )
  into v_definition;

  v_next := replace(v_definition, v_old_metadata, v_new_metadata);
  v_next := replace(v_next, v_old_relations, v_new_relations);
  if v_next = v_definition
      or position('position.value->''area_ids''' in v_next) = 0
      or position('desired_links' in v_next) = 0
      or position('delete from public.job_function_areas' in v_next) > 0
      or position('metadata'', ''{}'') - ''area_id'' - ''area_ids''' in v_next) = 0 then
    raise exception 'Canonical position-area write contract drifted.';
  end if;
  execute v_next;
end
$canonical_position_area_links$;

-- The helper is intentionally private; operator and public read functions call
-- it through their own reviewed privilege boundaries.
revoke all on function public.reservation_public_context(text,text)
  from public, anon, authenticated;
grant execute on function public.reservation_public_context(text,text)
  to service_role;

notify pgrst, 'reload schema';

commit;
