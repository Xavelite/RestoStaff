-- Run after every development/staging migration.
-- Any failed assertion aborts the verification transaction.
begin;

do $$
begin
  if has_schema_privilege('public', 'public', 'USAGE')
     or has_schema_privilege('public', 'public', 'CREATE') then
    raise exception 'PUBLIC must not inherit public schema privileges';
  end if;
  if not has_schema_privilege('anon', 'public', 'USAGE')
     or has_schema_privilege('anon', 'public', 'CREATE') then
    raise exception 'anon must have public schema USAGE without CREATE';
  end if;
  if not has_schema_privilege('authenticated', 'public', 'USAGE')
     or has_schema_privilege('authenticated', 'public', 'CREATE') then
    raise exception 'authenticated must have public schema USAGE without CREATE';
  end if;
  if not has_schema_privilege('service_role', 'public', 'USAGE')
     or has_schema_privilege('service_role', 'public', 'CREATE') then
    raise exception 'service_role must have public schema USAGE without CREATE';
  end if;
  if to_regprocedure('public.verify_badge_pin(uuid,uuid,text)') is null then
    raise exception 'Missing hardened verify_badge_pin contract';
  end if;
  if to_regprocedure('public.list_badge_roster(text)') is not null then
    raise exception 'Deprecated text badge-roster overload still exists';
  end if;
  if to_regprocedure('public.list_badge_roster(uuid)') is null then
    raise exception 'Safe UUID badge-roster contract is missing';
  end if;
  if to_regclass('public.badge_verification_challenges') is null then
    raise exception 'Badge verification challenge table is missing';
  end if;
  if to_regprocedure('public.record_badge_entry(uuid,uuid,uuid,text,text,text)') is null then
    raise exception 'Missing one-use-token record_badge_entry contract';
  end if;
  if to_regprocedure('public.record_badge_entry(uuid,uuid,text,date,text,text,text,timestamptz)') is not null then
    raise exception 'Deprecated client-timestamp/PIN badge signature still exists';
  end if;
  if to_regprocedure('public.list_login_restaurants()') is not null then
    raise exception 'Public restaurant enumeration RPC must remain removed';
  end if;
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'employee_pin_credentials' and c.relrowsecurity
  ) then
    raise exception 'employee_pin_credentials must have RLS enabled';
  end if;
  if has_table_privilege('authenticated', 'public.employee_pin_credentials', 'SELECT') then
    raise exception 'Authenticated clients must not read PIN credentials';
  end if;
  if has_table_privilege('authenticated', 'public.employee_payroll_profiles', 'SELECT') then
    raise exception 'Payroll tables must remain RPC-only';
  end if;
  if to_regclass('public.work_areas') is null then
    raise exception 'work_areas is missing';
  end if;
  if to_regclass('public.employee_job_functions') is null then
    raise exception 'employee_job_functions is missing';
  end if;
  if to_regclass('public.recurring_schedule_slots') is null then
    raise exception 'recurring_schedule_slots is missing';
  end if;
  if to_regclass('public.employee_invitations') is null then
    raise exception 'employee_invitations is missing';
  end if;
  if to_regclass('public.owner_onboarding_drafts') is null then
    raise exception 'owner_onboarding_drafts is missing';
  end if;
  if to_regprocedure('public.accept_employee_invite(uuid,text,text)') is null then
    raise exception 'Hardened invitation acceptance RPC is missing';
  end if;
  if to_regprocedure('public.accept_employee_invite(uuid,text)') is not null
     and has_function_privilege(
       'authenticated',
       'public.accept_employee_invite(uuid,text)',
       'EXECUTE'
     ) then
    raise exception 'Deprecated tokenless invitation acceptance remains callable';
  end if;
  if has_table_privilege('authenticated', 'public.employee_invitations', 'SELECT')
     or has_table_privilege('authenticated', 'public.owner_onboarding_drafts', 'SELECT') then
    raise exception 'Invitation/onboarding internals must remain RPC-only';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.register_employee_invitation(uuid,uuid,citext,text,text,timestamptz,uuid)',
    'EXECUTE'
  ) then
    raise exception 'Only service_role may register invitation tokens';
  end if;
  if to_regprocedure(
    'public.link_invited_employee(uuid,uuid,uuid,text,text)'
  ) is not null then
    raise exception 'Profile-first invitation linking must remain removed';
  end if;
  if to_regclass('public.work_pattern_exceptions') is null
     or to_regclass('public.work_pattern_exception_events') is null then
    raise exception 'Work-pattern exception lifecycle tables are missing';
  end if;
  if (
    select count(*)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('work_pattern_exceptions', 'work_pattern_exception_events')
      and c.relrowsecurity
  ) <> 2 then
    raise exception 'Work-pattern exception tables must have RLS enabled';
  end if;
  if has_table_privilege('authenticated', 'public.work_pattern_exceptions', 'SELECT')
     or has_table_privilege('authenticated', 'public.work_pattern_exception_events', 'SELECT') then
    raise exception 'Work-pattern exception tables must remain RPC-only';
  end if;
  if to_regprocedure(
    'public.save_work_pattern_exception_lifecycle(uuid,uuid,uuid,text,jsonb)'
  ) is null then
    raise exception 'Work-pattern exception lifecycle RPC is missing';
  end if;
  if to_regprocedure(
    'public.save_schedule_exception_lifecycle(uuid,uuid,uuid,text,jsonb)'
  ) is not null then
    raise exception 'Obsolete schedule-exception RPC still exists';
  end if;
  if to_regprocedure(
    'public.get_workspace_runtime_snapshot(uuid,date,date)'
  ) is not null
     or to_regprocedure(
       'public.build_workspace_runtime_snapshot_v2(uuid,text,uuid,uuid,date,date)'
     ) is not null then
    raise exception 'Broad workspace runtime snapshots must remain removed';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.build_manager_operations_read_model(uuid,text,date,date)',
    'EXECUTE'
  ) then
    raise exception 'Role-selectable read-model builders must remain server-only';
  end if;
  if not exists (
    select 1 from storage.buckets
    where id = 'badge-proofs'
      and not public
      and file_size_limit = 5242880
  ) then
    raise exception 'Private badge proof bucket is missing or unsafe';
  end if;
  if to_regclass('public.departments') is not null
     or to_regclass('public.teams') is not null
     or to_regclass('public.zones') is not null then
    raise exception 'Legacy organization tables still exist';
  end if;
  -- `payroll_periods` is now the active monthly calculation aggregate. The
  -- retired pre-engine review snapshot used `payroll_period_lines`.
  if to_regclass('public.payroll_period_lines') is not null then
    raise exception 'Unused payroll review snapshot table still exists';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and column_name in ('department_id','team_id','payroll_provider')
  ) then
    raise exception 'Legacy organization/provider columns still exist';
  end if;
  if not exists (
    select 1
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_type t on t.oid = a.atttypid
    where n.nspname = 'public'
      and c.relname = 'employee_contracts'
      and a.attname = 'work_regime'
      and not a.attisdropped
      and t.typname = 'work_regime'
  ) then
    raise exception 'employee_contracts.work_regime must use the work_regime enum';
  end if;
  if exists (
    select restaurant_id, employee_id
    from public.employee_job_functions
    where active and is_primary
    group by restaurant_id, employee_id
    having count(*) > 1
  ) then
    raise exception 'An employee has more than one active primary position';
  end if;
  if exists (
    select 1
    from public.profiles p
    left join auth.users u on u.id = p.auth_user_id
    where p.auth_user_id is not null and u.id is null
  ) then
    raise exception 'A profile points to a missing auth user';
  end if;
  if exists (
    select 1 from public.contract_types
    where code not in ('CDI','CDD','FLEXI','STUDENT','EXTRA','FREELANCE')
  ) then
    raise exception 'Contract types are not canonical';
  end if;
  if exists (
    select 1 from public.absence_types
    where code not in ('HOLIDAY','SICK','UNPAID','PUBLIC_HOLIDAY','OTHER')
  ) then
    raise exception 'Absence types are not canonical';
  end if;
end
$$;

rollback;
