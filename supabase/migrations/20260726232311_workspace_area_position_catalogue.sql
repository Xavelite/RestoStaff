-- Stable catalogue identity and normalized position-to-area ownership.
-- Catalogue definitions live in product code; restaurants persist the stable
-- key plus their editable label. A null key is an intentional custom item.

begin;

alter table public.work_areas
  add column catalogue_key text,
  add column color text,
  add column icon_key text;

alter table public.work_areas
  add constraint work_areas_catalogue_key_format
    check (catalogue_key is null or catalogue_key ~ '^[a-z][a-z0-9_]*$'),
  add constraint work_areas_color_format
    check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint work_areas_icon_key_format
    check (icon_key is null or icon_key ~ '^[a-z][a-z0-9-]*$');

alter table public.job_functions
  add column catalogue_key text,
  add column icon_key text;

alter table public.job_functions
  add constraint job_functions_catalogue_key_format
    check (catalogue_key is null or catalogue_key ~ '^[a-z][a-z0-9_]*$'),
  add constraint job_functions_icon_key_format
    check (icon_key is null or icon_key ~ '^[a-z][a-z0-9-]*$');

update public.work_areas
set catalogue_key = nullif(metadata->>'catalogue_key', ''),
  color = nullif(metadata->>'color', ''),
  icon_key = nullif(metadata->>'icon_key', '')
where metadata <> '{}'::jsonb;

update public.job_functions
set catalogue_key = nullif(metadata->>'catalogue_key', ''),
  icon_key = nullif(metadata->>'icon_key', '')
where metadata <> '{}'::jsonb;

create table public.job_function_areas (
  restaurant_id uuid not null,
  job_function_id uuid not null,
  area_id uuid not null,
  is_primary boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (restaurant_id, job_function_id, area_id),
  constraint job_function_areas_job_function_fk
    foreign key (restaurant_id, job_function_id)
    references public.job_functions(restaurant_id, id)
    on delete cascade,
  constraint job_function_areas_area_fk
    foreign key (restaurant_id, area_id)
    references public.work_areas(restaurant_id, id)
    on delete cascade
);

create index job_function_areas_restaurant_area_idx
  on public.job_function_areas (restaurant_id, area_id, active);

create unique index job_function_areas_one_primary_idx
  on public.job_function_areas (restaurant_id, job_function_id)
  where active and is_primary;

alter table public.job_function_areas enable row level security;
revoke all on table public.job_function_areas
  from public, anon, authenticated;
grant all on table public.job_function_areas to service_role;

with legacy_links as (
  select
    job.restaurant_id,
    job.id as job_function_id,
    link.area_id::uuid as area_id,
    link.ordinality,
    nullif(job.metadata->>'area_id', '')::uuid as legacy_primary_area_id
  from public.job_functions job
  cross join lateral jsonb_array_elements_text(
    case
      when jsonb_typeof(job.metadata->'area_ids') = 'array'
        then job.metadata->'area_ids'
      when nullif(job.metadata->>'area_id', '') is not null
        then jsonb_build_array(job.metadata->>'area_id')
      else '[]'::jsonb
    end
  ) with ordinality as link(area_id, ordinality)
)
insert into public.job_function_areas (
  restaurant_id, job_function_id, area_id, is_primary
)
select
  legacy.restaurant_id,
  legacy.job_function_id,
  legacy.area_id,
  (
    legacy.legacy_primary_area_id is not null
    and legacy.area_id = legacy.legacy_primary_area_id
  )
  or (
    legacy.legacy_primary_area_id is null
    and legacy.ordinality = 1
  )
from legacy_links legacy
join public.work_areas area
  on area.restaurant_id = legacy.restaurant_id
 and area.id = legacy.area_id
on conflict (restaurant_id, job_function_id, area_id) do nothing;

