-- Run against the linked database before migration 202606190002.
-- It fails fast if the target no longer matches the reviewed legacy baseline.
begin;

do $$
declare
  v_required_table text;
begin
  foreach v_required_table in array array[
    'profiles',
    'restaurant_memberships',
    'employee_access',
    'employees',
    'employee_contracts',
    'employee_payroll_profiles',
    'job_functions',
    'contract_types',
    'absence_types',
    'absences',
    'departments',
    'teams',
    'zones',
    'zone_service_defaults',
    'coverage_requirements',
    'planned_shifts',
    'payroll_period_lines'
  ] loop
    if to_regclass('public.' || v_required_table) is null then
      raise exception 'Required baseline table public.% is missing', v_required_table;
    end if;
  end loop;

  if to_regclass('public.work_areas') is not null
     or to_regclass('public.employee_job_functions') is not null
     or to_regclass('public.recurring_work_patterns') is not null then
    raise exception 'Restaurant-native migration appears to be partially applied';
  end if;

  if exists (
    select 1
    from public.profiles p
    left join auth.users u on u.id = p.auth_user_id
    where p.auth_user_id is not null and u.id is null
  ) then
    raise exception 'A profile points to a missing auth user before migration';
  end if;

  if exists (
    select 1
    from public.restaurant_memberships m
    left join public.profiles p on p.id = m.profile_id
    where p.id is null
  ) then
    raise exception 'A membership points to a missing profile before migration';
  end if;

  if exists (
    select 1
    from public.employee_access ea
    left join public.employees e
      on e.restaurant_id = ea.restaurant_id and e.id = ea.employee_id
    where e.id is null
  ) then
    raise exception 'An employee access row points to a missing employee before migration';
  end if;
end
$$;

rollback;
