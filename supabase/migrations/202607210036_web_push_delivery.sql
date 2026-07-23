-- Add standards-based Web Push without creating a second notification model.
-- Browser subscriptions are profile-owned; restaurant preferences remain in
-- notification_preferences and delivery is deduplicated per device and source.
begin;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  locale text not null default 'en',
  device_name text,
  user_agent text,
  active boolean not null default true,
  enabled_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_subscriptions_endpoint_https
    check (endpoint ~ '^https://[^[:space:]]+$' and length(endpoint) <= 2048),
  constraint push_subscriptions_key_bounds
    check (length(p256dh) between 20 and 500 and length(auth_key) between 8 and 200),
  constraint push_subscriptions_locale
    check (locale in ('en', 'fr', 'nl')),
  constraint push_subscriptions_device_name_bounds
    check (device_name is null or length(device_name) between 1 and 80),
  constraint push_subscriptions_user_agent_bounds
    check (user_agent is null or length(user_agent) <= 512)
);

create index push_subscriptions_profile_active_idx
  on public.push_subscriptions (profile_id, active, updated_at desc);

create table public.push_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null
    references public.push_subscriptions(id) on delete cascade,
  restaurant_id uuid not null
    references public.restaurants(id) on delete cascade,
  notification_key text not null,
  notification_type text not null
    references public.notification_types(code) on update cascade,
  status text not null default 'pending',
  attempt_count integer not null default 1,
  last_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_notification_deliveries_key_bounds
    check (length(notification_key) between 3 and 240 and notification_key !~ '[[:space:]]'),
  constraint push_notification_deliveries_status
    check (status in ('pending', 'sent', 'failed')),
  constraint push_notification_deliveries_attempt_count
    check (attempt_count between 1 and 20),
  constraint push_notification_deliveries_error_bounds
    check (error_message is null or length(error_message) <= 1000),
  constraint push_notification_deliveries_unique
    unique (subscription_id, restaurant_id, notification_key)
);

create index push_notification_deliveries_retry_idx
  on public.push_notification_deliveries (status, last_attempt_at)
  where status <> 'sent';

comment on table public.push_subscriptions is
  'Private Web Push capability endpoints registered by authenticated profiles.';
comment on table public.push_notification_deliveries is
  'Server-only deduplication and retry evidence for Web Push delivery.';
comment on column public.notification_types.default_push_enabled is
  'Default phone channel preference used only after a profile explicitly enables Web Push.';

create trigger set_push_subscriptions_updated_at
before update on public.push_subscriptions
for each row execute function public.set_notification_updated_at();

create trigger set_push_notification_deliveries_updated_at
before update on public.push_notification_deliveries
for each row execute function public.set_notification_updated_at();

alter table public.push_subscriptions enable row level security;
alter table public.push_notification_deliveries enable row level security;