do $catalogue_restaurant_read_model$
declare
  v_definition text;
  v_next text;
  v_old text := $old$
    'job_functions', coalesce((select jsonb_agg(to_jsonb(j) order by j.sort_order, j.name) from public.job_functions j where j.restaurant_id = r.id), '[]'::jsonb),
    'work_areas', coalesce((select jsonb_agg(to_jsonb(a) order by a.sort_order, a.name) from public.work_areas a where a.restaurant_id = r.id), '[]'::jsonb),
$old$;
  v_new text := $new$
    'job_functions', coalesce((select jsonb_agg(to_jsonb(j) order by j.sort_order, j.name) from public.job_functions j where j.restaurant_id = r.id), '[]'::jsonb),
    'job_function_areas', coalesce((select jsonb_agg(to_jsonb(link) order by link.job_function_id, link.is_primary desc, link.area_id) from public.job_function_areas link where link.restaurant_id = r.id), '[]'::jsonb),
    'work_areas', coalesce((select jsonb_agg(to_jsonb(a) order by a.sort_order, a.name) from public.work_areas a where a.restaurant_id = r.id), '[]'::jsonb),
$new$;
begin
  select replace(
    pg_get_functiondef('public.build_restaurant_read_model(uuid)'::regprocedure),
    chr(13),
    ''
  )
  into v_definition;

  v_next := replace(v_definition, v_old, v_new);
  if v_next = v_definition then
    raise exception 'Restaurant read-model catalogue contract drifted.';
  end if;
  execute v_next;
end
$catalogue_restaurant_read_model$;

do $catalogue_reservation_area_color$
declare
  v_signature regprocedure;
  v_definition text;
  v_next text;
