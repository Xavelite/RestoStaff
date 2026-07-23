begin;

do $$
declare
  v_select_policy text;
begin
  select coalesce(qual, '')
  into v_select_policy
  from pg_policies
  where schemaname = 'public'
    and tablename = 'workspace_realtime_events'
    and policyname = 'workspace_realtime_events_select'
    and cmd = 'SELECT'
    and 'authenticated' = any(roles);

  if v_select_policy is null
     or position('is_restaurant_member' in v_select_policy) = 0 then
    raise exception 'Workspace Realtime event read authorization is missing or too broad.';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'workspace_realtime_events'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ) then
    raise exception 'Workspace Realtime event rows must not be directly writable by clients.';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'workspace_realtime_events'
  ) then
    raise exception 'Workspace Realtime event table is absent from the Realtime publication.';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'publish_workspace_realtime_event'
      and p.prosecdef
  ) then
    raise exception 'Workspace Realtime publisher is missing or is not security definer.';
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
      and exists (
        select 1
        from regexp_split_to_table(p.prosrc, chr(10)) line
        where btrim(line) not like '--%'
          and line ~ '\m(Planning|Actuals)\M'
      )
  ) then
    raise exception 'Retired Schedule or Timesheet copy remains in public functions: %', (
      select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and exists (
          select 1
          from regexp_split_to_table(p.prosrc, chr(10)) line
          where btrim(line) not like '--%'
            and line ~ '\m(Planning|Actuals)\M'
        )
    );
  end if;
end
$$;

rollback;
