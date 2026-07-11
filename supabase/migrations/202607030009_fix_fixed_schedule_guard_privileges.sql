begin;

-- The fixed-schedule guard runs while browser RPCs save recurring schedule
-- slots. Its internal contract lookup must use the table owner; authenticated
-- users should not need direct SELECT grants on employee_contracts.
alter function public.enforce_fixed_schedule_domain() owner to postgres;
alter function public.enforce_fixed_schedule_domain() security definer;
alter function public.enforce_fixed_schedule_domain() set search_path = public;
revoke all on function public.enforce_fixed_schedule_domain()
  from public, anon, authenticated;

commit;
