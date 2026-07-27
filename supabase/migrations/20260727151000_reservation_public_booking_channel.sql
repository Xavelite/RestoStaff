-- Public reservation channel.
--
-- The browser-facing widget never receives a database credential with elevated
-- privileges. It presents an opaque, revocable channel key to the
-- reservation-public Edge Function; the Edge Function then calls the
-- service-role-only RPCs below. All reservation tables remain RPC-only.
--
-- Public booking follows search -> five-minute hold -> confirmation. Holds
-- reserve exact physical tables (or the explicitly configured members of a
-- table combination). Ordinary tables are never shared by unrelated parties
-- during overlapping occupied ranges.

create extension if not exists btree_gist with schema extensions;

create table public.reservation_public_channels (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  name text not null default 'Website widget'
    check (length(btrim(name)) between 1 and 80),
  public_key text not null unique
    check (public_key ~ '^rg_pk_[a-f0-9]{32}$'),
  enabled boolean not null default true,
  allowed_origins text[] not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, id),
  unique (restaurant_id, name),
  foreign key (restaurant_id) references public.restaurants(id) on delete cascade,
  check (cardinality(allowed_origins) between 1 and 50)
);

create table public.reservation_public_holds (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  channel_id uuid not null,
  hold_token_hash text not null unique
    check (hold_token_hash ~ '^[a-f0-9]{64}$'),
  token_prefix text not null
    check (length(token_prefix) between 8 and 24),
  business_date date not null,
  service_key text not null,
  room_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  party_size integer not null check (party_size between 1 and 500),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  released_at timestamptz,
  reservation_id uuid,
  created_at timestamptz not null default now(),
  unique (restaurant_id, id),
  foreign key (restaurant_id) references public.restaurants(id) on delete cascade,
  foreign key (restaurant_id, channel_id)
    references public.reservation_public_channels(restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, service_key)
    references public.services(restaurant_id, service_key) on delete restrict,
  foreign key (restaurant_id, room_id)
    references public.reservation_rooms(restaurant_id, id) on delete restrict,
  foreign key (restaurant_id, reservation_id)
    references public.reservations(restaurant_id, id) on delete restrict,
  check (ends_at > starts_at),
  check (expires_at > created_at),
  check (consumed_at is null or released_at is null),
  check (reservation_id is null or consumed_at is not null)
);

create table public.reservation_public_hold_tables (
  restaurant_id uuid not null,
  hold_id uuid not null,
  table_id uuid not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (restaurant_id, hold_id, table_id),
  foreign key (restaurant_id) references public.restaurants(id) on delete cascade,
  foreign key (restaurant_id, hold_id)
    references public.reservation_public_holds(restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, table_id)
    references public.reservation_tables(restaurant_id, id) on delete restrict
);

create table public.reservation_public_idempotency (
  restaurant_id uuid not null,
  channel_id uuid not null,
  operation text not null check (operation in ('hold', 'confirm')),
  idempotency_key text not null
    check (length(idempotency_key) between 8 and 120),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  response jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (channel_id, operation, idempotency_key),
  foreign key (restaurant_id) references public.restaurants(id) on delete cascade,
  foreign key (restaurant_id, channel_id)
    references public.reservation_public_channels(restaurant_id, id) on delete cascade
);

