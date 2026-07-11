-- Align projects created with Supabase's broad public-schema defaults to the
-- canonical Restogogo RPC-only security model.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated;

revoke all privileges on all tables in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;

grant select on table public.notification_types to authenticated;
grant select, insert, update, delete on table public.notification_preferences to authenticated;
grant select, insert, update on table public.notification_receipts to authenticated;

do $migration$
declare
  v_authenticated regprocedure[] := array[
    'public.accept_employee_invite(uuid,text,text)'::regprocedure,
    'public.clear_owner_onboarding_draft()'::regprocedure,
    'public.create_payroll_export_run(uuid,date,date,jsonb)'::regprocedure,
    'public.current_profile_id()'::regprocedure,
    'public.get_employee_invitation_context(uuid,text)'::regprocedure,
    'public.get_current_memberships()'::regprocedure,
    'public.get_owner_onboarding_draft()'::regprocedure,
    'public.get_payroll_export_run(uuid,uuid)'::regprocedure,
    'public.get_workspace_context(uuid)'::regprocedure,
    'public.get_workspace_bootstrap(uuid)'::regprocedure,
    'public.get_manager_operations_read_model(uuid,date,date)'::regprocedure,
    'public.get_employee_operations_read_model(uuid,date,date)'::regprocedure,
    'public.get_team_read_model(uuid)'::regprocedure,
    'public.get_restaurant_read_model(uuid)'::regprocedure,
    'public.list_badge_roster(uuid)'::regprocedure,
    'public.preview_payroll_export(uuid,date,date,jsonb)'::regprocedure,
    'public.record_badge_entry(uuid,uuid,uuid,text,text,text)'::regprocedure,
    'public.revoke_employee_invitation(uuid,uuid,text)'::regprocedure,
    'public.save_absence_lifecycle(uuid,uuid,uuid,text,jsonb)'::regprocedure,
    'public.save_actuals_lifecycle(uuid,text,jsonb)'::regprocedure,
    'public.save_employee_availability(uuid,uuid,jsonb)'::regprocedure,
    'public.save_manager_planning(uuid,date,text,jsonb,jsonb,bigint,text,boolean)'::regprocedure,
    'public.save_owner_onboarding_draft(smallint,jsonb)'::regprocedure,
    'public.save_restaurant_model(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure,
    'public.save_work_pattern_exception_lifecycle(uuid,uuid,uuid,text,jsonb)'::regprocedure,
    'public.save_team_model(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure,
    'public.set_payroll_export_columns(uuid,jsonb)'::regprocedure,
    'public.set_own_pin(text,uuid)'::regprocedure,
    'public.set_employee_access_state(uuid,uuid,text)'::regprocedure,
    'public.setup_owner_workspace(text,text,citext,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure,
    'public.update_own_profile(text,text)'::regprocedure,
    'public.verify_badge_pin(uuid,uuid,text)'::regprocedure,
    'public.is_restaurant_member(uuid)'::regprocedure
  ];
  v_service regprocedure[] := array[
    'public.register_employee_invitation(uuid,uuid,citext,text,text,timestamptz,uuid)'::regprocedure,
    'public.revoke_employee_invitation_delivery(uuid,text)'::regprocedure
  ];
  v_routine regprocedure;
begin
  for v_routine in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_language l on l.oid = p.prolang
    where n.nspname = 'public'
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
      'revoke all privileges on function %s from public, anon, authenticated, service_role',
      v_routine
    );
  end loop;

  foreach v_routine in array v_authenticated loop
    execute format('grant execute on function %s to authenticated', v_routine);
  end loop;
  foreach v_routine in array v_service loop
    execute format('grant execute on function %s to service_role', v_routine);
  end loop;
end
$migration$;
