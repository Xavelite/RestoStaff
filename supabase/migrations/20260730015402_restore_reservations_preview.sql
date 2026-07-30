begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';
select pg_advisory_xact_lock(
  hashtextextended('restogogo:20260730015402:restore-reservations-preview', 0)
);

-- Reservations are part of the development product again. Preview remains a
-- server-enforced entitlement so a future pilot can opt restaurants in without
-- changing application code.
create or replace function public.seed_restaurant_module_entitlements()
returns trigger
language plpgsql
security definer
set search_path = public
as $seed$
begin
  insert into public.restaurant_module_entitlements (
    restaurant_id, module_key, state
  )
  select new.id, seed.module_key, seed.state
  from (
    values
      ('home', 'enabled'),
      ('restaurant', 'enabled'),
      ('team', 'enabled'),
      ('documents', 'enabled'),
      ('schedule', 'enabled'),
      ('time', 'enabled'),
      ('badge-terminal', 'enabled'),
      ('exports', 'enabled'),
      ('settings', 'enabled'),
      ('my-service', 'enabled'),
      ('my-time', 'enabled'),
      ('reservations', 'preview'),
      ('payroll', 'enabled'),
      ('reports', 'disabled')
  ) as seed(module_key, state)
  on conflict (restaurant_id, module_key) do nothing;
  return new;
end
$seed$;

update public.restaurant_module_entitlements
set state = 'preview',
    updated_at = now()
where module_key = 'reservations'
  and updated_by_profile_id is null;

comment on function public.seed_restaurant_module_entitlements() is
  'Seeds the development workspace. Reservations are preview-enabled, payroll preparation is enabled and Reports remains quarantined.';

-- A restaurant may allocate physical tables, or simply stop accepting guests
-- when a service-wide cover cap is reached. Existing restaurants keep the
-- table workflow.
alter table public.reservation_service_settings
  add column capacity_mode text not null default 'tables',
  add constraint reservation_service_settings_capacity_mode_check
    check (capacity_mode in ('tables', 'covers')),
  add constraint reservation_service_settings_cover_mode_limit_check
    check (capacity_mode = 'tables' or maximum_covers is not null),
  add constraint reservation_service_settings_cover_limit_party_check
    check (maximum_covers is null or maximum_covers >= maximum_party_size);

comment on column public.reservation_service_settings.capacity_mode is
  'tables assigns physical tables; covers accepts bookings only against maximum_covers.';

-- Keep the broad setup save atomic. Each textual replacement has a drift guard
-- so a changed upstream function aborts the migration instead of partly
-- extending its contract.
do $patch_reservation_setup$
declare
  v_definition text;
  v_next text;
begin
  select replace(
    pg_get_functiondef(
      'public.save_reservation_setup(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,integer)'::regprocedure
    ),
    chr(13),
    ''
  )
  into v_definition;

  v_next := replace(
    v_definition,
    $old$      maximum_party_size,
      maximum_covers,$old$,
    $new$      maximum_party_size,
      capacity_mode,
      maximum_covers,$new$
  );
  if v_next = v_definition then
    raise exception 'Reservation setup insert-column contract drifted.';
  end if;
  v_definition := v_next;

  v_next := replace(
    v_definition,
    $old$      coalesce((v_item->>'maximum_party_size')::integer, 12),
      nullif(v_item->>'maximum_covers', '')::integer,$old$,
    $new$      coalesce((v_item->>'maximum_party_size')::integer, 12),
      coalesce(nullif(v_item->>'capacity_mode', ''), 'tables'),
      nullif(v_item->>'maximum_covers', '')::integer,$new$
  );
  if v_next = v_definition then
    raise exception 'Reservation setup insert-value contract drifted.';
  end if;
  v_definition := v_next;

  v_next := replace(
    v_definition,
    $old$      maximum_party_size = excluded.maximum_party_size,
      maximum_covers = excluded.maximum_covers,$old$,
    $new$      maximum_party_size = excluded.maximum_party_size,
      capacity_mode = excluded.capacity_mode,
      maximum_covers = excluded.maximum_covers,$new$
  );
  if v_next = v_definition then
    raise exception 'Reservation setup update contract drifted.';
  end if;

  execute v_next;
