-- Preferred employee areas remain valid for unrestricted positions, while a
-- newly restricted link set clears preferences outside its final active set.
-- The trigger is deferred so a multi-row relationship sync is evaluated only
-- after every insert, reactivation and deactivation in the transaction.
begin;

create or replace function public.clear_invalid_employee_position_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_restaurant_id uuid;
  v_job_function_id uuid;
  v_previous_restaurant_id uuid;
  v_previous_job_function_id uuid;
begin
  if tg_op = 'DELETE' then
    v_restaurant_id := old.restaurant_id;
    v_job_function_id := old.job_function_id;
  else
    v_restaurant_id := new.restaurant_id;
    v_job_function_id := new.job_function_id;
  end if;

  update public.employee_job_functions assignment
  set default_area_id = null,
      updated_at = now()
  where assignment.restaurant_id = v_restaurant_id
    and assignment.job_function_id = v_job_function_id
    and assignment.default_area_id is not null
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
        and relation.area_id = assignment.default_area_id
        and relation.active
    );

  if tg_op = 'UPDATE'
      and (
        old.restaurant_id is distinct from new.restaurant_id
        or old.job_function_id is distinct from new.job_function_id
      ) then
    v_previous_restaurant_id := old.restaurant_id;
    v_previous_job_function_id := old.job_function_id;

    update public.employee_job_functions assignment
    set default_area_id = null,
        updated_at = now()
    where assignment.restaurant_id = v_previous_restaurant_id
      and assignment.job_function_id = v_previous_job_function_id
      and assignment.default_area_id is not null
      and exists (
        select 1
        from public.job_function_areas relation
        where relation.restaurant_id = v_previous_restaurant_id
          and relation.job_function_id = v_previous_job_function_id
          and relation.active
      )
      and not exists (
        select 1
        from public.job_function_areas relation
        where relation.restaurant_id = v_previous_restaurant_id
          and relation.job_function_id = v_previous_job_function_id
          and relation.area_id = assignment.default_area_id
          and relation.active
      );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$function$;

drop trigger if exists job_function_areas_clear_employee_defaults
  on public.job_function_areas;
create constraint trigger job_function_areas_clear_employee_defaults
  after insert or update or delete
  on public.job_function_areas
  deferrable initially deferred
  for each row execute function public.clear_invalid_employee_position_defaults();

revoke all on function public.clear_invalid_employee_position_defaults()
  from public, anon, authenticated, service_role;

commit;
