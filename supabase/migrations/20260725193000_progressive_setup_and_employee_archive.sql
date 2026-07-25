-- V588: progressive Restaurant/Team setup.
-- Optional Belgian identifiers are stored as drafts and validated when an
-- action actually needs them (Dimona/readiness/export), never while creating a
-- restaurant or employee. Archiving is always safe and preserves history.

create or replace function public.is_valid_belgian_niss(value text)
returns boolean
language sql
immutable
parallel safe
set search_path = public
as $function$
  with normalized as (
    select regexp_replace(coalesce(value, ''), '[^0-9]', '', 'g') as digits
  )
  select case
    when digits !~ '^[0-9]{11}$' then false
    else right(digits, 2)::integer = 97 - (left(digits, 9)::bigint % 97)
      or right(digits, 2)::integer = 97 - (('2' || left(digits, 9))::bigint % 97)
  end
  from normalized
$function$;

revoke all on function public.is_valid_belgian_niss(text) from public, anon;
grant execute on function public.is_valid_belgian_niss(text) to authenticated, service_role;

drop trigger if exists employee_legal_profiles_niss_change_guard on public.employee_legal_profiles;
drop function if exists public.enforce_belgian_niss_change();

alter table public.employee_legal_profiles
  drop constraint if exists employee_legal_profiles_niss_length;

alter table public.restaurants
  drop constraint if exists restaurants_company_number_format;

alter table public.restaurant_employment_settings
  drop constraint if exists restaurant_employment_settings_establishment_format,
  drop constraint if exists restaurant_employment_settings_joint_committee_format;

-- Only an official, valid identifier is unique. Draft/placeholder values do not
-- block another employee from being created and remain a readiness warning.
drop index if exists public.employee_legal_profiles_niss_unique;
create unique index employee_legal_profiles_niss_unique
  on public.employee_legal_profiles (
    restaurant_id,
    regexp_replace(national_registry_number, '[^0-9]', '', 'g')
  )
  where public.is_valid_belgian_niss(national_registry_number);

create or replace function public.apply_employee_archive_side_effects()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if new.active = false and (tg_op = 'INSERT' or old.active is distinct from false) then
    update public.employee_access
    set access_status = 'disabled', badge_enabled = false, updated_at = now()
    where restaurant_id = new.restaurant_id and employee_id = new.id;

    update public.recurring_schedule_slots
    set active = false, updated_at = now()
    where restaurant_id = new.restaurant_id and employee_id = new.id and active;

    update public.employee_invitations
    set status = 'revoked',
        revoked_at = coalesce(revoked_at, now()),
        revoked_by_profile_id = coalesce(revoked_by_profile_id, public.current_profile_id()),
        revoked_reason = coalesce(revoked_reason, 'Employee archived'),
        updated_at = now()
    where restaurant_id = new.restaurant_id
      and employee_id = new.id
      and status = 'pending';
  end if;
  return new;
end
$function$;

revoke all on function public.apply_employee_archive_side_effects() from public, anon, authenticated;
grant execute on function public.apply_employee_archive_side_effects() to service_role;

drop trigger if exists employees_archive_side_effects on public.employees;
create trigger employees_archive_side_effects
after insert or update of active on public.employees
for each row execute function public.apply_employee_archive_side_effects();

notify pgrst, 'reload schema';