end
$patch_reservation_setup$;

-- Capacity-only services deliberately skip table assignment. Time windows,
-- cover limits, cut-offs, exceptions and concurrency locking still use the
-- existing authoritative reservation flow.
do $patch_reservation_availability$
declare
  v_definition text;
  v_next text;
begin
  select replace(
    pg_get_functiondef(
      'public.reservation_availability_internal(uuid,date,text,time without time zone,integer,uuid,uuid)'::regprocedure
    ),
    chr(13),
    ''
  )
  into v_definition;

  v_next := replace(
    v_definition,
    $old$  if v_has_tables then$old$,
    $new$  if v_setting.capacity_mode = 'tables' and v_has_tables then$new$
  );
  if v_next = v_definition then
    raise exception 'Reservation availability assignment branch drifted.';
  end if;
  v_definition := v_next;

  v_next := replace(
    v_definition,
    $old$      'explanation', 'Accepted against service capacity; no tables are configured yet.'$old$,
    $new$      'explanation', case
        when v_setting.capacity_mode = 'covers'
          then 'Accepted against the service cover limit; tables are assigned on arrival.'
        else 'Accepted against service capacity; no tables are configured yet.'
      end$new$
  );
  if v_next = v_definition then
    raise exception 'Reservation availability capacity explanation drifted.';
  end if;
  v_definition := v_next;

  v_next := replace(
    v_definition,
    $old$    'maximum_covers', v_setting.maximum_covers,
    'automatic_confirmation',$old$,
    $new$    'maximum_covers', v_setting.maximum_covers,
    'capacity_mode', v_setting.capacity_mode,
    'automatic_confirmation',$new$
  );
  if v_next = v_definition then
    raise exception 'Reservation availability result contract drifted.';
  end if;

  execute v_next;
end
$patch_reservation_availability$;

-- Ignore a stale table preference when the service has explicitly switched to
-- cover-only capacity. The saved booking remains unassigned until arrival.
do $patch_operator_reservations$
declare
  v_definition text;
  v_next text;
begin
  select replace(
    pg_get_functiondef(
      'public.reservation_operator_availability_internal(uuid,date,text,time without time zone,integer,uuid,uuid,uuid)'::regprocedure
    ),
    chr(13),
    ''
  )
  into v_definition;

  v_next := replace(
    v_definition,
    $old$  if p_preferred_table_id is null then
    return v_result;
  end if;$old$,
    $new$  if p_preferred_table_id is null
    or v_result #>> '{assignment,kind}' = 'capacity_only'
  then
    return v_result;
  end if;$new$
  );
  if v_next = v_definition then
    raise exception 'Operator availability preference contract drifted.';
  end if;
  execute v_next;

  select replace(
    pg_get_functiondef('public.save_reservation(uuid,jsonb)'::regprocedure),
    chr(13),
    ''
  )
  into v_definition;

  v_next := replace(
    v_definition,
    $old$  v_source := coalesce(nullif(p_reservation->>'source', ''), 'internal');

  if v_preferred_table_id is not null then$old$,
    $new$  v_source := coalesce(nullif(p_reservation->>'source', ''), 'internal');

  if exists (
    select 1
    from public.reservation_service_settings setting
    where setting.restaurant_id = p_restaurant_id
      and setting.service_key = v_service_key
      and setting.capacity_mode = 'covers'
  ) then
    v_room_id := null;
    v_preferred_table_id := null;
  end if;

  if v_preferred_table_id is not null then$new$
  );
  if v_next = v_definition then
    raise exception 'Reservation save capacity-mode contract drifted.';
  end if;
  execute v_next;
end
$patch_operator_reservations$;

notify pgrst, 'reload schema';
commit;
