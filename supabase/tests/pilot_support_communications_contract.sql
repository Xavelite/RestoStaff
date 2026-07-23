-- Preview, pilot feedback and operational-messaging role contract.
-- All fixtures are rolled back.
begin;

do $structure$
declare v_table text;
begin
  foreach v_table in array array[
    'pilot_feedback', 'operational_messages', 'operational_message_recipients'
  ] loop
    if to_regclass('public.' || v_table) is null then
      raise exception 'Missing pilot support table: %', v_table;
    end if;
    if not (select relrowsecurity from pg_class where oid = ('public.' || v_table)::regclass) then
      raise exception 'RLS is required on %', v_table;
    end if;
    if has_table_privilege('authenticated', 'public.' || v_table, 'SELECT')
       or has_table_privilege('authenticated', 'public.' || v_table, 'INSERT') then
      raise exception '% must remain RPC-only', v_table;
    end if;
  end loop;
  if to_regclass('public.open_shift_requests') is not null
     or to_regclass('public.open_shift_responses') is not null
     or to_regprocedure('public.create_open_shift_request(uuid,date,text,text,integer)') is not null
     or to_regprocedure('public.respond_to_open_shift_request(uuid,uuid,text)') is not null
     or to_regprocedure('public.confirm_open_shift_request(uuid,uuid,uuid[])') is not null
     or to_regprocedure('public.cancel_open_shift_request(uuid,uuid)') is not null then
    raise exception 'Retired open-shift database surface is still present';
  end if;
  if not has_function_privilege('authenticated', 'public.get_communications_read_model(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.get_preview_personas(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.submit_pilot_feedback(uuid,text,text,text,text,text,text,text,text)', 'EXECUTE') then
    raise exception 'Authenticated pilot support RPC grants are incomplete';
  end if;
  if has_function_privilege('authenticated', 'public.build_communications_read_model(uuid,text,uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.require_preview_access(uuid,text,uuid)', 'EXECUTE') then
    raise exception 'Internal pilot support helpers are exposed';
  end if;
  if not exists (
    select 1 from public.notification_types
    where code = 'operational_message_received' and default_push_enabled and active
  ) then
    raise exception 'Operational-message push notification type is incomplete';
  end if;
  if exists (
    select 1 from public.notification_types
    where code in ('open_shift_request_created', 'open_shift_response_received', 'open_shift_selection_decided')
  ) then
    raise exception 'Retired open-shift notification types are still present';
  end if;
end
$structure$;

create temp table pilot_context(key text primary key, value text not null) on commit drop;
grant select on pilot_context to authenticated;

do $fixtures$
declare
  v_restaurant uuid := gen_random_uuid();
  v_owner_auth uuid := gen_random_uuid();
  v_manager_auth uuid := gen_random_uuid();
  v_employee_auth uuid := gen_random_uuid();
  v_owner_profile uuid;
  v_manager_profile uuid;
  v_employee_profile uuid;
  v_employee uuid := gen_random_uuid();
