begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';
select pg_advisory_xact_lock(
  hashtextextended('restogogo:20260729233500:quarantine-experimental-modules', 0)
);

-- Payroll preparation remains part of the pilot. Gross-to-net calculation,
-- provider reconciliation and finalization remain installed for development
-- reference but are no longer callable by an authenticated browser.
revoke all on function public.calculate_payroll_run(uuid,date,date)
  from authenticated;
revoke all on function public.create_payroll_provider_export(uuid,uuid,uuid)
  from authenticated;
revoke all on function public.get_payroll_workspace(uuid,date,date)
  from authenticated;
revoke all on function public.import_payroll_provider_return(
  uuid,uuid,uuid,text,jsonb
) from authenticated;
revoke all on function public.resolve_payroll_reconciliation(
  uuid,uuid,text,text
) from authenticated;
revoke all on function public.save_employee_payroll_benefit(uuid,uuid,jsonb)
  from authenticated;
revoke all on function public.save_payroll_provider_mapping(
  uuid,uuid,text,jsonb
) from authenticated;
revoke all on function public.save_restaurant_payroll_configuration(uuid,jsonb)
  from authenticated;
revoke all on function public.set_payroll_run_status(uuid,uuid,text)
  from authenticated;

comment on function public.calculate_payroll_run(uuid,date,date) is
  'Experimental calculation engine. Not exposed to authenticated pilot clients.';
comment on function public.get_payroll_workspace(uuid,date,date) is
  'Experimental calculation workspace. Not exposed to authenticated pilot clients.';

create or replace function public.seed_restaurant_module_entitlements()
returns trigger
language plpgsql
security definer
set search_path = public
as $seed$
begin
  insert into public.restaurant_module_entitlements (
    restaurant_id, module_key, state
  )
  select new.id, seed.module_key, seed.state
  from (
    values
      ('home', 'enabled'),
      ('restaurant', 'enabled'),
      ('team', 'enabled'),
      ('documents', 'enabled'),
      ('schedule', 'enabled'),
      ('time', 'enabled'),
      ('badge-terminal', 'enabled'),
      ('exports', 'enabled'),
      ('settings', 'enabled'),
      ('my-service', 'enabled'),
      ('my-time', 'enabled'),
      ('reservations', 'disabled'),
      ('payroll', 'enabled'),
      ('reports', 'disabled')
  ) as seed(module_key, state)
  on conflict (restaurant_id, module_key) do nothing;
  return new;
end
$seed$;

update public.restaurant_module_entitlements
set state = case
      when module_key = 'payroll' then 'enabled'
      else 'disabled'
    end,
    updated_at = now()
where module_key in ('reservations', 'payroll', 'reports')
  and updated_by_profile_id is null;

comment on function public.seed_restaurant_module_entitlements() is
  'Seeds the workforce pilot, including payroll preparation; Reservations and Reports require explicit platform enablement.';

notify pgrst, 'reload schema';
commit;
