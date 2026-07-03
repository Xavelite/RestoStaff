-- Phase 1: enforce the fixed restaurant service metadata contract.
--
-- Preconditions:
-- - Migration 202606200017 is applied.
-- - Every restaurant already owns one Lunch and one Evening service row.
--
-- Rollback:
-- - Drop both constraint triggers and public.enforce_fixed_restaurant_services().
-- - Keep services_service_key_check unless dynamic services are deliberately
--   introduced as a future product decision.
begin;

create or replace function public.enforce_fixed_restaurant_services()
returns trigger
language plpgsql
set search_path = public
as $fixed_restaurant_services$
declare
  v_restaurant_id uuid;
  v_restaurant_ids uuid[];
begin
  if tg_table_name = 'restaurants' then
    v_restaurant_ids := array[new.id];
  elsif tg_op = 'INSERT' then
    v_restaurant_ids := array[new.restaurant_id];
  elsif tg_op = 'DELETE' then
    v_restaurant_ids := array[old.restaurant_id];
  else
    v_restaurant_ids := array[old.restaurant_id, new.restaurant_id];
  end if;

  foreach v_restaurant_id in array v_restaurant_ids
  loop
    if v_restaurant_id is null or not exists (
      select 1 from public.restaurants r where r.id = v_restaurant_id
    ) then
      continue;
    end if;

    if (
      select count(*)
      from public.services s
      where s.restaurant_id = v_restaurant_id
        and s.service_key in ('lunch', 'evening')
    ) <> 2 then
      raise exception
        'Every restaurant must retain Lunch and Evening service metadata. Disable a service instead of deleting it.';
    end if;
  end loop;

  return null;
end
$fixed_restaurant_services$;

revoke all on function public.enforce_fixed_restaurant_services()
  from public, anon, authenticated;

create constraint trigger restaurants_fixed_services_guard
after insert on public.restaurants
deferrable initially deferred
for each row execute function public.enforce_fixed_restaurant_services();

create constraint trigger services_fixed_contract_guard
after insert or update or delete on public.services
deferrable initially deferred
for each row execute function public.enforce_fixed_restaurant_services();

commit;
