-- Phase 0 security baseline.
--
-- Preconditions:
-- - Migrations 202606200012 through 202606200014 are recorded as applied.
-- - The hardened UUID badge RPCs from 202606190001 exist.
-- - The legacy text badge-roster overload may still exist.
--
-- Rollback:
-- - Drop badge_verification_challenges only if no badge verification is active.
-- - Restore grants from this file's explicit allowlist.
-- - Never restore public/anonymous execution or list_badge_roster(text).
begin;

create table public.badge_verification_challenges (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  employee_id uuid not null,
  actor_profile_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint badge_verification_challenges_employee_fkey
    foreign key (restaurant_id, employee_id)
    references public.employees(restaurant_id, id)
    on delete cascade,
  constraint badge_verification_challenges_expiry_check
    check (expires_at > created_at),
  constraint badge_verification_challenges_used_at_check
    check (used_at is null or used_at >= created_at)
);

create index badge_verification_challenges_lookup_idx
  on public.badge_verification_challenges (
    restaurant_id,
    employee_id,
    actor_profile_id,
    token_hash
  )
  where used_at is null;

create index badge_verification_challenges_expiry_idx
  on public.badge_verification_challenges (expires_at);

alter table public.badge_verification_challenges enable row level security;
revoke all on table public.badge_verification_challenges from public, anon, authenticated;
grant select, insert, update, delete
  on table public.badge_verification_challenges
  to service_role;

drop function if exists public.list_badge_roster(text);

-- PostgreSQL grants EXECUTE to PUBLIC for new functions unless explicitly
-- revoked. Reset every app-owned SECURITY DEFINER routine to default-deny.
-- Extension-owned routines such as pgcrypto helpers are intentionally excluded.
do $$
declare
  v_routine regprocedure;
begin
  for v_routine in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_language l on l.oid = p.prolang
    where n.nspname = 'public'
      and p.prosecdef
      and l.lanname in ('sql', 'plpgsql')
      and not exists (
        select 1
        from pg_depend d
        where d.classid = 'pg_proc'::regclass
          and d.objid = p.oid
          and d.deptype = 'e'
      )
  loop
    execute format(
      'revoke all on function %s from public, anon, authenticated',
      v_routine
    );
  end loop;
end
$$;

-- Authenticated application entry points. This is the canonical client
-- allowlist; helpers, trigger functions and role-selectable read models remain
-- inaccessible to browser roles.
grant execute on function public.accept_employee_invite(uuid,text,text) to authenticated;
grant execute on function public.clear_owner_onboarding_draft() to authenticated;
grant execute on function public.current_profile_id() to authenticated;
grant execute on function public.get_current_memberships() to authenticated;
grant execute on function public.get_owner_onboarding_draft() to authenticated;
grant execute on function public.get_workspace_context(uuid) to authenticated;
grant execute on function public.get_workspace_runtime_snapshot(uuid,date,date) to authenticated;
grant execute on function public.list_badge_roster(uuid) to authenticated;
grant execute on function public.record_badge_entry(uuid,uuid,uuid,text,text,text) to authenticated;
grant execute on function public.save_absence_lifecycle(uuid,uuid,uuid,text,jsonb) to authenticated;
grant execute on function public.save_actuals_lifecycle(uuid,text,jsonb) to authenticated;
grant execute on function public.save_employee_availability(uuid,uuid,jsonb) to authenticated;
grant execute on function public.save_manager_planning(
  uuid,date,text,jsonb,jsonb,timestamptz
) to authenticated;
grant execute on function public.save_owner_onboarding_draft(smallint,jsonb) to authenticated;
grant execute on function public.save_restaurant_model(
  uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
) to authenticated;
grant execute on function public.save_schedule_exception_lifecycle(
  uuid,uuid,uuid,text,jsonb
) to authenticated;
grant execute on function public.save_team_model(
  uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
) to authenticated;
grant execute on function public.set_own_pin(text,uuid) to authenticated;
grant execute on function public.setup_owner_workspace(
  text,text,citext,text,text,jsonb,jsonb,jsonb,jsonb,jsonb
) to authenticated;
grant execute on function public.update_own_profile(text,text) to authenticated;
grant execute on function public.verify_badge_pin(uuid,uuid,text) to authenticated;

-- Edge Functions use the service role for these server-only operations.
grant execute on function public.build_workspace_runtime_snapshot_v2(
  uuid,text,uuid,uuid,date,date
) to service_role;
grant execute on function public.link_invited_employee(
  uuid,uuid,uuid,text,text
) to service_role;
grant execute on function public.register_employee_invitation(
  uuid,uuid,uuid,citext,text,text,timestamptz
) to service_role;

commit;
