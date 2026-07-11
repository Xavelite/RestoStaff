begin;

-- The recurring schedule guard is fired while authenticated users save team
-- setup through the RPC. Its contract lookup must run as the function owner;
-- employee_contracts stays RPC-only and must not be granted to browser roles.
alter function public.enforce_fixed_schedule_domain() owner to postgres;
alter function public.enforce_fixed_schedule_domain() security definer;
alter function public.enforce_fixed_schedule_domain() set search_path = public;
revoke all on function public.enforce_fixed_schedule_domain()
  from public, anon, authenticated;

revoke all on table public.employee_contracts
  from public, anon, authenticated;

commit;
