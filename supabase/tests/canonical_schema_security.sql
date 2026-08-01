-- Canonical Phase 0 schema/security verification.
-- Safe to run repeatedly against development, staging or a disposable project.
-- Any failed assertion aborts the transaction.
begin;

do $$
declare
  v_allowed regprocedure[] := array[
    'public.accept_employee_invite(uuid,text,text)'::regprocedure,
    'public.admin_dashboard()'::regprocedure,
    'public.admin_delete_restaurant(uuid)'::regprocedure,
    'public.admin_delete_user(uuid)'::regprocedure,
    'public.admin_list_pilot_access_requests()'::regprocedure,
    'public.admin_restaurant_module_entitlements()'::regprocedure,
    'public.admin_review_pilot_access(uuid,boolean,text)'::regprocedure,
    'public.admin_update_feedback(uuid,text,text)'::regprocedure,
    'public.admin_set_restaurant_active(uuid,boolean)'::regprocedure,
    'public.admin_set_restaurant_module_entitlement(uuid,text,text)'::regprocedure,
    'public.admin_set_user_suspended(uuid,boolean)'::regprocedure,
    'public.am_i_platform_admin()'::regprocedure,
    'public.accept_payroll_readiness_warning(uuid,date,date,uuid,text,text)'::regprocedure,
    'public.archive_restaurant_document(uuid,uuid)'::regprocedure,
    'public.begin_restaurant_document_upload(uuid,text,text,text,bigint,text,uuid,date,date,text,text)'::regprocedure,
    'public.cancel_restaurant_document_upload(uuid,uuid)'::regprocedure,
    'public.check_reservation_availability_v2(uuid,date,text,time without time zone,integer,uuid,uuid,uuid)'::regprocedure,
    'public.clear_owner_onboarding_draft()'::regprocedure,
    'public.create_payroll_export_run(uuid,date,date,jsonb)'::regprocedure,
    'public.create_restaurant_station(uuid,text)'::regprocedure,
    'public.current_profile_id()'::regprocedure,
    'public.discard_manager_planning_draft(uuid,date,bigint)'::regprocedure,
    'public.document_storage_object_access(text,text,bigint,text)'::regprocedure,
    'public.get_employee_invitation_context(uuid,text)'::regprocedure,
    'public.get_employee_employment_terms(uuid)'::regprocedure,
    'public.get_insights_cost_rates(uuid)'::regprocedure,
    'public.get_admin_feedback()'::regprocedure,
    'public.get_communications_read_model(uuid)'::regprocedure,
    'public.get_current_memberships()'::regprocedure,
    'public.get_own_badge_context(uuid)'::regprocedure,
    'public.get_owner_onboarding_draft()'::regprocedure,
    'public.get_pilot_access_state()'::regprocedure,
    'public.get_preview_bootstrap(uuid,text,uuid)'::regprocedure,
    'public.get_preview_bootstrap_v2(uuid,text,uuid)'::regprocedure,
    'public.get_preview_module(uuid,text,uuid,text)'::regprocedure,
    'public.get_preview_operations(uuid,text,uuid,date,date)'::regprocedure,
    'public.get_preview_personas(uuid)'::regprocedure,
    'public.get_payroll_export_run(uuid,uuid)'::regprocedure,
    'public.get_payroll_catalogue(uuid)'::regprocedure,
    'public.get_reservation_demand_v2(uuid,date,date)'::regprocedure,
    'public.get_reservation_floor_plans_v2(uuid)'::regprocedure,
    'public.get_reservation_public_channel_v2(uuid)'::regprocedure,
    'public.get_reservation_setup_v2(uuid)'::regprocedure,
    'public.get_reservation_workspace_v2(uuid,date)'::regprocedure,
    'public.get_restaurant_documents(uuid)'::regprocedure,
    'public.get_workspace_context(uuid)'::regprocedure,
    'public.get_workspace_bootstrap_v2(uuid)'::regprocedure,
    'public.get_manager_operations_read_model(uuid,date,date)'::regprocedure,
    'public.get_schedule_history_read_model(uuid,integer)'::regprocedure,
    'public.get_employee_operations_read_model(uuid,date,date)'::regprocedure,
    'public.get_team_read_model_v2(uuid)'::regprocedure,
    'public.get_time_entry_payroll_evidence(uuid,uuid)'::regprocedure,
    'public.get_restaurant_read_model_v2(uuid)'::regprocedure,
    'public.is_own_employee(uuid,uuid)'::regprocedure,
    'public.is_owner(uuid)'::regprocedure,
    'public.is_owner_or_manager(uuid)'::regprocedure,
    'public.is_restaurant_member(uuid)'::regprocedure,
    'public.is_valid_belgian_niss(text)'::regprocedure,
    'public.list_badge_roster(uuid)'::regprocedure,
    'public.list_badge_roster_station(text)'::regprocedure,
    'public.list_restaurant_stations(uuid)'::regprocedure,
    'public.begin_own_badge(uuid)'::regprocedure,
    'public.preview_payroll_export(uuid,date,date,jsonb)'::regprocedure,
    'public.payroll_readiness_report(uuid,date,date)'::regprocedure,
    'public.publish_workspace_realtime_event(uuid,text,text)'::regprocedure,
    'public.record_badge_entry(uuid,uuid,uuid,text,text,text)'::regprocedure,
    'public.record_badge_entry_station(text,uuid,uuid,text,text)'::regprocedure,
    'public.record_badge_entry_v2(uuid,uuid,uuid,text,text,text,double precision,double precision,double precision)'::regprocedure,
    'public.record_badge_entry_station_v2(text,uuid,uuid,text,text,double precision,double precision,double precision)'::regprocedure,
    'public.record_own_badge_entry(uuid,uuid,text,text,double precision,double precision,double precision)'::regprocedure,
    'public.record_restaurant_document_download(uuid,uuid)'::regprocedure,
    'public.mark_operational_message(uuid,uuid,boolean)'::regprocedure,
    'public.register_push_subscription(uuid,text,text,text,text,text,text)'::regprocedure,
    'public.request_pilot_access(text)'::regprocedure,
    'public.revoke_employee_invitation(uuid,uuid,text)'::regprocedure,
    'public.revoke_restaurant_station(uuid,uuid)'::regprocedure,
    'public.rotate_unused_restaurant_station_token(uuid,uuid)'::regprocedure,
    'public.record_employee_regime_evidence(uuid,uuid,jsonb)'::regprocedure,
    'public.save_absence_lifecycle(uuid,uuid,uuid,text,jsonb)'::regprocedure,
    'public.save_actuals_lifecycle(uuid,text,jsonb)'::regprocedure,
    'public.save_employee_availability(uuid,uuid,jsonb)'::regprocedure,
    'public.save_employee_tax_profile(uuid,uuid,jsonb)'::regprocedure,
    'public.save_manager_planning(uuid,date,text,jsonb,jsonb,bigint,text,boolean,boolean)'::regprocedure,
    'public.save_owner_onboarding_draft(smallint,jsonb)'::regprocedure,
    'public.save_reservation_floor_plans_v2(uuid,jsonb,jsonb,jsonb,jsonb,integer)'::regprocedure,
    'public.save_reservation_setup_v2(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,integer)'::regprocedure,
    'public.save_reservation_v2(uuid,jsonb)'::regprocedure,
    'public.save_reservation_public_channel_v2(uuid,boolean,text[])'::regprocedure,
    'public.save_restaurant_model_v3(uuid,bigint,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure,
    'public.save_work_pattern_exception_lifecycle(uuid,uuid,uuid,text,jsonb)'::regprocedure,
    'public.save_team_workspace_v2(uuid,bigint,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure,
    'public.save_time_entry_payroll_evidence(uuid,uuid,uuid,uuid,jsonb,text)'::regprocedure,
    'public.validate_employee_employment_terms(uuid,uuid,uuid)'::regprocedure,
    'public.validate_restaurant_payroll_configuration(uuid,uuid)'::regprocedure,
    'public.set_payroll_export_columns(uuid,jsonb)'::regprocedure,
    'public.set_own_pin(text,uuid)'::regprocedure,
    'public.set_employee_access_state(uuid,uuid,text)'::regprocedure,
    'public.set_employee_mobile_badging(uuid,uuid,boolean)'::regprocedure,
    'public.set_badge_policy(uuid,boolean,boolean,boolean,boolean)'::regprocedure,
    'public.set_restaurant_logo(uuid,text)'::regprocedure,
    'public.set_reservation_status_v2(uuid,uuid,text,text,integer)'::regprocedure,
    'public.finalize_restaurant_document_upload(uuid,uuid)'::regprocedure,
    'public.ensure_reservation_public_channel_v2(uuid,text)'::regprocedure,
    'public.rotate_reservation_public_channel_v2(uuid)'::regprocedure,
    'public.setup_owner_workspace_v2(text,text,citext,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure,
    'public.send_operational_message(uuid,text,uuid[],text,boolean)'::regprocedure,
    'public.submit_pilot_feedback(uuid,text,text,text,text,text,text,text,text)'::regprocedure,
    'public.update_own_profile(text,text)'::regprocedure,
    'public.update_restaurant_document(uuid,uuid,text,text,uuid,date,date,text,text)'::regprocedure,
    'public.unregister_push_subscription(text)'::regprocedure,
    'public.verify_badge_pin(uuid,uuid,text)'::regprocedure,
    'public.verify_badge_pin_station(text,uuid,text)'::regprocedure
  ];
  v_anon_allowed regprocedure[] := array[
    'public.list_badge_roster_station(text)'::regprocedure,
    'public.record_badge_entry_station(text,uuid,uuid,text,text)'::regprocedure,
    'public.record_badge_entry_station_v2(text,uuid,uuid,text,text,double precision,double precision,double precision)'::regprocedure,
    'public.verify_badge_pin_station(text,uuid,text)'::regprocedure
  ];
  v_service_allowed regprocedure[] := array[
    'public.assert_reservation_public_module(text,text)'::regprocedure,
    'public.consume_reservation_public_rate_limit(text,text,text,text,integer,integer)'::regprocedure,
    'public.get_push_dispatch_context(uuid,uuid,date,date)'::regprocedure,
    'public.get_restaurant_read_model_v2(uuid)'::regprocedure,
    'public.get_team_read_model_v2(uuid)'::regprocedure,
    'public.get_workspace_bootstrap_v2(uuid)'::regprocedure,
    'public.is_valid_belgian_niss(text)'::regprocedure,
    'public.register_employee_invitation(uuid,uuid,citext,text,text,timestamptz,uuid)'::regprocedure,
    'public.reservation_public_confirm(text,text,text,text,jsonb)'::regprocedure,
    'public.reservation_public_context(text,text)'::regprocedure,
    'public.reservation_public_create_hold(text,text,text,jsonb)'::regprocedure,
    'public.reservation_public_release_hold(text,text,text)'::regprocedure,
    'public.reservation_public_search_availability(text,text,date,text,integer,uuid)'::regprocedure,
    'public.revoke_employee_invitation_delivery(uuid,text)'::regprocedure,
    'public.save_employee_employment_terms(uuid,uuid,jsonb)'::regprocedure,
    'public.save_manager_planning(uuid,date,text,jsonb,jsonb,bigint,text,boolean,boolean)'::regprocedure,
    'public.save_restaurant_model_v2(uuid,bigint,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure,
    'public.save_restaurant_model_v3(uuid,bigint,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure,
    'public.save_team_model(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure,
    'public.save_team_workspace_v2(uuid,bigint,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure,
    'public.save_team_workspace(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure,
    'public.save_venue_model_v2(uuid,bigint,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,integer)'::regprocedure
  ];
  v_routine regprocedure;
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity
  ) then
    raise exception 'Every public business table must have RLS enabled';
  end if;

  if exists (
    select 1
    from information_schema.role_table_grants g
    where g.table_schema = 'public'
      and g.grantee in ('anon', 'authenticated')
      and g.table_name not in (
        'notification_types',
        'notification_preferences',
        'notification_receipts',
        'workspace_realtime_events'
      )
  ) then
    raise exception 'Public business tables must remain RPC-only except reviewed RLS read models';
  end if;

  if exists (
    select 1
    from information_schema.role_table_grants g
    where g.table_schema = 'public'
      and g.grantee = 'anon'
      and g.table_name in (
        'notification_types',
        'notification_preferences',
        'notification_receipts'
      )
  ) then
    raise exception 'Notification tables must not be exposed to anon';
  end if;

  if exists (
    select 1
    from information_schema.role_table_grants g
    where g.table_schema = 'public'
      and g.grantee = 'authenticated'
      and (
        (
          g.table_name = 'notification_types'
          and g.privilege_type <> 'SELECT'
        )
        or (
          g.table_name = 'notification_preferences'
          and g.privilege_type not in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
        )
        or (
          g.table_name = 'notification_receipts'
          and g.privilege_type not in ('SELECT', 'INSERT', 'UPDATE')
        )
      )
  ) then
    raise exception 'Notification table grants exceed the personal RLS contract';
  end if;

  if exists (
    select 1
    from information_schema.role_table_grants g
    where g.table_schema = 'public'
      and g.grantee = 'authenticated'
      and g.table_name = 'workspace_realtime_events'
      and g.privilege_type <> 'SELECT'
  ) or not exists (
    select 1
    from information_schema.role_table_grants g
    where g.table_schema = 'public'
      and g.grantee = 'authenticated'
      and g.table_name = 'workspace_realtime_events'
      and g.privilege_type = 'SELECT'
  ) then
    raise exception 'Workspace Realtime table grants exceed its RLS read-only contract';
  end if;

  if not exists (
    select 1
    from information_schema.role_table_grants g
    where g.table_schema = 'public'
      and g.grantee = 'authenticated'
      and g.table_name = 'notification_types'
      and g.privilege_type = 'SELECT'
  ) or (
    select count(*)
    from information_schema.role_table_grants g
    where g.table_schema = 'public'
      and g.grantee = 'authenticated'
      and g.table_name = 'notification_preferences'
      and g.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
  ) <> 4 or (
    select count(*)
    from information_schema.role_table_grants g
    where g.table_schema = 'public'
      and g.grantee = 'authenticated'
      and g.table_name = 'notification_receipts'
      and g.privilege_type in ('SELECT', 'INSERT', 'UPDATE')
  ) <> 3 then
    raise exception 'Notification table grants are incomplete';
  end if;

  if to_regprocedure('public.list_badge_roster(text)') is not null then
    raise exception 'Legacy text badge-roster overload still exists';
  end if;
  if to_regprocedure('public.list_badge_roster(uuid)') is null then
    raise exception 'Safe UUID badge-roster contract is missing';
  end if;

  if to_regclass('public.badge_verification_challenges') is null then
    raise exception 'Badge verification challenge table is missing';
  end if;
  if not (
    select c.relrowsecurity
    from pg_class c
    where c.oid = 'public.badge_verification_challenges'::regclass
  ) then
    raise exception 'Badge verification challenges must have RLS enabled';
  end if;
  if has_table_privilege(
    'authenticated',
    'public.badge_verification_challenges',
    'SELECT'
  ) then
    raise exception 'Badge verification challenges must remain server-only';
  end if;

  if (
    select count(*)
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname in (
        'service_availability_state',
        'planning_status',
        'actuals_status',
        'operational_request_status',
        'time_entry_status',
        'time_entry_source',
        'planned_shift_source',
        'availability_submission_status'
      )
  ) <> 8 then
    raise exception 'Canonical operational enum set is incomplete';
  end if;

  if exists (
    select 1 from public.services
    where service_key !~ '^[a-z][a-z0-9-]{0,39}$'
      or nullif(btrim(name), '') is null
  ) then
    raise exception 'Service periods must keep valid stable keys and display names';
  end if;

  if exists (
    select 1
    from public.restaurants r
    where not exists (
      select 1 from public.services s
      where s.restaurant_id = r.id and s.active
    )
  ) then
    raise exception 'Every restaurant must retain at least one active service period';
  end if;

  if exists (
    select 1
    from pg_trigger t
    where not t.tgisinternal
      and t.tgname in (
        'restaurants_fixed_services_guard',
        'services_fixed_contract_guard'
      )
  ) then
    raise exception 'Legacy fixed Lunch and Evening guards must stay retired';
  end if;

  if position(
    'At least one active service period is required.'
    in pg_get_functiondef(
      'public.save_restaurant_model_v3(uuid,bigint,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure
    )
  ) = 0 then
    raise exception 'Configurable service save boundary is missing its active-service guard';
  end if;

  if position(
    'pg_temp.availability_input'
    in pg_get_functiondef(
      'public.save_employee_availability(uuid,uuid,jsonb)'::regprocedure
    )
  ) > 0 then
    raise exception 'Employee availability must not depend on a temporary table';
  end if;

  if position(
    '::public.operational_request_status'
    in pg_get_functiondef(
      'public.save_work_pattern_exception_lifecycle(uuid,uuid,uuid,text,jsonb)'::regprocedure
    )
  ) = 0 then
    raise exception 'Work-pattern exception enum write boundary is missing';
  end if;

  if to_regclass('public.recurring_work_patterns') is not null
     or to_regclass('public.schedule_exceptions') is not null
     or to_regclass('public.schedule_exception_events') is not null then
    raise exception 'Obsolete scheduling model names still exist';
  end if;

  if to_regclass('public.recurring_schedule_slots') is null
     or to_regclass('public.work_pattern_exceptions') is null
     or to_regclass('public.work_pattern_exception_events') is null then
    raise exception 'Canonical work-pattern model is incomplete';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'recurring_schedule_slots'
      and column_name = 'availability_state'
  ) then
    raise exception 'Recurring schedule slots must not store availability state';
  end if;

  if position(
    '''planning_finalized'''
    in pg_get_constraintdef((
      select oid
      from pg_constraint
      where conrelid = 'public.work_week_events'::regclass
        and conname = 'work_week_events_event_type_check'
    ))
  ) = 0 then
    raise exception 'Work-week event constraint must allow planning_finalized evidence';
  end if;

  if position(
    'and new.planning_status = ''published'''
    in pg_get_functiondef('public.guard_actuals_approval()'::regprocedure)
  ) = 0 then
    raise exception 'Actuals approval must enforce missing badges after auto-finalizing Planning';
  end if;

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
    if has_function_privilege('public', v_routine, 'EXECUTE') then
      raise exception 'App-owned routine is publicly executable: %', v_routine;
    end if;
    if v_routine = any(v_anon_allowed)
       and not has_function_privilege('anon', v_routine, 'EXECUTE') then
      raise exception 'Badge-station anonymous grant is missing: %', v_routine;
    end if;
    if v_routine <> all(v_anon_allowed)
       and has_function_privilege('anon', v_routine, 'EXECUTE') then
      raise exception 'Routine is outside anonymous allowlist: %', v_routine;
    end if;
    if v_routine = any(v_allowed)
       and not has_function_privilege('authenticated', v_routine, 'EXECUTE') then
      raise exception 'Authenticated allowlist grant is missing: %', v_routine;
    end if;
    if v_routine <> all(v_allowed)
       and has_function_privilege('authenticated', v_routine, 'EXECUTE') then
      raise exception 'Routine is outside authenticated allowlist: %', v_routine;
    end if;
    if v_routine = any(v_service_allowed)
       and not has_function_privilege('service_role', v_routine, 'EXECUTE') then
      raise exception 'Service-role allowlist grant is missing: %', v_routine;
    end if;
    if v_routine <> all(v_service_allowed)
       and has_function_privilege('service_role', v_routine, 'EXECUTE') then
      raise exception 'Routine is outside service-role allowlist: %', v_routine;
    end if;
    if not exists (
      select 1
      from unnest(coalesce(
        (select p2.proconfig from pg_proc p2 where p2.oid = v_routine),
        array[]::text[]
      )) setting
      where setting like 'search_path=%'
    ) then
      raise exception 'Routine has no explicit search_path: %', v_routine;
    end if;
    if (
      select p2.prorettype = 'pg_catalog.trigger'::regtype
      from pg_proc p2
      where p2.oid = v_routine
    ) and (
      has_function_privilege('authenticated', v_routine, 'EXECUTE')
      or has_function_privilege('service_role', v_routine, 'EXECUTE')
    ) then
      raise exception 'Trigger helper is directly executable: %', v_routine;
    end if;
  end loop;

  if has_function_privilege(
    'authenticated',
    'public.build_manager_operations_read_model(uuid,text,date,date)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.register_employee_invitation(uuid,uuid,citext,text,text,timestamptz,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.revoke_employee_invitation_delivery(uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'Server-only routines are exposed to authenticated clients';
  end if;
end
$$;

do $restaurant_suspension_boundary$
declare
  v_routine regprocedure;
begin
  foreach v_routine in array array[
    'public.active_membership_role(uuid,uuid)'::regprocedure,
    'public.is_owner(uuid)'::regprocedure,
    'public.is_owner_or_manager(uuid)'::regprocedure,
    'public.is_restaurant_member(uuid)'::regprocedure,
    'public.is_own_employee(uuid,uuid)'::regprocedure,
    'public.set_own_pin(text,uuid)'::regprocedure,
    'public.resolve_station_token(text)'::regprocedure
  ]
  loop
    if position('r.active' in pg_get_functiondef(v_routine)) = 0 then
      raise exception 'Restaurant suspension is not enforced by %.', v_routine;
    end if;
  end loop;
end
$restaurant_suspension_boundary$;

rollback;
