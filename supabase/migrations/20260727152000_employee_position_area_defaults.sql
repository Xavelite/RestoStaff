-- A position describes a skill (Bartender); an area is the physical place
-- where that skill is normally used (Bar A). A null default keeps the employee
-- eligible for every active area linked to the position.
begin;

alter table public.employee_job_functions
  add column default_area_id uuid;

alter table public.employee_job_functions
  add constraint employee_job_functions_default_area_fk
    foreign key (restaurant_id, default_area_id)
    references public.work_areas(restaurant_id, id);

create index employee_job_functions_restaurant_default_area_idx
  on public.employee_job_functions (restaurant_id, default_area_id)
  where active and default_area_id is not null;

create or replace function public.guard_employee_position_default_area()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if new.default_area_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.work_areas area
    where area.restaurant_id = new.restaurant_id
      and area.id = new.default_area_id
      and area.active
  ) then
    raise exception 'The preferred area must be active.';
  end if;

  -- Positions with no explicit area links intentionally work everywhere.
  if exists (
    select 1
    from public.job_function_areas relation
    where relation.restaurant_id = new.restaurant_id
      and relation.job_function_id = new.job_function_id
      and relation.active
  ) and not exists (
    select 1
    from public.job_function_areas relation
    where relation.restaurant_id = new.restaurant_id
      and relation.job_function_id = new.job_function_id
      and relation.area_id = new.default_area_id
      and relation.active
  ) then
    raise exception 'The preferred area is not linked to this position.';
  end if;

  return new;
end
$function$;

drop trigger if exists employee_position_default_area_guard
  on public.employee_job_functions;
create trigger employee_position_default_area_guard
  before insert or update of restaurant_id, job_function_id, default_area_id, active
  on public.employee_job_functions
  for each row execute function public.guard_employee_position_default_area();

revoke all on function public.guard_employee_position_default_area()
  from public, anon, authenticated;
grant execute on function public.guard_employee_position_default_area()
  to service_role;

-- Restaurant setup owns area lifecycle. If an exact preferred location stops
-- being valid, fall back to the position's ordinary area eligibility instead
-- of leaving Team with a stale reference that blocks its next atomic save.
create or replace function public.clear_employee_defaults_for_archived_area()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if old.active and not new.active then
    update public.employee_job_functions assignment
    set default_area_id = null,
        updated_at = now()
    where assignment.restaurant_id = new.restaurant_id
      and assignment.default_area_id = new.id;
  end if;
  return new;
end
$function$;

create trigger work_areas_clear_employee_defaults
  after update of active on public.work_areas
  for each row
  when (old.active is distinct from new.active)
  execute function public.clear_employee_defaults_for_archived_area();

create or replace function public.clear_invalid_employee_position_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_restaurant_id uuid := old.restaurant_id;
  v_job_function_id uuid := old.job_function_id;
  v_area_id uuid := old.area_id;
begin
  -- A position with no explicit active links intentionally works everywhere,
  -- so its exact preference remains valid. Clear only when links still exist
  -- but no longer include the selected physical area.
  update public.employee_job_functions assignment
  set default_area_id = null,
      updated_at = now()
  where assignment.restaurant_id = v_restaurant_id
    and assignment.job_function_id = v_job_function_id
    and assignment.default_area_id = v_area_id
    and exists (
      select 1
      from public.job_function_areas relation
      where relation.restaurant_id = v_restaurant_id
        and relation.job_function_id = v_job_function_id
        and relation.active
    )
    and not exists (
      select 1
      from public.job_function_areas relation
      where relation.restaurant_id = v_restaurant_id
        and relation.job_function_id = v_job_function_id
        and relation.area_id = v_area_id
        and relation.active
    );
  return new;
end
$function$;

create trigger job_function_areas_clear_employee_defaults
  after update of active, job_function_id, area_id or delete
  on public.job_function_areas
  for each row
  execute function public.clear_invalid_employee_position_defaults();

revoke all on function public.clear_employee_defaults_for_archived_area()
  from public, anon, authenticated, service_role;
revoke all on function public.clear_invalid_employee_position_defaults()
  from public, anon, authenticated, service_role;

do $patch_team_area_defaults$
declare
  v_oid oid;
  v_definition text;
  v_next text;
  v_old_columns text := $old$
  insert into public.employee_job_functions (
    restaurant_id, employee_id, job_function_id, is_primary, active
  )
$old$;
  v_new_columns text := $new$
  insert into public.employee_job_functions (
    restaurant_id, employee_id, job_function_id, is_primary, active,
    default_area_id
  )
$new$;
  v_old_values text := $old$
    coalesce((value->>'is_primary')::boolean, false),
    coalesce((value->>'active')::boolean, true)
  from jsonb_array_elements(coalesce(p_employee_job_functions, '[]'));
$old$;
  v_new_values text := $new$
    coalesce((value->>'is_primary')::boolean, false),
    coalesce((value->>'active')::boolean, true),
    nullif(value->>'default_area_id', '')::uuid
  from jsonb_array_elements(coalesce(p_employee_job_functions, '[]'));
$new$;
begin
  select procedure.oid
  into v_oid
  from pg_proc procedure
  join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'save_team_model';

  if v_oid is null then
    raise exception 'save_team_model was not found.';
  end if;

  v_definition := pg_get_functiondef(v_oid);
  v_next := replace(v_definition, v_old_columns, v_new_columns);
  v_next := replace(v_next, v_old_values, v_new_values);

  if v_next = v_definition
    or position('default_area_id' in v_next) = 0 then
    raise exception 'save_team_model preferred-area contract drifted.';
  end if;

  execute v_next;
end
$patch_team_area_defaults$;

notify pgrst, 'reload schema';

commit;
