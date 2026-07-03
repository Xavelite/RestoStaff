begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- These broad legacy mutation surfaces have no callers in the clean rebuild.
-- Removing them is safer than leaving revoked compatibility code available for
-- accidental re-granting later.
drop function if exists public.save_restaurant_setup(
  uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
);
drop function if exists public.save_team_setup(
  uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
);
drop function if exists public.save_manager_planning(
  uuid,date,text,jsonb,jsonb,jsonb,timestamptz
);
drop function if exists public.setup_owner_workspace(
  text,text,citext,text,text,jsonb,text,text,jsonb,jsonb,jsonb,jsonb
);
drop function if exists public.accept_employee_invite(uuid,text);

-- Payroll remains a provider-neutral export/readiness workflow. The unused
-- review snapshot tables had no application lifecycle and duplicated Actuals,
-- contracts and absence truth.
drop table if exists public.payroll_period_lines;
drop table if exists public.payroll_periods;

commit;
