begin;

do $$
declare
  v_select_policy text;
  v_insert_policy text;
begin
  select coalesce(qual, '')
  into v_select_policy
  from pg_policies
  where schemaname = 'realtime'
    and tablename = 'messages'
    and policyname = 'workspace members can receive broadcasts'
    and cmd = 'SELECT'
    and 'authenticated' = any(roles);

  select coalesce(with_check, '')
  into v_insert_policy
  from pg_policies
  where schemaname = 'realtime'
    and tablename = 'messages'
    and policyname = 'workspace members can send broadcasts'
    and cmd = 'INSERT'
    and 'authenticated' = any(roles);

  if v_select_policy is null
     or position('is_restaurant_member' in v_select_policy) = 0
     or position('realtime.topic' in v_select_policy) = 0
     or position('broadcast' in v_select_policy) = 0 then
    raise exception 'Private workspace broadcast read authorization is missing or too broad.';
  end if;

  if v_insert_policy is null
     or position('is_restaurant_member' in v_insert_policy) = 0
     or position('realtime.topic' in v_insert_policy) = 0
     or position('broadcast' in v_insert_policy) = 0 then
    raise exception 'Private workspace broadcast write authorization is missing or too broad.';
  end if;

  if not exists (
    select 1
    from public.notification_types
    where code = 'employee_availability_updated'
      and default_in_app_enabled
      and sort_order = 80
      and default_target_module = 'schedule'
      and label = 'Employee submitted availability'
      and description = 'An employee submitted availability for a future week.'
  ) then
    raise exception 'Submitted availability notification defaults are not aligned.';
  end if;

  if exists (
    select 1
    from public.notification_types
    where label ilike '%planning%'
       or description ilike '%planning%'
       or default_target_module in ('planning', 'actuals', 'shifts', 'calendar', 'badge')
  ) then
    raise exception 'Visible notification catalog terminology is stale.';
  end if;

  if exists (
    select 1
    from public.notification_types
    where code in (
      'published_planning_changed',
      'payroll_export_created',
      'shift_changed_after_publication'
    )
      and active
  ) then
    raise exception 'Reserved notification types without a product implementation must stay inactive.';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'notification_receipts'
      and policyname like 'notification_feed_states_%'
  ) then
    raise exception 'Legacy notification receipt policy aliases still exist.';
  end if;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname like 'notification_feed_states_%'
  ) or exists (
    select 1
    from pg_constraint
    where conname like 'notification_feed_states_%'
  ) or exists (
    select 1
    from pg_trigger
    where not tgisinternal
      and tgname like 'set_notification_feed_states_%'
  ) then
    raise exception 'Legacy notification receipt database objects still exist.';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosrc ~ '\m(Planning|Actuals)\M'
  ) then
    raise exception 'Retired Planning or Actuals copy remains in public functions.';
  end if;
end
$$;

rollback;