begin
  foreach v_signature in array array[
    'public.get_reservation_floor_plans(uuid)'::regprocedure,
    'public.get_reservation_setup(uuid)'::regprocedure
  ]
  loop
    select replace(pg_get_functiondef(v_signature), chr(13), '')
    into v_definition;
    v_next := replace(
      v_definition,
      '''area_color'', area.metadata->>''color''',
      '''area_color'', coalesce(area.color, area.metadata->>''color'')'
    );
    if v_next = v_definition then
      raise exception 'Reservation area-colour contract drifted for %.', v_signature;
    end if;
    execute v_next;
  end loop;
end
$catalogue_reservation_area_color$;

do $catalogue_restaurant_write_model$
declare
  v_definition text;
  v_next text;
  v_old_job text := $old_job$
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
$old_job$;
  v_new_job text := $new_job$
    insert into public.job_functions (
      id, restaurant_id, code, name, estimated_hourly_cost, active, sort_order,
      catalogue_key, icon_key, metadata
    ) values (
      v_id, p_restaurant_id,
      coalesce(nullif(btrim(v_item->>'code'), ''), public.slugify_workspace(v_name)),
      v_name,
      greatest(0, coalesce(nullif(v_item->>'estimated_hourly_cost', '')::numeric, 0)),
      coalesce((v_item->>'active')::boolean, true),
      coalesce(nullif(v_item->>'sort_order', '')::integer, 0),
      nullif(btrim(v_item->>'catalogue_key'), ''),
      nullif(btrim(v_item->>'icon_key'), ''),
      coalesce(v_item->'metadata', '{}')
    )
    on conflict (restaurant_id, id) do update set
      code = excluded.code, name = excluded.name,
      estimated_hourly_cost = excluded.estimated_hourly_cost,
      active = excluded.active, sort_order = excluded.sort_order,
      catalogue_key = excluded.catalogue_key,
      icon_key = excluded.icon_key,
      metadata = excluded.metadata, updated_at = now();
$new_job$;
  v_old_area text := $old_area$
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
$old_area$;
  v_new_area text := $new_area$
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
$new_area$;
  v_relation_anchor text := $relation_anchor$
  delete from public.opening_hours where restaurant_id = p_restaurant_id;
$relation_anchor$;
  v_relation_write text := $relation_write$
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

  delete from public.opening_hours where restaurant_id = p_restaurant_id;
$relation_write$;
begin
  select replace(
    pg_get_functiondef(
      'public.save_restaurant_model(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure
    ),
    chr(13),
    ''
  )
  into v_definition;

  v_next := replace(v_definition, v_old_job, v_new_job);
  v_next := replace(v_next, v_old_area, v_new_area);
  v_next := replace(v_next, v_relation_anchor, v_relation_write);
  if v_next = v_definition
    or position('catalogue_key = excluded.catalogue_key' in v_next) = 0
    or position('delete from public.job_function_areas' in v_next) = 0 then
    raise exception 'Restaurant write-model catalogue contract drifted.';
  end if;
  execute v_next;
end
$catalogue_restaurant_write_model$;

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
as $function$
declare
  v_auth_user uuid := auth.uid();
  v_profile_id uuid;
  v_restaurant_id uuid;
  v_item jsonb;
  v_employee_id uuid;
  v_area_id uuid;
  v_job_id uuid;
  v_name text;
begin
  if v_auth_user is null then raise exception 'Authentication required.'; end if;
  if lower(coalesce(auth.jwt()->>'email', '')) <> lower(p_owner_email::text) then
    raise exception 'Owner email must match the authenticated account.';
  end if;

  insert into public.profiles (auth_user_id, first_name, last_name, email)
  values (
    v_auth_user,
    btrim(p_owner_first_name),
    btrim(p_owner_last_name),
    p_owner_email
  )
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
    btrim(p_restaurant_name),
    btrim(p_restaurant_name),
    nullif(btrim(p_city), ''),
    p_owner_email,
    'BE',
    v_profile_id
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

  for v_item in
    select value from jsonb_array_elements(coalesce(p_areas, '[]'::jsonb))
  loop
    v_name := nullif(btrim(v_item->>'name'), '');
    if v_name is null then continue; end if;
    insert into public.work_areas (
      restaurant_id, code, name, sort_order, catalogue_key, color, icon_key, metadata
    )
    values (
      v_restaurant_id,
      coalesce(
        nullif(btrim(v_item->>'code'), ''),
        public.slugify_workspace(v_name)
      ),
      v_name,
      coalesce(nullif(v_item->>'sort_order', '')::integer, 0),
      nullif(btrim(v_item->>'catalogue_key'), ''),
      nullif(btrim(v_item->>'color'), ''),
      nullif(btrim(v_item->>'icon_key'), ''),
      '{}'::jsonb
    );
  end loop;

  for v_item in
    select value from jsonb_array_elements(coalesce(p_job_functions, '[]'::jsonb))
  loop
    v_name := nullif(btrim(
      case
        when jsonb_typeof(v_item) = 'string' then v_item #>> '{}'
        else v_item->>'name'
      end
    ), '');
    if v_name is null then continue; end if;
    insert into public.job_functions (
      restaurant_id, code, name, estimated_hourly_cost, sort_order,
      catalogue_key, icon_key, metadata
    )
    values (
      v_restaurant_id,
      coalesce(
        nullif(btrim(v_item->>'code'), ''),
        public.slugify_workspace(v_name)
      ),
      v_name,
      greatest(0, coalesce(nullif(v_item->>'estimated_hourly_cost', '')::numeric, 0)),
      coalesce(nullif(v_item->>'sort_order', '')::integer, 0),
      nullif(btrim(v_item->>'catalogue_key'), ''),
      nullif(btrim(v_item->>'icon_key'), ''),
      '{}'::jsonb
    );
  end loop;

  insert into public.opening_hours (
    restaurant_id, weekday, service_key, is_open, opens_at, closes_at
  )
  select
    v_restaurant_id,
    (value->>'weekday')::smallint,
    value->>'service_key',
    coalesce((value->>'is_open')::boolean, false),
    nullif(value->>'opens_at', '')::time,
    nullif(value->>'closes_at', '')::time
  from jsonb_array_elements(coalesce(p_opening_hours, '[]'::jsonb));

  for v_item in
    select value from jsonb_array_elements(coalesce(p_areas, '[]'::jsonb))
  loop
    select id into v_area_id
    from public.work_areas
    where restaurant_id = v_restaurant_id
      and (
        catalogue_key = nullif(v_item->>'catalogue_key', '')
        or name = v_item->>'name'
      )
    order by catalogue_key is not null desc
    limit 1;

    if v_area_id is not null then
      insert into public.area_service_defaults (
        restaurant_id, area_id, service_key, start_time, end_time
      )
      values
        (
          v_restaurant_id, v_area_id, 'lunch',
          nullif(v_item->>'lunch_start', '')::time,
          nullif(v_item->>'lunch_end', '')::time
        ),
        (
          v_restaurant_id, v_area_id, 'evening',
          nullif(v_item->>'evening_start', '')::time,
          nullif(v_item->>'evening_end', '')::time
        );
    end if;
  end loop;

  for v_item in
    select value from jsonb_array_elements(coalesce(p_coverage, '[]'::jsonb))
  loop
    select id into v_area_id
    from public.work_areas
    where restaurant_id = v_restaurant_id
      and (
        catalogue_key = nullif(v_item->>'area_key', '')
        or name = v_item->>'area'
      )
    order by catalogue_key is not null desc
    limit 1;

    select id into v_job_id
    from public.job_functions
    where restaurant_id = v_restaurant_id
      and (
        catalogue_key = nullif(v_item->>'job_function_key', '')
        or name = v_item->>'job_function'
      )
    order by catalogue_key is not null desc
    limit 1;

    if v_area_id is not null and v_job_id is not null then
      insert into public.job_function_areas (
        restaurant_id, job_function_id, area_id, is_primary
      )
      values (
        v_restaurant_id,
        v_job_id,
        v_area_id,
        not exists (
          select 1
          from public.job_function_areas relation
          where relation.restaurant_id = v_restaurant_id
            and relation.job_function_id = v_job_id
            and relation.active
        )
      )
      on conflict (restaurant_id, job_function_id, area_id) do update set
        active = true,
        updated_at = now();
    end if;
  end loop;

  for v_item in
    select value from jsonb_array_elements(coalesce(p_employees, '[]'::jsonb))
  loop
    if nullif(btrim(v_item->>'display_name'), '') is null then continue; end if;
    insert into public.employees (
      restaurant_id, display_name, first_name, last_name
    )
    values (
      v_restaurant_id,
      btrim(v_item->>'display_name'),
      nullif(btrim(v_item->>'first_name'), ''),
      nullif(btrim(v_item->>'last_name'), '')
    )
    returning id into v_employee_id;

    insert into public.employee_contact_details (
      restaurant_id, employee_id, email, phone, mobile_phone
    )
    values (
      v_restaurant_id,
      v_employee_id,
      nullif(btrim(v_item->>'email'), '')::citext,
      nullif(btrim(v_item->>'phone'), ''),
      nullif(btrim(v_item->>'phone'), '')
    );

    select id into v_job_id
    from public.job_functions
    where restaurant_id = v_restaurant_id
      and (
        catalogue_key = nullif(v_item->>'job_function_key', '')
        or name = v_item->>'job_function'
      )
    order by catalogue_key is not null desc
    limit 1;

    if v_job_id is not null then
      insert into public.employee_job_functions (
        restaurant_id, employee_id, job_function_id, is_primary
      )
      values (v_restaurant_id, v_employee_id, v_job_id, true);
    end if;

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
end
$function$;

alter function public.setup_owner_workspace(
  text,text,citext,text,text,jsonb,jsonb,jsonb,jsonb,jsonb
) owner to postgres;

revoke all on function public.setup_owner_workspace(
  text,text,citext,text,text,jsonb,jsonb,jsonb,jsonb,jsonb
) from public, anon, authenticated;
grant execute on function public.setup_owner_workspace(
  text,text,citext,text,text,jsonb,jsonb,jsonb,jsonb,jsonb
) to authenticated;

notify pgrst, 'reload schema';

commit;