begin
  insert into auth.users(id,email) values
    (v_owner_auth, 'pilot-owner-' || v_owner_auth || '@example.test'),
    (v_manager_auth, 'pilot-manager-' || v_manager_auth || '@example.test'),
    (v_employee_auth, 'pilot-employee-' || v_employee_auth || '@example.test');
  insert into public.profiles(auth_user_id,first_name,last_name,email) values
    (v_owner_auth,'Pilot','Owner','pilot-owner-' || v_owner_auth || '@example.test') returning id into v_owner_profile;
  insert into public.profiles(auth_user_id,first_name,last_name,email) values
    (v_manager_auth,'Pilot','Manager','pilot-manager-' || v_manager_auth || '@example.test') returning id into v_manager_profile;
  insert into public.profiles(auth_user_id,first_name,last_name,email) values
    (v_employee_auth,'Pilot','Employee','pilot-employee-' || v_employee_auth || '@example.test') returning id into v_employee_profile;

  insert into public.restaurants(id,workspace_slug,name,owner_profile_id)
  values (v_restaurant,'pilot-' || replace(v_restaurant::text,'-',''),'Pilot support fixture',v_owner_profile);
  insert into public.restaurant_settings(restaurant_id,timezone) values (v_restaurant,'Europe/Brussels');
  insert into public.restaurant_memberships(restaurant_id,profile_id,role,status) values
    (v_restaurant,v_owner_profile,'owner','active'),
    (v_restaurant,v_manager_profile,'manager','active'),
    (v_restaurant,v_employee_profile,'employee','active');
  insert into public.employees(id,restaurant_id,display_name,active)
  values (v_employee,v_restaurant,'Pilot Employee',true);
  insert into public.employee_access(restaurant_id,employee_id,profile_id,access_status)
  values (v_restaurant,v_employee,v_employee_profile,'active');

  insert into pilot_context values
    ('restaurant',v_restaurant::text),('owner_auth',v_owner_auth::text),
    ('manager_auth',v_manager_auth::text),('employee_auth',v_employee_auth::text),
    ('owner_profile',v_owner_profile::text),('employee',v_employee::text);
end
$fixtures$;

select set_config('request.jwt.claims', jsonb_build_object('sub',(select value from pilot_context where key='manager_auth'))::text, true);
set local role authenticated;
select public.send_operational_message(
  (select value::uuid from pilot_context where key='restaurant'),
  'Please confirm this service update.',
  array[(select value::uuid from pilot_context where key='employee')],
  'urgent', true
);
reset role;

select set_config('request.jwt.claims', jsonb_build_object('sub',(select value from pilot_context where key='employee_auth'))::text, true);
set local role authenticated;
select public.mark_operational_message(
  (select value::uuid from pilot_context where key='restaurant'),
  (select id from public.operational_messages order by created_at desc limit 1), true
);
select public.submit_pilot_feedback(
  (select value::uuid from pilot_context where key='restaurant'),
  'confusing', 'The service card needs a clearer label.', '/my-service', 'contract-test',
  'employee', 'en', '390x844@3', 'contract-test'
);

do $employee_cannot_manage$
begin
  begin
    perform public.send_operational_message(
      (select value::uuid from pilot_context where key='restaurant'),
      'Forbidden', '{}'::uuid[], 'normal', false
    );
    raise exception 'Employee unexpectedly sent a manager message';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.get_preview_bootstrap(
      (select value::uuid from pilot_context where key='restaurant'), 'owner', null
    );
    raise exception 'Employee unexpectedly opened an owner preview';
  exception when insufficient_privilege then null;
  end;
end
$employee_cannot_manage$;
reset role;

select set_config('request.jwt.claims', jsonb_build_object('sub',(select value from pilot_context where key='manager_auth'))::text, true);
set local role authenticated;
do $manager_preview_boundary$
declare v_model jsonb;
begin
  v_model := public.get_preview_bootstrap(
    (select value::uuid from pilot_context where key='restaurant'),
    'employee', (select value::uuid from pilot_context where key='employee')
  );
  if v_model #>> '{current_employee,display_name}' <> 'Pilot Employee' then
    raise exception 'Employee preview did not bind the selected employee';
  end if;
  begin
    perform public.get_preview_bootstrap(
      (select value::uuid from pilot_context where key='restaurant'), 'owner', null
    );
    raise exception 'Manager unexpectedly opened an owner preview';
  exception when insufficient_privilege then null;
  end;
end
$manager_preview_boundary$;
reset role;

do $outcomes$
begin
  if not exists (select 1 from public.operational_message_recipients where read_at is not null and acknowledged_at is not null) then
    raise exception 'Message read/acknowledgement state was not persisted';
  end if;
  if not exists (select 1 from public.pilot_feedback where app_release='contract-test' and page_path='/my-service') then
    raise exception 'Pilot feedback context was not persisted';
  end if;
end
$outcomes$;

rollback;