create or replace function public.register_push_subscription(
  p_restaurant_id uuid,
  p_endpoint text,
  p_p256dh text,
  p_auth_key text,
  p_locale text default 'en',
  p_device_name text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $register_push_subscription$
declare
  v_profile_id uuid := public.current_profile_id();
  v_subscription_id uuid;
  v_locale text := lower(split_part(coalesce(p_locale, 'en'), '-', 1));
begin
  if v_profile_id is null then
    raise exception 'Authenticated profile required.';
  end if;
  if not exists (
    select 1
    from public.restaurant_memberships m
    join public.restaurants r on r.id = m.restaurant_id and r.active
    where m.restaurant_id = p_restaurant_id
      and m.profile_id = v_profile_id
      and m.status = 'active'
  ) then
    raise exception 'Active restaurant membership required.';
  end if;
  if btrim(coalesce(p_endpoint, '')) !~ '^https://[^[:space:]]+$'
      or length(btrim(p_endpoint)) > 2048 then
    raise exception 'A valid HTTPS push endpoint is required.';
  end if;
  if length(btrim(coalesce(p_p256dh, ''))) not between 20 and 500
      or length(btrim(coalesce(p_auth_key, ''))) not between 8 and 200 then
    raise exception 'Valid Web Push encryption keys are required.';
  end if;
  if v_locale not in ('en', 'fr', 'nl') then
    v_locale := 'en';
  end if;

  insert into public.push_subscriptions (
    profile_id, endpoint, p256dh, auth_key, locale, device_name,
    user_agent, active, enabled_at, last_seen_at, revoked_at
  )
  values (
    v_profile_id,
    btrim(p_endpoint),
    btrim(p_p256dh),
    btrim(p_auth_key),
    v_locale,
    nullif(left(btrim(coalesce(p_device_name, '')), 80), ''),
    nullif(left(btrim(coalesce(p_user_agent, '')), 512), ''),
    true,
    now(),
    now(),
    null
  )
  on conflict (endpoint) do update set
    profile_id = excluded.profile_id,
    p256dh = excluded.p256dh,
    auth_key = excluded.auth_key,
    locale = excluded.locale,
    device_name = excluded.device_name,
    user_agent = excluded.user_agent,
    active = true,
    enabled_at = case
      when public.push_subscriptions.active then public.push_subscriptions.enabled_at
      else now()
    end,
    last_seen_at = now(),
    revoked_at = null
  returning id into v_subscription_id;

  return jsonb_build_object('ok', true, 'subscription_id', v_subscription_id);
end
$register_push_subscription$;

create or replace function public.unregister_push_subscription(p_endpoint text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $unregister_push_subscription$
declare
  v_profile_id uuid := public.current_profile_id();
  v_changed integer;
begin
  if v_profile_id is null then
    raise exception 'Authenticated profile required.';
  end if;

  update public.push_subscriptions
  set active = false,
      revoked_at = now(),
      last_seen_at = now()
  where profile_id = v_profile_id
    and endpoint = btrim(coalesce(p_endpoint, ''))
    and active;
  get diagnostics v_changed = row_count;

  return jsonb_build_object('ok', true, 'disabled', v_changed > 0);
end
$unregister_push_subscription$;

create or replace function public.get_push_dispatch_context(
  p_profile_id uuid,
  p_restaurant_id uuid,
  p_from_date date,
  p_to_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $get_push_dispatch_context$
declare
  v_role text;
  v_employee_id uuid;
  v_timezone text;
begin
  if p_from_date is null or p_to_date is null or p_to_date < p_from_date
      or p_to_date - p_from_date > 63 then
    raise exception 'Push notification read range is invalid.';
  end if;

  select m.role, ea.employee_id, coalesce(s.timezone, 'Europe/Brussels')
  into v_role, v_employee_id, v_timezone
  from public.restaurant_memberships m
  join public.restaurants r
    on r.id = m.restaurant_id and r.active
  left join public.employee_access ea
    on ea.restaurant_id = m.restaurant_id
   and ea.profile_id = m.profile_id
   and ea.access_status = 'active'
  left join public.restaurant_settings s on s.restaurant_id = m.restaurant_id
  where m.restaurant_id = p_restaurant_id
    and m.profile_id = p_profile_id
    and m.status = 'active';

  if v_role is null or (v_role = 'employee' and v_employee_id is null) then
    return null;
  end if;

  return jsonb_build_object(
    'role', v_role,
    'employee_id', v_employee_id,
    'timezone', v_timezone,
    'operations', case
      when v_role = 'employee' then public.build_employee_operations_read_model(
        p_restaurant_id, v_employee_id, p_from_date, p_to_date
      )
      else public.build_manager_operations_read_model(
        p_restaurant_id, v_role, p_from_date, p_to_date
      )
    end,
    'team', case
      when v_role in ('owner', 'manager') then public.build_team_read_model(
        p_restaurant_id, v_role
      )
      else null
    end
  );
end
$get_push_dispatch_context$;

-- Push remains opt-in at the browser level. These defaults decide which
-- channels are selected after the user explicitly connects a phone.
update public.notification_types
set default_push_enabled = code in (
  'absence_request_submitted',
  'employee_unavailable_on_planned_shift',
  'employee_forgot_badge_out',
  'employee_badged_late',
  'employee_no_show',
  'worked_during_approved_absence',
  'planning_published',
  'absence_request_decided',
  'own_forgot_badge_out',
  'shift_soon'
),
updated_at = now();

revoke all on public.push_subscriptions from public, anon, authenticated;
revoke all on public.push_notification_deliveries from public, anon, authenticated;
grant all on public.push_subscriptions to service_role;
grant all on public.push_notification_deliveries to service_role;

revoke all on function public.register_push_subscription(uuid,text,text,text,text,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.unregister_push_subscription(text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_push_dispatch_context(uuid,uuid,date,date)
  from public, anon, authenticated, service_role;

grant execute on function public.register_push_subscription(uuid,text,text,text,text,text,text)
  to authenticated;
grant execute on function public.unregister_push_subscription(text)
  to authenticated;
grant execute on function public.get_push_dispatch_context(uuid,uuid,date,date)
  to service_role;

commit;
