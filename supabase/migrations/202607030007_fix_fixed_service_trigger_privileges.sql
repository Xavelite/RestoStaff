begin;

-- The fixed Lunch/Evening guard is fired by setup_owner_workspace while the
-- browser role is the session role. Its internal reads must run under the table
-- owner, not require direct SELECT grants to authenticated users.
alter function public.enforce_fixed_restaurant_services() owner to postgres;
alter function public.enforce_fixed_restaurant_services() security definer;
alter function public.enforce_fixed_restaurant_services() set search_path = public;
revoke all on function public.enforce_fixed_restaurant_services()
  from public, anon, authenticated;

commit;
