-- Web Push ownership, grants and delivery-ledger contract.
-- All fixture writes are rolled back.
begin;

do $push_structure$
begin
  if to_regclass('public.push_subscriptions') is null
      or to_regclass('public.push_notification_deliveries') is null then
    raise exception 'Web Push tables are missing.';
  end if;
  if not (
    select c.relrowsecurity
    from pg_class c
    where c.oid = 'public.push_subscriptions'::regclass
  ) or not (
    select c.relrowsecurity
    from pg_class c
    where c.oid = 'public.push_notification_deliveries'::regclass
  ) then
    raise exception 'Web Push tables must have RLS enabled.';
  end if;
  if has_table_privilege('anon', 'public.push_subscriptions', 'SELECT')
      or has_table_privilege('authenticated', 'public.push_subscriptions', 'SELECT')
      or has_table_privilege('authenticated', 'public.push_notification_deliveries', 'SELECT') then
    raise exception 'Push capability endpoints and delivery evidence must remain RPC-only.';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.register_push_subscription(uuid,text,text,text,text,text,text)',
    'EXECUTE'
  ) or not has_function_privilege(
    'authenticated',
    'public.unregister_push_subscription(text)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated push registration grants are incomplete.';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.get_push_dispatch_context(uuid,uuid,date,date)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.get_push_dispatch_context(uuid,uuid,date,date)',
    'EXECUTE'
  ) then
    raise exception 'Push dispatch context is not service-role isolated.';
  end if;
  if not exists (
    select 1
    from public.notification_types
    where code = 'planning_published' and default_push_enabled
  ) or not exists (
    select 1
    from public.notification_types
    where code = 'shift_soon' and default_push_enabled
  ) then
    raise exception 'High-value employee push defaults are missing.';
  end if;
end
$push_structure$;

create temp table push_contract_context (
  key text primary key,
  value text not null
) on commit drop;
grant select on push_contract_context to authenticated;

do $push_fixture$
declare
  v_profile_id uuid;
  v_auth_user_id uuid;
  v_restaurant_id uuid := gen_random_uuid();
begin
  select p.id, p.auth_user_id
  into v_profile_id, v_auth_user_id
  from public.profiles p
  where p.auth_user_id is not null
  order by p.created_at
  limit 1;

  if v_profile_id is null then
    v_auth_user_id := gen_random_uuid();
    insert into auth.users (id, email)
    values (v_auth_user_id, 'push-contract-' || v_auth_user_id::text || '@example.test');
    insert into public.profiles (auth_user_id, first_name, last_name, email)
    values (
      v_auth_user_id,
      'Push',
      'Contract',
      'push-contract-' || v_auth_user_id::text || '@example.test'
    )
    returning id into v_profile_id;
  end if;

  insert into public.restaurants (id, workspace_slug, name, owner_profile_id)
  values (
    v_restaurant_id,
    'push-contract-' || replace(v_restaurant_id::text, '-', ''),
    'Push contract fixture',
    v_profile_id
  );
  insert into public.restaurant_settings (restaurant_id, timezone)
  values (v_restaurant_id, 'Europe/Brussels');
  insert into public.restaurant_memberships (restaurant_id, profile_id, role, status)
  values (v_restaurant_id, v_profile_id, 'owner', 'active');

  insert into push_contract_context (key, value)
  values
    ('profile_id', v_profile_id::text),
    ('auth_user_id', v_auth_user_id::text),
    ('restaurant_id', v_restaurant_id::text);
end
$push_fixture$;

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (select value from push_contract_context where key = 'auth_user_id')
  )::text,
  true
);
set local role authenticated;
select public.register_push_subscription(
  (select value::uuid from push_contract_context where key = 'restaurant_id'),
  'https://push.example.test/subscription/contract',
  repeat('p', 65),
  repeat('a', 24),
  'fr-BE',
  'Contract phone',
  'Contract browser'
);
reset role;

do $push_registered$
declare
  v_profile_id uuid := (
    select value::uuid from push_contract_context where key = 'profile_id'
  );
begin
  if not exists (
    select 1
    from public.push_subscriptions
    where profile_id = v_profile_id
      and endpoint = 'https://push.example.test/subscription/contract'
      and locale = 'fr'
      and active
  ) then
    raise exception 'Authenticated push registration did not preserve ownership and locale.';
  end if;
end
$push_registered$;

set local role authenticated;
select public.unregister_push_subscription(
  'https://push.example.test/subscription/contract'
);
reset role;

do $push_unregistered$
declare
  v_profile_id uuid := (
    select value::uuid from push_contract_context where key = 'profile_id'
  );
begin
  if exists (
    select 1
    from public.push_subscriptions
    where profile_id = v_profile_id
      and endpoint = 'https://push.example.test/subscription/contract'
      and active
  ) then
    raise exception 'Authenticated push unregister did not revoke the device.';
  end if;
end
$push_unregistered$;
rollback;
