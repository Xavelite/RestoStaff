-- V587: validate every newly inserted or changed Belgian INSZ/NISS value.
-- Unchanged synthetic pilot fixtures remain readable for backwards compatibility.

create or replace function public.enforce_belgian_niss_change()
returns trigger
language plpgsql
set search_path = public
as $function$
declare
  v_new text := regexp_replace(coalesce(new.national_registry_number, ''), '[^0-9]', '', 'g');
  v_old text := case when tg_op = 'UPDATE' then regexp_replace(coalesce(old.national_registry_number, ''), '[^0-9]', '', 'g') else '' end;
  v_base text;
  v_check integer;
  v_valid boolean;
begin
  if v_new = '' or (tg_op = 'UPDATE' and v_new = v_old) then return new; end if;
  if v_new !~ '^[0-9]{11}$' then raise exception 'The national registry or BIS number must contain 11 digits.'; end if;
  v_base := left(v_new, 9);
  v_check := right(v_new, 2)::integer;
  v_valid := v_check = 97 - (v_base::bigint % 97) or v_check = 97 - (('2' || v_base)::bigint % 97);
  if not v_valid then raise exception 'The national registry or BIS number has an invalid control number.'; end if;
  return new;
end
$function$;

revoke all on function public.enforce_belgian_niss_change() from public, anon, authenticated;
grant execute on function public.enforce_belgian_niss_change() to service_role;

drop trigger if exists employee_legal_profiles_niss_change_guard on public.employee_legal_profiles;
create trigger employee_legal_profiles_niss_change_guard
before insert or update of national_registry_number on public.employee_legal_profiles
for each row execute function public.enforce_belgian_niss_change();