create table public.reservation_public_rate_limits (
  restaurant_id uuid not null,
  channel_id uuid not null,
  bucket text not null check (bucket in ('context', 'availability', 'hold', 'confirm')),
  client_hash text not null check (client_hash ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  updated_at timestamptz not null default now(),
  primary key (channel_id, bucket, client_hash, window_started_at),
  foreign key (restaurant_id) references public.restaurants(id) on delete cascade,
  foreign key (restaurant_id, channel_id)
    references public.reservation_public_channels(restaurant_id, id) on delete cascade
);

create index reservation_public_holds_inventory_idx
  on public.reservation_public_holds (
    restaurant_id, business_date, service_key, expires_at
  )
  where consumed_at is null and released_at is null;
create index reservation_public_hold_tables_table_idx
  on public.reservation_public_hold_tables (restaurant_id, table_id, hold_id);
create index reservation_public_idempotency_expiry_idx
  on public.reservation_public_idempotency (expires_at);
create index reservation_public_rate_limits_cleanup_idx
  on public.reservation_public_rate_limits (window_started_at);

alter table public.reservation_public_channels enable row level security;
alter table public.reservation_public_holds enable row level security;
alter table public.reservation_public_hold_tables enable row level security;
alter table public.reservation_public_idempotency enable row level security;
alter table public.reservation_public_rate_limits enable row level security;

revoke all on table public.reservation_public_channels
  from public, anon, authenticated;
revoke all on table public.reservation_public_holds
  from public, anon, authenticated;
revoke all on table public.reservation_public_hold_tables
  from public, anon, authenticated;
revoke all on table public.reservation_public_idempotency
  from public, anon, authenticated;
revoke all on table public.reservation_public_rate_limits
  from public, anon, authenticated;

grant all on table public.reservation_public_channels to service_role;
grant all on table public.reservation_public_holds to service_role;
grant all on table public.reservation_public_hold_tables to service_role;
grant all on table public.reservation_public_idempotency to service_role;
grant all on table public.reservation_public_rate_limits to service_role;

create trigger reservation_public_channels_set_updated_at
  before update on public.reservation_public_channels
  for each row execute function public.set_updated_at();

-- Store the occupied range on each live assignment so the database, not only
-- the availability query, rejects overlapping parties on the same table.
alter table public.reservation_table_assignments
  add column occupied_at tstzrange;

update public.reservation_table_assignments assignment
set occupied_at = tstzrange(reservation.starts_at, reservation.ends_at, '[)')
from public.reservations reservation
where reservation.restaurant_id = assignment.restaurant_id
  and reservation.id = assignment.reservation_id;

alter table public.reservation_table_assignments
  alter column occupied_at set not null,
  add constraint reservation_table_assignments_occupied_nonempty
    check (not isempty(occupied_at)),
  add constraint reservation_table_assignments_no_overlap
    exclude using gist (
      restaurant_id with =,
      table_id with =,
      occupied_at with &&
    )
    where (unassigned_at is null);

create function public.set_reservation_assignment_occupied_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  select tstzrange(reservation.starts_at, reservation.ends_at, '[)')
  into new.occupied_at
  from public.reservations reservation
  where reservation.restaurant_id = new.restaurant_id
    and reservation.id = new.reservation_id;

  if new.occupied_at is null then
    raise exception 'Reservation assignment requires a valid reservation.';
  end if;
  return new;
end
$$;

create trigger reservation_table_assignments_set_occupied_at
  before insert or update of reservation_id
  on public.reservation_table_assignments
  for each row execute function public.set_reservation_assignment_occupied_at();

create function public.sync_reservation_assignment_occupied_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.reservation_table_assignments
  set occupied_at = tstzrange(new.starts_at, new.ends_at, '[)')
  where restaurant_id = new.restaurant_id
    and reservation_id = new.id
    and unassigned_at is null;
  return new;
end
$$;

create trigger reservations_sync_assignment_occupied_at
  after update of starts_at, ends_at on public.reservations
  for each row
  when (
    old.starts_at is distinct from new.starts_at
    or old.ends_at is distinct from new.ends_at
  )
  execute function public.sync_reservation_assignment_occupied_at();

revoke all on function public.set_reservation_assignment_occupied_at()
  from public, anon, authenticated, service_role;
revoke all on function public.sync_reservation_assignment_occupied_at()
  from public, anon, authenticated, service_role;

create function public.normalize_reservation_public_origin(p_origin text)
returns text
language sql
immutable
strict
security invoker
set search_path = public
as $$
  select lower(regexp_replace(btrim(p_origin), '/+$', ''))
$$;

create function public.reservation_public_area_instance_letter(p_number integer)
returns text
language plpgsql
immutable
strict
security invoker
set search_path = public
as $$
declare
  v_number integer := greatest(p_number, 1);
  v_result text := '';
begin
  while v_number > 0
  loop
    v_number := v_number - 1;
    v_result := chr(65 + mod(v_number, 26)) || v_result;
    v_number := v_number / 26;
  end loop;
  return v_result;
end
$$;

create function public.reservation_public_channel_context(
  p_public_key text,
  p_origin text
)
returns table (
  channel_id uuid,
  restaurant_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select channel.id, channel.restaurant_id
  from public.reservation_public_channels channel
  join public.restaurants restaurant
    on restaurant.id = channel.restaurant_id
   and restaurant.active
  where channel.public_key = btrim(p_public_key)
    and channel.enabled
    and public.normalize_reservation_public_origin(p_origin)
      = any(channel.allowed_origins)
$$;

create function public.release_expired_reservation_public_holds(
  p_restaurant_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.reservation_public_holds
  set released_at = expires_at
  where restaurant_id = p_restaurant_id
    and consumed_at is null
    and released_at is null
    and expires_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end
$$;

revoke all on function public.normalize_reservation_public_origin(text)
  from public, anon, authenticated, service_role;
revoke all on function public.reservation_public_area_instance_letter(integer)
  from public, anon, authenticated, service_role;
revoke all on function public.reservation_public_channel_context(text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.release_expired_reservation_public_holds(uuid)
  from public, anon, authenticated, service_role;

-- Existing operator bookings and public holds use the same candidate engine.
-- Only explicitly configured combinations are considered; arbitrary adjacent
-- tables are never inferred.
create or replace function public.reservation_assignment_candidate(
  p_restaurant_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_party_size integer,
  p_room_id uuid default null,
  p_exclude_reservation_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_table record;
  v_combination record;
  v_table_ids uuid[];
begin
  select table_row.id, table_row.label, table_row.room_id
  into v_table
  from public.reservation_tables table_row
  join public.reservation_rooms room
    on room.restaurant_id = table_row.restaurant_id
   and room.id = table_row.room_id
   and room.active
  where table_row.restaurant_id = p_restaurant_id
    and table_row.active
    and not table_row.blocked
    and (p_room_id is null or table_row.room_id = p_room_id)
    and p_party_size between table_row.minimum_capacity
      and table_row.maximum_capacity
    and not exists (
      select 1
      from public.reservation_table_assignments assignment
      join public.reservations reservation
        on reservation.restaurant_id = assignment.restaurant_id
       and reservation.id = assignment.reservation_id
      where assignment.restaurant_id = table_row.restaurant_id
        and assignment.table_id = table_row.id
        and assignment.unassigned_at is null
        and reservation.id is distinct from p_exclude_reservation_id
        and reservation.status not in ('cancelled', 'no_show', 'finished')
        and assignment.occupied_at
          && tstzrange(p_starts_at, p_ends_at, '[)')
    )
    and not exists (
      select 1
      from public.reservation_public_hold_tables hold_table
      join public.reservation_public_holds hold
        on hold.restaurant_id = hold_table.restaurant_id
       and hold.id = hold_table.hold_id
      where hold_table.restaurant_id = table_row.restaurant_id
        and hold_table.table_id = table_row.id
        and hold.consumed_at is null
        and hold.released_at is null
        and hold.expires_at > now()
        and tstzrange(hold.starts_at, hold.ends_at, '[)')
          && tstzrange(p_starts_at, p_ends_at, '[)')
    )
  order by
    table_row.maximum_capacity,
    table_row.minimum_capacity desc,
    table_row.sort_order,
    table_row.label
  limit 1;

  if v_table.id is not null then
    return jsonb_build_object(
      'available', true,
      'kind', 'table',
      'room_id', v_table.room_id,
      'table_ids', jsonb_build_array(v_table.id),
      'explanation', format(
        'Table %s is the smallest suitable available table.',
        v_table.label
      )
    );
  end if;

  select combination.id, combination.name, combination.room_id,
    array_agg(member.table_id order by member.sort_order, member.table_id)
      as table_ids
  into v_combination
  from public.reservation_table_combinations combination
  join public.reservation_table_combination_members member
    on member.restaurant_id = combination.restaurant_id
   and member.combination_id = combination.id
  join public.reservation_rooms room
    on room.restaurant_id = combination.restaurant_id
   and room.id = combination.room_id
   and room.active
  where combination.restaurant_id = p_restaurant_id
    and combination.active
    and (p_room_id is null or combination.room_id = p_room_id)
    and p_party_size between combination.minimum_capacity
      and combination.maximum_capacity
  group by combination.id, combination.name, combination.room_id,
    combination.maximum_capacity, combination.sort_order
  having bool_and(
    exists (
      select 1
      from public.reservation_tables table_row
      where table_row.restaurant_id = p_restaurant_id
        and table_row.id = member.table_id
        and table_row.room_id = combination.room_id
        and table_row.active
        and not table_row.blocked
    )
    and not exists (
      select 1
      from public.reservation_table_assignments assignment
      join public.reservations reservation
        on reservation.restaurant_id = assignment.restaurant_id
       and reservation.id = assignment.reservation_id
      where assignment.restaurant_id = p_restaurant_id
        and assignment.table_id = member.table_id
        and assignment.unassigned_at is null
        and reservation.id is distinct from p_exclude_reservation_id
        and reservation.status not in ('cancelled', 'no_show', 'finished')
        and assignment.occupied_at
          && tstzrange(p_starts_at, p_ends_at, '[)')
    )
    and not exists (
      select 1
      from public.reservation_public_hold_tables hold_table
      join public.reservation_public_holds hold
        on hold.restaurant_id = hold_table.restaurant_id
       and hold.id = hold_table.hold_id
      where hold_table.restaurant_id = p_restaurant_id
        and hold_table.table_id = member.table_id
        and hold.consumed_at is null
        and hold.released_at is null
        and hold.expires_at > now()
        and tstzrange(hold.starts_at, hold.ends_at, '[)')
          && tstzrange(p_starts_at, p_ends_at, '[)')
    )
  )
  order by
    combination.maximum_capacity,
    combination.sort_order,
    combination.name
  limit 1;

  v_table_ids := v_combination.table_ids;
  if coalesce(array_length(v_table_ids, 1), 0) > 0 then
    return jsonb_build_object(
      'available', true,
      'kind', 'combination',
      'room_id', v_combination.room_id,
      'table_ids', to_jsonb(v_table_ids),
      'explanation', format(
        '%s is the smallest suitable available table combination.',
        v_combination.name
      )
    );
  end if;

  return jsonb_build_object(
    'available', false,
    'code', 'no_table',
    'reason', case
      when p_room_id is null
        then 'No suitable table is available for this time.'
      else 'No suitable table is available in the preferred area for this time.'
    end
  );
end
$$;

revoke all on function public.reservation_assignment_candidate(
  uuid,timestamptz,timestamptz,integer,uuid,uuid
) from public, anon, authenticated, service_role;

create function public.reservation_public_slot_availability(
  p_restaurant_id uuid,
  p_business_date date,
  p_service_key text,
  p_local_time time,
  p_party_size integer,
  p_room_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_setting public.reservation_service_settings%rowtype;
  v_hold_covers integer;
begin
  v_result := public.reservation_availability_internal(
    p_restaurant_id,
    p_business_date,
    p_service_key,
    p_local_time,
    p_party_size,
    p_room_id,
    null
  );

  if coalesce((v_result->>'available')::boolean, false) is not true then
    return v_result;
  end if;

  if jsonb_array_length(
    coalesce(v_result->'assignment'->'table_ids', '[]'::jsonb)
  ) = 0 then
    return jsonb_build_object(
      'available', false,
      'code', 'table_inventory_required',
      'reason', 'Online booking requires configured table inventory.'
    );
  end if;

  select *
  into v_setting
  from public.reservation_service_settings setting
  where setting.restaurant_id = p_restaurant_id
    and setting.service_key = p_service_key;

  select coalesce(sum(hold.party_size), 0)::integer
  into v_hold_covers
  from public.reservation_public_holds hold
  where hold.restaurant_id = p_restaurant_id
    and hold.business_date = p_business_date
    and hold.service_key = p_service_key
    and hold.consumed_at is null
    and hold.released_at is null
    and hold.expires_at > now();

  if v_setting.maximum_covers is not null
    and coalesce((v_result->>'booked_covers')::integer, 0)
      + v_hold_covers
      + p_party_size
      > v_setting.maximum_covers
  then
    return jsonb_build_object(
      'available', false,
      'code', 'service_capacity',
      'reason', 'This service has reached its online cover limit.'
    );
  end if;

  return v_result || jsonb_build_object('held_covers', v_hold_covers);
end
$$;

revoke all on function public.reservation_public_slot_availability(
  uuid,date,text,time,integer,uuid
) from public, anon, authenticated, service_role;

create function public.reservation_public_normalize_origins(p_origins text[])
returns text[]
language plpgsql
immutable
security invoker
set search_path = public
as $$
declare
  v_origins text[];
  v_origin text;
begin
  select array_agg(origin order by origin)
  into v_origins
  from (
    select distinct public.normalize_reservation_public_origin(value) as origin
    from unnest(coalesce(p_origins, array[]::text[])) value
    where nullif(btrim(value), '') is not null
  ) normalized;

  if coalesce(cardinality(v_origins), 0) not between 1 and 50 then
    raise exception 'Add between 1 and 50 allowed website origins.';
  end if;

  foreach v_origin in array v_origins
  loop
    if v_origin !~ '^https?://[a-z0-9][a-z0-9.-]*(:[0-9]{1,5})?$' then
      raise exception 'Allowed origins must be complete http or https origins without paths.';
    end if;
  end loop;

  return v_origins;
end
$$;

revoke all on function public.reservation_public_normalize_origins(text[])
  from public, anon, authenticated, service_role;

create function public.get_reservation_public_channel(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_channel public.reservation_public_channels%rowtype;
  v_restaurant_name text;
begin
  perform 1 from public.require_owner_or_manager_context(p_restaurant_id);

  select restaurant.name
  into v_restaurant_name
  from public.restaurants restaurant
  where restaurant.id = p_restaurant_id;

  select *
  into v_channel
  from public.reservation_public_channels channel
  where channel.restaurant_id = p_restaurant_id
    and channel.name = 'Website widget';

  return jsonb_build_object(
    'configured', found,
    'restaurant_id', p_restaurant_id,
    'restaurant_name', coalesce(v_restaurant_name, ''),
    'id', v_channel.id,
    'name', coalesce(v_channel.name, 'Website widget'),
    'public_key', v_channel.public_key,
    'enabled', coalesce(v_channel.enabled, false),
    'allowed_origins', coalesce(to_jsonb(v_channel.allowed_origins), '[]'::jsonb),
    'updated_at', v_channel.updated_at
  );
end
$$;

create function public.ensure_reservation_public_channel(
  p_restaurant_id uuid,
  p_default_origin text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_origins text[];
begin
  perform 1 from public.require_owner_or_manager_context(p_restaurant_id);
  v_origins := public.reservation_public_normalize_origins(
    array[p_default_origin]
  );

  insert into public.reservation_public_channels (
    restaurant_id,
    name,
    public_key,
    enabled,
    allowed_origins
  )
  values (
    p_restaurant_id,
    'Website widget',
    'rg_pk_' || replace(gen_random_uuid()::text, '-', ''),
    true,
    v_origins
  )
  on conflict (restaurant_id, name) do nothing;

  return public.get_reservation_public_channel(p_restaurant_id);
end
$$;

create function public.save_reservation_public_channel(
  p_restaurant_id uuid,
  p_enabled boolean,
  p_allowed_origins text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_origins text[];
begin
  perform 1 from public.require_owner_or_manager_context(p_restaurant_id);
  v_origins := public.reservation_public_normalize_origins(p_allowed_origins);

  update public.reservation_public_channels
  set enabled = coalesce(p_enabled, false),
    allowed_origins = v_origins,
    updated_at = now()
  where restaurant_id = p_restaurant_id
    and name = 'Website widget';

  if not found then
    raise exception 'Website widget is not configured yet.';
  end if;

  if coalesce(p_enabled, false) is false then
    update public.reservation_public_holds
    set released_at = now()
    where restaurant_id = p_restaurant_id
      and consumed_at is null
      and released_at is null;
  end if;

  return public.get_reservation_public_channel(p_restaurant_id);
end
$$;

create function public.rotate_reservation_public_channel(p_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform 1 from public.require_owner_or_manager_context(p_restaurant_id);

  update public.reservation_public_channels
  set public_key = 'rg_pk_' || replace(gen_random_uuid()::text, '-', ''),
    updated_at = now()
  where restaurant_id = p_restaurant_id
    and name = 'Website widget';

  if not found then
    raise exception 'Website widget is not configured yet.';
  end if;

  update public.reservation_public_holds
  set released_at = now()
  where restaurant_id = p_restaurant_id
    and consumed_at is null
    and released_at is null;

  return public.get_reservation_public_channel(p_restaurant_id);
end
$$;

revoke all on function public.get_reservation_public_channel(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.ensure_reservation_public_channel(uuid,text)
  from public, anon, authenticated, service_role;
revoke all on function public.save_reservation_public_channel(uuid,boolean,text[])
  from public, anon, authenticated, service_role;
revoke all on function public.rotate_reservation_public_channel(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.get_reservation_public_channel(uuid)
  to authenticated;
grant execute on function public.ensure_reservation_public_channel(uuid,text)
  to authenticated;
grant execute on function public.save_reservation_public_channel(uuid,boolean,text[])
  to authenticated;
grant execute on function public.rotate_reservation_public_channel(uuid)
  to authenticated;

create function public.consume_reservation_public_rate_limit(
  p_public_key text,
  p_origin text,
  p_bucket text,
  p_client_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_channel record;
  v_window_started_at timestamptz;
  v_count integer;
begin
  if p_bucket not in ('context', 'availability', 'hold', 'confirm')
    or p_client_hash !~ '^[a-f0-9]{64}$'
    or p_limit not between 1 and 1000
    or p_window_seconds not between 10 and 86400
  then
    raise exception 'Invalid rate-limit request.';
  end if;

  select *
  into v_channel
  from public.reservation_public_channel_context(p_public_key, p_origin)
  limit 1;
  if not found then
    raise exception 'PUBLIC_CHANNEL_UNAVAILABLE';
  end if;

  v_window_started_at := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.reservation_public_rate_limits (
    restaurant_id,
    channel_id,
    bucket,
    client_hash,
    window_started_at,
    request_count
  )
  values (
    v_channel.restaurant_id,
    v_channel.channel_id,
    p_bucket,
    p_client_hash,
    v_window_started_at,
    1
  )
  on conflict (channel_id, bucket, client_hash, window_started_at)
  do update set request_count =
      public.reservation_public_rate_limits.request_count + 1,
    updated_at = now()
  returning request_count into v_count;

  delete from public.reservation_public_rate_limits
  where window_started_at < now() - interval '2 days';

  return jsonb_build_object(
    'allowed', v_count <= p_limit,
    'remaining', greatest(p_limit - v_count, 0),
    'retry_after_seconds', greatest(
      ceil(
        extract(epoch from (
          v_window_started_at
          + make_interval(secs => p_window_seconds)
          - now()
        ))
      )::integer,
      1
    )
  );
end
$$;

create function public.reservation_public_context(
  p_public_key text,
  p_origin text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_channel record;
  v_restaurant public.restaurants%rowtype;
  v_timezone text;
begin
  select *
  into v_channel
  from public.reservation_public_channel_context(p_public_key, p_origin)
  limit 1;
  if not found then
    raise exception 'PUBLIC_CHANNEL_UNAVAILABLE';
  end if;

  select *
  into v_restaurant
  from public.restaurants restaurant
  where restaurant.id = v_channel.restaurant_id;

  select coalesce(nullif(settings.timezone, ''), 'Europe/Brussels')
  into v_timezone
  from public.restaurant_settings settings
  where settings.restaurant_id = v_channel.restaurant_id;

  return jsonb_build_object(
    'restaurant', jsonb_build_object(
      'name', v_restaurant.name,
      'timezone', coalesce(v_timezone, 'Europe/Brussels')
    ),
    'services', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'key', service.service_key,
          'name', service.name,
          'minimum_party_size', setting.minimum_party_size,
          'maximum_party_size', least(
            setting.maximum_party_size,
            inventory.maximum_party_size
          ),
          'advance_booking_days', setting.advance_booking_days,
          'booking_cutoff_minutes', setting.booking_cutoff_minutes,
          'slot_interval_minutes', setting.slot_interval_minutes
        )
        order by service.sort_order, service.name
      )
      from public.services service
      join public.reservation_service_settings setting
        on setting.restaurant_id = service.restaurant_id
       and setting.service_key = service.service_key
      join lateral (
        select max(candidate.maximum_capacity)::integer as maximum_party_size
        from (
          select table_row.maximum_capacity
          from public.reservation_tables table_row
          join public.reservation_rooms room
            on room.restaurant_id = table_row.restaurant_id
           and room.id = table_row.room_id
           and room.active
          where table_row.restaurant_id = service.restaurant_id
            and table_row.active
            and not table_row.blocked
          union all
          select combination.maximum_capacity
          from public.reservation_table_combinations combination
          join public.reservation_rooms room
            on room.restaurant_id = combination.restaurant_id
           and room.id = combination.room_id
           and room.active
          where combination.restaurant_id = service.restaurant_id
            and combination.active
            and exists (
              select 1
              from public.reservation_table_combination_members member
              where member.restaurant_id = combination.restaurant_id
                and member.combination_id = combination.id
            )
            and not exists (
              select 1
              from public.reservation_table_combination_members member
              join public.reservation_tables member_table
                on member_table.restaurant_id = member.restaurant_id
               and member_table.id = member.table_id
              where member.restaurant_id = combination.restaurant_id
                and member.combination_id = combination.id
                and (
                  not member_table.active
                  or member_table.blocked
                  or member_table.room_id <> combination.room_id
                )
            )
        ) candidate
      ) inventory
        on inventory.maximum_party_size >= setting.minimum_party_size
      where service.restaurant_id = v_channel.restaurant_id
        and service.active
        and setting.booking_enabled
    ), '[]'::jsonb),
    'areas', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', room.id,
          'name', case
            when (
              select count(*)
              from public.work_areas duplicate
              where duplicate.restaurant_id = area.restaurant_id
                and duplicate.active
                and coalesce(
                  duplicate.catalogue_key,
                  'custom:' || public.slugify_workspace(duplicate.name)
                ) = coalesce(
                  area.catalogue_key,
                  'custom:' || public.slugify_workspace(area.name)
                )
            ) > 1
            then format(
              '%s (%s.%s)',
              area.name,
              case
                when coalesce(floor.level, 0) > 0
                  then '+' || floor.level::text
                else coalesce(floor.level, 0)::text
              end,
              public.reservation_public_area_instance_letter(
                area.instance_number
              )
            )
            else area.name
          end
        )
        order by room.sort_order, area.sort_order, area.name
      )
      from public.reservation_rooms room
      join public.work_areas area
        on area.restaurant_id = room.restaurant_id
       and area.id = room.work_area_id
       and area.active
      left join public.reservation_floors floor
        on floor.restaurant_id = room.restaurant_id
       and floor.id = room.floor_id
       and floor.active
      where room.restaurant_id = v_channel.restaurant_id
        and room.active
        and exists (
          select 1
          from public.reservation_tables table_row
          where table_row.restaurant_id = room.restaurant_id
            and table_row.room_id = room.id
            and table_row.active
            and not table_row.blocked
        )
    ), '[]'::jsonb)
  );
end
$$;

create function public.reservation_public_search_availability(
  p_public_key text,
  p_origin text,
  p_business_date date,
  p_service_key text,
  p_party_size integer,
  p_room_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_channel record;
  v_setting public.reservation_service_settings%rowtype;
  v_exception public.reservation_service_exceptions%rowtype;
  v_opening public.opening_hours%rowtype;
  v_opens_at time;
  v_closes_at time;
  v_timezone text;
  v_cursor timestamptz;
  v_close timestamptz;
  v_local_time time;
  v_result jsonb;
  v_slots jsonb := '[]'::jsonb;
begin
  select *
  into v_channel
  from public.reservation_public_channel_context(p_public_key, p_origin)
  limit 1;
  if not found then
    raise exception 'PUBLIC_CHANNEL_UNAVAILABLE';
  end if;

  select *
  into v_setting
  from public.reservation_service_settings setting
  where setting.restaurant_id = v_channel.restaurant_id
    and setting.service_key = p_service_key
    and setting.booking_enabled;
  if not found then
    raise exception 'SERVICE_UNAVAILABLE';
  end if;

  if p_party_size < v_setting.minimum_party_size
    or p_party_size > v_setting.maximum_party_size
  then
    raise exception 'INVALID_PARTY_SIZE';
  end if;

  if p_room_id is not null and not exists (
    select 1
    from public.reservation_rooms room
    where room.restaurant_id = v_channel.restaurant_id
      and room.id = p_room_id
      and room.active
  ) then
    raise exception 'INVALID_AREA';
  end if;

  select *
  into v_exception
  from public.reservation_service_exceptions exception
  where exception.restaurant_id = v_channel.restaurant_id
    and exception.service_key = p_service_key
    and exception.business_date = p_business_date;

  if found and v_exception.availability = 'closed' then
    return jsonb_build_object('slots', '[]'::jsonb);
  elsif found and v_exception.availability = 'open' then
    v_opens_at := v_exception.opens_at;
    v_closes_at := v_exception.closes_at;
  else
    select *
    into v_opening
    from public.opening_hours opening
    where opening.restaurant_id = v_channel.restaurant_id
      and opening.service_key = p_service_key
      and opening.weekday = extract(isodow from p_business_date)::integer;
    if not found or not v_opening.is_open then
      return jsonb_build_object('slots', '[]'::jsonb);
    end if;
    v_opens_at := v_opening.opens_at;
    v_closes_at := v_opening.closes_at;
  end if;

  if v_opens_at is null or v_closes_at is null or v_opens_at = v_closes_at then
    return jsonb_build_object('slots', '[]'::jsonb);
  end if;

  select coalesce(nullif(settings.timezone, ''), 'Europe/Brussels')
  into v_timezone
  from public.restaurant_settings settings
  where settings.restaurant_id = v_channel.restaurant_id;
  v_timezone := coalesce(v_timezone, 'Europe/Brussels');

  v_cursor := public.reservation_local_timestamp(
    v_channel.restaurant_id,
    p_business_date,
    v_opens_at
  );
  v_close := public.reservation_local_timestamp(
    v_channel.restaurant_id,
    p_business_date + case when v_closes_at < v_opens_at then 1 else 0 end,
    v_closes_at
  );

  while v_cursor < v_close
  loop
    v_local_time := (v_cursor at time zone v_timezone)::time;
    v_result := public.reservation_public_slot_availability(
      v_channel.restaurant_id,
      p_business_date,
      p_service_key,
      v_local_time,
      p_party_size,
      p_room_id
    );

    if coalesce((v_result->>'available')::boolean, false) then
      v_slots := v_slots || jsonb_build_array(jsonb_build_object(
        'local_time', to_char(v_local_time, 'HH24:MI'),
        'starts_at', v_result->>'starts_at',
        'ends_at', v_result->>'ends_at'
      ));
    end if;

    v_cursor := v_cursor
      + make_interval(mins => v_setting.slot_interval_minutes);
  end loop;

  return jsonb_build_object(
    'business_date', p_business_date,
    'service_key', p_service_key,
    'party_size', p_party_size,
    'area_id', p_room_id,
    'slots', v_slots
  );
end
$$;

create function public.reservation_public_create_hold(
  p_public_key text,
  p_origin text,
  p_idempotency_key text,
  p_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_channel record;
  v_idempotency public.reservation_public_idempotency%rowtype;
  v_request_hash text;
  v_business_date date;
  v_service_key text;
  v_local_time time;
  v_party_size integer;
  v_room_id uuid;
  v_availability jsonb;
  v_hold_id uuid := gen_random_uuid();
  v_hold_token text;
  v_hold_token_hash text;
  v_expires_at timestamptz := now() + interval '5 minutes';
  v_table_id jsonb;
  v_sort_order integer := 0;
  v_response jsonb;
begin
  select *
  into v_channel
  from public.reservation_public_channel_context(p_public_key, p_origin)
  limit 1;
  if not found then
    raise exception 'PUBLIC_CHANNEL_UNAVAILABLE';
  end if;

  if length(coalesce(p_idempotency_key, '')) not between 8 and 120 then
    raise exception 'INVALID_IDEMPOTENCY_KEY';
  end if;

  v_request_hash := encode(
    extensions.digest(convert_to(coalesce(p_request, '{}'::jsonb)::text, 'UTF8'), 'sha256'),
    'hex'
  );
  perform pg_advisory_xact_lock(hashtextextended(
    v_channel.channel_id::text || '|hold|' || p_idempotency_key,
    0
  ));

  delete from public.reservation_public_idempotency
  where channel_id = v_channel.channel_id
    and expires_at <= now();

  select *
  into v_idempotency
  from public.reservation_public_idempotency idem
  where idem.channel_id = v_channel.channel_id
    and idem.operation = 'hold'
    and idem.idempotency_key = p_idempotency_key;
  if found then
    if v_idempotency.request_hash <> v_request_hash then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return v_idempotency.response;
  end if;

  begin
    v_business_date := (p_request->>'business_date')::date;
    v_service_key := nullif(btrim(p_request->>'service_key'), '');
    v_local_time := (p_request->>'local_time')::time;
    v_party_size := (p_request->>'party_size')::integer;
    v_room_id := nullif(p_request->>'area_id', '')::uuid;
  exception when others then
    raise exception 'INVALID_BOOKING_REQUEST';
  end;

  if v_business_date is null
    or v_service_key is null
    or v_local_time is null
    or v_party_size is null
  then
    raise exception 'INVALID_BOOKING_REQUEST';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    v_channel.restaurant_id::text || '|' || v_business_date::text,
    0
  ));
  perform public.release_expired_reservation_public_holds(
    v_channel.restaurant_id
  );

  v_availability := public.reservation_public_slot_availability(
    v_channel.restaurant_id,
    v_business_date,
    v_service_key,
    v_local_time,
    v_party_size,
    v_room_id
  );
  if coalesce((v_availability->>'available')::boolean, false) is not true then
    raise exception 'RESERVATION_UNAVAILABLE: %',
      coalesce(v_availability->>'reason', 'This time is no longer available.');
  end if;

  v_hold_token := 'rg_hold_' || replace(gen_random_uuid()::text, '-', '');
  v_hold_token_hash := encode(
    extensions.digest(v_hold_token, 'sha256'),
    'hex'
  );

  insert into public.reservation_public_holds (
    id,
    restaurant_id,
    channel_id,
    hold_token_hash,
    token_prefix,
    business_date,
    service_key,
    room_id,
    starts_at,
    ends_at,
    party_size,
    expires_at
  )
  values (
    v_hold_id,
    v_channel.restaurant_id,
    v_channel.channel_id,
    v_hold_token_hash,
    left(v_hold_token, 16),
    v_business_date,
    v_service_key,
    nullif(v_availability->'assignment'->>'room_id', '')::uuid,
    (v_availability->>'starts_at')::timestamptz,
    (v_availability->>'ends_at')::timestamptz,
    v_party_size,
    v_expires_at
  );

  for v_table_id in
    select value
    from jsonb_array_elements(
      coalesce(v_availability->'assignment'->'table_ids', '[]'::jsonb)
    )
  loop
    insert into public.reservation_public_hold_tables (
      restaurant_id,
      hold_id,
      table_id,
      sort_order
    )
    values (
      v_channel.restaurant_id,
      v_hold_id,
      (v_table_id #>> '{}')::uuid,
      v_sort_order
    );
    v_sort_order := v_sort_order + 1;
  end loop;

  if v_sort_order = 0 then
    raise exception 'TABLE_INVENTORY_REQUIRED';
  end if;

  v_response := jsonb_build_object(
    'hold_token', v_hold_token,
    'expires_at', v_expires_at,
    'business_date', v_business_date,
    'service_key', v_service_key,
    'local_time', to_char(v_local_time, 'HH24:MI'),
    'party_size', v_party_size,
    'area_id', v_room_id
  );

  insert into public.reservation_public_idempotency (
    restaurant_id,
    channel_id,
    operation,
    idempotency_key,
    request_hash,
    response,
    expires_at
  )
  values (
    v_channel.restaurant_id,
    v_channel.channel_id,
    'hold',
    p_idempotency_key,
    v_request_hash,
    v_response,
    now() + interval '24 hours'
  );

  return v_response;
end
$$;

create function public.reservation_public_confirm(
  p_public_key text,
  p_origin text,
  p_idempotency_key text,
  p_hold_token text,
  p_guest jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_channel record;
  v_hold public.reservation_public_holds%rowtype;
  v_idempotency public.reservation_public_idempotency%rowtype;
  v_request_hash text;
  v_guest_id uuid;
  v_guest_name text;
  v_email citext;
  v_normalized_email text;
  v_phone text;
  v_normalized_phone text;
  v_status text;
  v_reservation_id uuid := gen_random_uuid();
  v_assignment_group_id uuid := gen_random_uuid();
  v_table record;
  v_response jsonb;
begin
  select *
  into v_channel
  from public.reservation_public_channel_context(p_public_key, p_origin)
  limit 1;
  if not found then
    raise exception 'PUBLIC_CHANNEL_UNAVAILABLE';
  end if;

  if length(coalesce(p_idempotency_key, '')) not between 8 and 120 then
    raise exception 'INVALID_IDEMPOTENCY_KEY';
  end if;
  if coalesce(p_hold_token, '') !~ '^rg_hold_[a-f0-9]{32}$' then
    raise exception 'INVALID_HOLD';
  end if;

  v_request_hash := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'hold_token', p_hold_token,
          'guest', coalesce(p_guest, '{}'::jsonb)
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
  perform pg_advisory_xact_lock(hashtextextended(
    v_channel.channel_id::text || '|confirm|' || p_idempotency_key,
    0
  ));

  select *
  into v_idempotency
  from public.reservation_public_idempotency idem
  where idem.channel_id = v_channel.channel_id
    and idem.operation = 'confirm'
    and idem.idempotency_key = p_idempotency_key
    and idem.expires_at > now();
  if found then
    if v_idempotency.request_hash <> v_request_hash then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return v_idempotency.response;
  end if;

  select *
  into v_hold
  from public.reservation_public_holds hold
  where hold.restaurant_id = v_channel.restaurant_id
    and hold.channel_id = v_channel.channel_id
    and hold.hold_token_hash = encode(
      extensions.digest(p_hold_token, 'sha256'),
      'hex'
    );
  if not found then
    raise exception 'INVALID_HOLD';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    v_channel.restaurant_id::text || '|' || v_hold.business_date::text,
    0
  ));

  select *
  into v_hold
  from public.reservation_public_holds hold
  where hold.id = v_hold.id
  for update;

  if v_hold.consumed_at is not null then
    raise exception 'HOLD_ALREADY_CONSUMED';
  end if;
  if v_hold.released_at is not null or v_hold.expires_at <= now() then
    raise exception 'HOLD_EXPIRED';
  end if;

  if exists (
    select 1
    from public.reservation_public_hold_tables hold_table
    join public.reservation_table_assignments assignment
      on assignment.restaurant_id = hold_table.restaurant_id
     and assignment.table_id = hold_table.table_id
     and assignment.unassigned_at is null
    join public.reservations reservation
      on reservation.restaurant_id = assignment.restaurant_id
     and reservation.id = assignment.reservation_id
    where hold_table.restaurant_id = v_hold.restaurant_id
      and hold_table.hold_id = v_hold.id
      and reservation.status not in ('cancelled', 'no_show', 'finished')
      and assignment.occupied_at
        && tstzrange(v_hold.starts_at, v_hold.ends_at, '[)')
  ) then
    raise exception 'RESERVATION_UNAVAILABLE: This time is no longer available.';
  end if;

  v_guest_name := btrim(p_guest->>'name');
  if coalesce(length(v_guest_name), 0) not between 1 and 160 then
    raise exception 'INVALID_GUEST_NAME';
  end if;

  begin
    v_email := nullif(lower(btrim(p_guest->>'email')), '')::citext;
  exception when others then
    raise exception 'INVALID_EMAIL';
  end;
  if v_email is not null
    and v_email::text !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then
    raise exception 'INVALID_EMAIL';
  end if;
  v_normalized_email := v_email::text;
  v_phone := nullif(btrim(p_guest->>'phone'), '');
  v_normalized_phone := case
    when v_phone is null then null
    else nullif(regexp_replace(v_phone, '[^0-9+]', '', 'g'), '')
  end;
  if v_email is null and v_normalized_phone is null then
    raise exception 'EMAIL_OR_PHONE_REQUIRED';
  end if;

  with candidates as (
    select guest.id
    from public.reservation_guests guest
    where guest.restaurant_id = v_hold.restaurant_id
      and guest.anonymized_at is null
      and case
        when v_normalized_email is not null and v_normalized_phone is not null
          then guest.normalized_email = v_normalized_email
            and guest.normalized_phone = v_normalized_phone
        when v_normalized_email is not null
          then guest.normalized_email = v_normalized_email
        else guest.normalized_phone = v_normalized_phone
      end
  )
  select max(candidate.id::text)::uuid
  into v_guest_id
  from candidates candidate
  having count(*) = 1;

  if v_guest_id is null then
    insert into public.reservation_guests (
      restaurant_id,
      display_name,
      email,
      normalized_email,
      phone,
      normalized_phone,
      language_code
    )
    values (
      v_hold.restaurant_id,
      v_guest_name,
      v_email,
      v_normalized_email,
      v_phone,
      v_normalized_phone,
      coalesce(nullif(btrim(p_guest->>'language_code'), ''), 'en')
    )
    returning id into v_guest_id;
  else
    update public.reservation_guests
    set display_name = v_guest_name,
      email = coalesce(v_email, email),
      normalized_email = coalesce(v_normalized_email, normalized_email),
      phone = coalesce(v_phone, phone),
      normalized_phone = coalesce(v_normalized_phone, normalized_phone)
    where restaurant_id = v_hold.restaurant_id
      and id = v_guest_id;
  end if;

  select case when setting.automatic_confirmation
    then 'confirmed' else 'pending' end
  into v_status
  from public.reservation_service_settings setting
  where setting.restaurant_id = v_hold.restaurant_id
    and setting.service_key = v_hold.service_key;

  update public.reservation_public_holds
  set consumed_at = now()
  where id = v_hold.id;

  insert into public.reservations (
    id,
    restaurant_id,
    guest_id,
    business_date,
    service_key,
    starts_at,
    ends_at,
    party_size,
    status,
    source,
    room_preference_id,
    guest_comment,
    metadata
  )
  values (
    v_reservation_id,
    v_hold.restaurant_id,
    v_guest_id,
    v_hold.business_date,
    v_hold.service_key,
    v_hold.starts_at,
    v_hold.ends_at,
    v_hold.party_size,
    coalesce(v_status, 'pending'),
    'widget',
    v_hold.room_id,
    nullif(btrim(p_guest->>'comment'), ''),
    jsonb_build_object(
      'public_channel_id', v_channel.channel_id,
      'public_hold_id', v_hold.id
    )
  );

  for v_table in
    select hold_table.table_id, hold_table.sort_order
    from public.reservation_public_hold_tables hold_table
    where hold_table.restaurant_id = v_hold.restaurant_id
      and hold_table.hold_id = v_hold.id
    order by hold_table.sort_order, hold_table.table_id
  loop
    insert into public.reservation_table_assignments (
      restaurant_id,
      reservation_id,
      table_id,
      assignment_group_id,
      explanation
    )
    values (
      v_hold.restaurant_id,
      v_reservation_id,
      v_table.table_id,
      v_assignment_group_id,
      'Reserved by the website booking channel.'
    );
  end loop;

  insert into public.reservation_events (
    restaurant_id,
    reservation_id,
    event_type,
    to_status,
    details
  )
  values (
    v_hold.restaurant_id,
    v_reservation_id,
    'created',
    coalesce(v_status, 'pending'),
    jsonb_build_object(
      'source', 'widget',
      'public_channel_id', v_channel.channel_id
    )
  );

  update public.reservation_public_holds
  set reservation_id = v_reservation_id
  where id = v_hold.id;

  v_response := jsonb_build_object(
    'reservation_id', v_reservation_id,
    'status', coalesce(v_status, 'pending'),
    'business_date', v_hold.business_date,
    'service_key', v_hold.service_key,
    'starts_at', v_hold.starts_at,
    'party_size', v_hold.party_size
  );

  insert into public.reservation_public_idempotency (
    restaurant_id,
    channel_id,
    operation,
    idempotency_key,
    request_hash,
    response,
    expires_at
  )
  values (
    v_hold.restaurant_id,
    v_channel.channel_id,
    'confirm',
    p_idempotency_key,
    v_request_hash,
    v_response,
    now() + interval '24 hours'
  );

  return v_response;
end
$$;

create function public.reservation_public_release_hold(
  p_public_key text,
  p_origin text,
  p_hold_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_channel record;
  v_released boolean := false;
begin
  select *
  into v_channel
  from public.reservation_public_channel_context(p_public_key, p_origin)
  limit 1;
  if not found then
    raise exception 'PUBLIC_CHANNEL_UNAVAILABLE';
  end if;
  if coalesce(p_hold_token, '') !~ '^rg_hold_[a-f0-9]{32}$' then
    raise exception 'INVALID_HOLD';
  end if;

  update public.reservation_public_holds
  set released_at = now()
  where restaurant_id = v_channel.restaurant_id
    and channel_id = v_channel.channel_id
    and hold_token_hash = encode(
      extensions.digest(p_hold_token, 'sha256'),
      'hex'
    )
    and consumed_at is null
    and released_at is null;
  v_released := found;

  return jsonb_build_object('released', v_released);
end
$$;

create function public.guard_reservation_capacity_with_public_holds()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_maximum_covers integer;
  v_reserved_covers integer;
  v_held_covers integer;
begin
  if new.status in ('cancelled', 'no_show') then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    new.restaurant_id::text || '|' || new.business_date::text,
    0
  ));

  select setting.maximum_covers
  into v_maximum_covers
  from public.reservation_service_settings setting
  where setting.restaurant_id = new.restaurant_id
    and setting.service_key = new.service_key;

  if v_maximum_covers is null then
    return new;
  end if;

  select coalesce(sum(reservation.party_size), 0)::integer
  into v_reserved_covers
  from public.reservations reservation
  where reservation.restaurant_id = new.restaurant_id
    and reservation.business_date = new.business_date
    and reservation.service_key = new.service_key
    and reservation.id is distinct from new.id
    and reservation.status not in ('cancelled', 'no_show');

  select coalesce(sum(hold.party_size), 0)::integer
  into v_held_covers
  from public.reservation_public_holds hold
  where hold.restaurant_id = new.restaurant_id
    and hold.business_date = new.business_date
    and hold.service_key = new.service_key
    and hold.consumed_at is null
    and hold.released_at is null
    and hold.expires_at > now();

  if v_reserved_covers + v_held_covers + new.party_size > v_maximum_covers then
    raise exception 'RESERVATION_UNAVAILABLE: This service has reached its cover limit.';
  end if;

  return new;
end
$$;

create trigger reservations_guard_public_hold_capacity
  before insert or update of business_date, service_key, party_size, status
  on public.reservations
  for each row execute function public.guard_reservation_capacity_with_public_holds();

revoke all on function public.guard_reservation_capacity_with_public_holds()
  from public, anon, authenticated, service_role;

revoke all on function public.consume_reservation_public_rate_limit(
  text,text,text,text,integer,integer
) from public, anon, authenticated, service_role;
revoke all on function public.reservation_public_context(text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.reservation_public_search_availability(
  text,text,date,text,integer,uuid
) from public, anon, authenticated, service_role;
revoke all on function public.reservation_public_create_hold(
  text,text,text,jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.reservation_public_confirm(
  text,text,text,text,jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.reservation_public_release_hold(
  text,text,text
) from public, anon, authenticated, service_role;

grant execute on function public.consume_reservation_public_rate_limit(
  text,text,text,text,integer,integer
) to service_role;
grant execute on function public.reservation_public_context(text,text)
  to service_role;
grant execute on function public.reservation_public_search_availability(
  text,text,date,text,integer,uuid
) to service_role;
grant execute on function public.reservation_public_create_hold(
  text,text,text,jsonb
) to service_role;
grant execute on function public.reservation_public_confirm(
  text,text,text,text,jsonb
) to service_role;
grant execute on function public.reservation_public_release_hold(
  text,text,text
) to service_role;

comment on table public.reservation_public_channels is
  'Revocable website booking channels. public_key identifies a channel but is not a database credential or a secret.';
comment on table public.reservation_public_holds is
  'Short-lived, server-allocated reservations of exact physical tables before guest confirmation.';
comment on function public.reservation_public_create_hold(text,text,text,jsonb) is
  'Service-role-only booking boundary. Creates one five-minute exact-table hold with idempotent replay.';

notify pgrst, 'reload schema';
