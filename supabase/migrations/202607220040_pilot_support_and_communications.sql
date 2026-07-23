-- Pilot support surfaces: read-only role preview, contextual feedback,
-- operational notices, and lightweight open-shift requests.
begin;

create table public.pilot_feedback (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete set null,
  reporter_profile_id uuid references public.profiles(id) on delete set null,
  category text not null check (category in ('problem', 'suggestion', 'confusing', 'visual')),
  message text not null check (length(btrim(message)) between 5 and 2000),
  page_path text not null check (length(page_path) between 1 and 500),
  app_release text not null check (length(app_release) between 1 and 100),
  actor_role text check (actor_role in ('owner', 'manager', 'employee', 'platform_admin')),
  locale text not null default 'en' check (locale in ('en', 'fr', 'nl')),
  viewport text not null default '',
  user_agent text not null default '',
  status text not null default 'new' check (status in ('new', 'reviewing', 'resolved', 'closed')),
  admin_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.operational_messages (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  sender_profile_id uuid references public.profiles(id) on delete set null,
  body text not null check (length(btrim(body)) between 1 and 1000),
  priority text not null default 'normal' check (priority in ('normal', 'urgent')),
  acknowledgement_required boolean not null default false,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  constraint operational_messages_expiry check (expires_at is null or expires_at > created_at)
);

create table public.operational_message_recipients (
  message_id uuid not null references public.operational_messages(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  employee_id uuid not null,
  read_at timestamptz,
  acknowledged_at timestamptz,
  primary key (message_id, employee_id),
  constraint operational_message_recipients_employee_fk
    foreign key (restaurant_id, employee_id)
    references public.employees(restaurant_id, id) on delete cascade
);

create table public.open_shift_requests (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  business_date date not null,
  service_key text not null check (service_key in ('lunch', 'evening')),
  note text not null default '' check (length(note) <= 500),
  needed_count smallint not null default 1 check (needed_count between 1 and 20),
  status text not null default 'open' check (status in ('open', 'filled', 'cancelled')),
  response_deadline timestamptz not null,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);

create table public.open_shift_responses (
  request_id uuid not null references public.open_shift_requests(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  employee_id uuid not null,
  response text not null check (response in ('available', 'unavailable')),
  responded_at timestamptz not null default now(),
  selected boolean,
  decided_at timestamptz,
  selected_by_profile_id uuid references public.profiles(id) on delete set null,
  primary key (request_id, employee_id),
  constraint open_shift_responses_employee_fk
    foreign key (restaurant_id, employee_id)
    references public.employees(restaurant_id, id) on delete cascade
);

create index pilot_feedback_status_created_idx on public.pilot_feedback(status, created_at desc);
create index operational_messages_restaurant_created_idx on public.operational_messages(restaurant_id, created_at desc);
create index operational_message_recipients_employee_idx on public.operational_message_recipients(restaurant_id, employee_id, read_at);
create index open_shift_requests_restaurant_date_idx on public.open_shift_requests(restaurant_id, business_date desc, status);
create index open_shift_responses_employee_idx on public.open_shift_responses(restaurant_id, employee_id, responded_at desc);

alter table public.pilot_feedback enable row level security;
alter table public.operational_messages enable row level security;
alter table public.operational_message_recipients enable row level security;
alter table public.open_shift_requests enable row level security;
alter table public.open_shift_responses enable row level security;

revoke all on public.pilot_feedback from public, anon, authenticated;
revoke all on public.operational_messages from public, anon, authenticated;
revoke all on public.operational_message_recipients from public, anon, authenticated;
revoke all on public.open_shift_requests from public, anon, authenticated;
revoke all on public.open_shift_responses from public, anon, authenticated;
grant all on public.pilot_feedback to service_role;
grant all on public.operational_messages to service_role;
grant all on public.operational_message_recipients to service_role;
grant all on public.open_shift_requests to service_role;
grant all on public.open_shift_responses to service_role;

create function public.require_communications_context(p_restaurant_id uuid)
returns table (profile_id uuid, actor_role text, employee_id uuid)
language plpgsql
stable
security definer
set search_path = public
as $communications_context$
declare
  v_profile_id uuid := public.current_profile_id();
begin
  if v_profile_id is null then
    raise exception 'Authenticated session required.' using errcode = '42501';
  end if;

  return query
  select m.profile_id, m.role, ea.employee_id
  from public.restaurant_memberships m
  join public.restaurants r on r.id = m.restaurant_id and r.active
  left join public.employee_access ea
    on ea.restaurant_id = m.restaurant_id
   and ea.profile_id = m.profile_id
   and ea.access_status = 'active'
  where m.restaurant_id = p_restaurant_id
    and m.profile_id = v_profile_id
    and m.status = 'active'
  limit 1;

  if not found then
    raise exception 'Active workspace membership required.' using errcode = '42501';
  end if;
end
$communications_context$;

create function public.require_restaurant_manager(p_restaurant_id uuid)
returns table (profile_id uuid, actor_role text)
language plpgsql
stable
security definer
set search_path = public
as $restaurant_manager$
declare
  v_context record;
begin
  select * into v_context from public.require_communications_context(p_restaurant_id);
  if v_context.actor_role not in ('owner', 'manager') then
    raise exception 'Manager access required.' using errcode = '42501';
  end if;
  return query select v_context.profile_id, v_context.actor_role;
end
$restaurant_manager$;

create function public.build_communications_read_model(
  p_restaurant_id uuid,
  p_role text,
  p_employee_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $communications_model$
  select jsonb_build_object(
    'employees', case when p_role in ('owner', 'manager') then coalesce((
      select jsonb_agg(to_jsonb(e) order by e.sort_order, e.display_name)
      from public.employees e
      where e.restaurant_id = p_restaurant_id and e.active
    ), '[]'::jsonb) else '[]'::jsonb end,
    'messages', coalesce((
      select jsonb_agg(
        to_jsonb(m) || jsonb_build_object(
          'sender_name', nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
        ) order by m.created_at desc
      )
      from public.operational_messages m
      left join public.profiles p on p.id = m.sender_profile_id
      where m.restaurant_id = p_restaurant_id
        and m.created_at >= now() - interval '90 days'
        and (p_role in ('owner', 'manager') or exists (
          select 1 from public.operational_message_recipients mr
          where mr.message_id = m.id and mr.employee_id = p_employee_id
        ))
    ), '[]'::jsonb),
    'message_recipients', coalesce((
      select jsonb_agg(to_jsonb(mr))
      from public.operational_message_recipients mr
      join public.operational_messages m on m.id = mr.message_id
      where mr.restaurant_id = p_restaurant_id
        and m.created_at >= now() - interval '90 days'
        and (p_role in ('owner', 'manager') or mr.employee_id = p_employee_id)
    ), '[]'::jsonb),
    'open_shift_requests', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.business_date, r.created_at desc)
      from public.open_shift_requests r
      where r.restaurant_id = p_restaurant_id
        and r.business_date >= current_date - 14
        and (p_role in ('owner', 'manager') or r.status <> 'cancelled')
    ), '[]'::jsonb),
    'open_shift_responses', coalesce((
      select jsonb_agg(to_jsonb(s))
      from public.open_shift_responses s
      join public.open_shift_requests r on r.id = s.request_id
      where s.restaurant_id = p_restaurant_id
        and r.business_date >= current_date - 14
        and (p_role in ('owner', 'manager') or s.employee_id = p_employee_id)
    ), '[]'::jsonb)
  )
$communications_model$;

create function public.get_communications_read_model(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $get_communications$
declare
  v_context record;
begin
  select * into v_context from public.require_communications_context(p_restaurant_id);
  if v_context.actor_role = 'employee' and v_context.employee_id is null then
    raise exception 'Employee access is not linked.' using errcode = '42501';
  end if;
  return public.build_communications_read_model(
    p_restaurant_id, v_context.actor_role, v_context.employee_id
  );
end
$get_communications$;

create function public.send_operational_message(
  p_restaurant_id uuid,
  p_body text,
  p_employee_ids uuid[] default '{}'::uuid[],
  p_priority text default 'normal',
  p_acknowledgement_required boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $send_message$
declare
  v_actor record;
  v_message_id uuid;
  v_recipient_count integer;
begin
  select * into v_actor from public.require_restaurant_manager(p_restaurant_id);
  if length(btrim(coalesce(p_body, ''))) not between 1 and 1000 then
    raise exception 'Message must contain between 1 and 1000 characters.' using errcode = '22023';
  end if;
  if p_priority not in ('normal', 'urgent') then
    raise exception 'Unsupported message priority.' using errcode = '22023';
  end if;

  insert into public.operational_messages (
    restaurant_id, sender_profile_id, body, priority, acknowledgement_required
  ) values (
    p_restaurant_id, v_actor.profile_id, btrim(p_body), p_priority,
    coalesce(p_acknowledgement_required, false)
  ) returning id into v_message_id;

  insert into public.operational_message_recipients (message_id, restaurant_id, employee_id)
  select v_message_id, p_restaurant_id, e.id
  from public.employees e
  where e.restaurant_id = p_restaurant_id
    and e.active
    and (coalesce(cardinality(p_employee_ids), 0) = 0 or e.id = any(p_employee_ids));
  get diagnostics v_recipient_count = row_count;

  if v_recipient_count = 0 then
    raise exception 'Choose at least one active employee.' using errcode = '22023';
  end if;

  return jsonb_build_object('ok', true, 'message_id', v_message_id, 'recipient_count', v_recipient_count);
end
$send_message$;

create function public.mark_operational_message(
  p_restaurant_id uuid,
  p_message_id uuid,
  p_acknowledge boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $mark_message$
declare
  v_context record;
begin
  select * into v_context from public.require_communications_context(p_restaurant_id);
  if v_context.employee_id is null then
    raise exception 'Employee access is required.' using errcode = '42501';
  end if;

  update public.operational_message_recipients
  set read_at = coalesce(read_at, now()),
      acknowledged_at = case when p_acknowledge then coalesce(acknowledged_at, now()) else acknowledged_at end
  where restaurant_id = p_restaurant_id
    and message_id = p_message_id
    and employee_id = v_context.employee_id;
  if not found then
    raise exception 'Message not found.' using errcode = 'P0002';
  end if;
  return jsonb_build_object('ok', true);
end
$mark_message$;

create function public.create_open_shift_request(
  p_restaurant_id uuid,
  p_business_date date,
  p_service_key text,
  p_note text default '',
  p_needed_count integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $create_open_shift$
declare
  v_actor record;
  v_today date;
  v_request_id uuid;
  v_timezone text;
begin
  select * into v_actor from public.require_restaurant_manager(p_restaurant_id);
  select coalesce(timezone, 'Europe/Brussels') into v_timezone
  from public.restaurant_settings where restaurant_id = p_restaurant_id;
  v_timezone := coalesce(v_timezone, 'Europe/Brussels');
  v_today := (now() at time zone v_timezone)::date;
  if p_business_date is null or p_business_date < v_today or p_business_date > v_today + 14 then
    raise exception 'Open-shift date must be within the next 14 days.' using errcode = '22023';
  end if;
  if p_service_key not in ('lunch', 'evening') then
    raise exception 'Choose lunch or evening.' using errcode = '22023';
  end if;
  if coalesce(p_needed_count, 0) not between 1 and 20 then
    raise exception 'Needed employee count must be between 1 and 20.' using errcode = '22023';
  end if;
  if length(coalesce(p_note, '')) > 500 then
    raise exception 'Note is too long.' using errcode = '22023';
  end if;

  insert into public.open_shift_requests (
    restaurant_id, business_date, service_key, note, needed_count,
    response_deadline, created_by_profile_id
  ) values (
    p_restaurant_id, p_business_date, p_service_key, btrim(coalesce(p_note, '')),
    p_needed_count,
    ((p_business_date::text || case when p_service_key = 'lunch' then ' 10:00:00' else ' 16:00:00' end)::timestamp at time zone v_timezone),
    v_actor.profile_id
  ) returning id into v_request_id;

  return jsonb_build_object('ok', true, 'request_id', v_request_id);
end
$create_open_shift$;

create function public.respond_to_open_shift_request(
  p_restaurant_id uuid,
  p_request_id uuid,
  p_response text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $respond_open_shift$
declare
  v_context record;
begin
  select * into v_context from public.require_communications_context(p_restaurant_id);
  if v_context.actor_role <> 'employee' or v_context.employee_id is null then
    raise exception 'Employee access is required.' using errcode = '42501';
  end if;
  if p_response not in ('available', 'unavailable') then
    raise exception 'Choose available or unavailable.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.open_shift_requests r
    where r.id = p_request_id and r.restaurant_id = p_restaurant_id
      and r.status = 'open' and r.response_deadline > now()
  ) then
    raise exception 'This request is no longer open.' using errcode = '22023';
  end if;

  insert into public.open_shift_responses (
    request_id, restaurant_id, employee_id, response, responded_at,
    selected, decided_at, selected_by_profile_id
  ) values (
    p_request_id, p_restaurant_id, v_context.employee_id, p_response, now(),
    null, null, null
  ) on conflict (request_id, employee_id) do update set
    response = excluded.response,
    responded_at = now(),
    selected = null,
    decided_at = null,
    selected_by_profile_id = null;

  return jsonb_build_object('ok', true);
end
$respond_open_shift$;

create function public.confirm_open_shift_request(
  p_restaurant_id uuid,
  p_request_id uuid,
  p_selected_employee_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $confirm_open_shift$
declare
  v_actor record;
  v_request public.open_shift_requests%rowtype;
  v_selected_count integer := coalesce(cardinality(p_selected_employee_ids), 0);
begin
  select * into v_actor from public.require_restaurant_manager(p_restaurant_id);
  select * into v_request from public.open_shift_requests
  where id = p_request_id and restaurant_id = p_restaurant_id for update;
  if not found or v_request.status <> 'open' then
    raise exception 'This request is no longer open.' using errcode = '22023';
  end if;
  if v_selected_count = 0 or v_selected_count > v_request.needed_count then
    raise exception 'Select between one and the requested number of employees.' using errcode = '22023';
  end if;
  if (
    select count(*) from public.open_shift_responses s
    where s.request_id = p_request_id
      and s.response = 'available'
      and s.employee_id = any(p_selected_employee_ids)
  ) <> v_selected_count then
    raise exception 'Only available respondents can be selected.' using errcode = '22023';
  end if;

  update public.open_shift_responses
  set selected = employee_id = any(p_selected_employee_ids),
      decided_at = now(),
      selected_by_profile_id = v_actor.profile_id
  where request_id = p_request_id and response = 'available';
  update public.open_shift_requests
  set status = 'filled', closed_at = now(), updated_at = now()
  where id = p_request_id;
  return jsonb_build_object('ok', true, 'selected_count', v_selected_count);
end
$confirm_open_shift$;

create function public.cancel_open_shift_request(p_restaurant_id uuid, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $cancel_open_shift$
begin
  perform public.require_restaurant_manager(p_restaurant_id);
  update public.open_shift_requests
  set status = 'cancelled', closed_at = now(), updated_at = now()
  where id = p_request_id and restaurant_id = p_restaurant_id and status = 'open';
  if not found then raise exception 'Open request not found.' using errcode = 'P0002'; end if;
  return jsonb_build_object('ok', true);
end
$cancel_open_shift$;

create function public.submit_pilot_feedback(
  p_restaurant_id uuid,
  p_category text,
  p_message text,
  p_page_path text,
  p_app_release text,
  p_actor_role text,
  p_locale text,
  p_viewport text,
  p_user_agent text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $submit_feedback$
declare
  v_profile_id uuid := public.current_profile_id();
  v_id uuid;
begin
  if v_profile_id is null then raise exception 'Authenticated session required.' using errcode = '42501'; end if;
  if p_restaurant_id is not null
     and not public.is_platform_admin(v_profile_id)
     and not public.is_restaurant_member(p_restaurant_id) then
    raise exception 'Restaurant access required.' using errcode = '42501';
  end if;
  if p_category not in ('problem', 'suggestion', 'confusing', 'visual') then
    raise exception 'Unsupported feedback category.' using errcode = '22023';
  end if;
  insert into public.pilot_feedback (
    restaurant_id, reporter_profile_id, category, message, page_path,
    app_release, actor_role, locale, viewport, user_agent
  ) values (
    p_restaurant_id, v_profile_id, p_category, btrim(p_message), left(p_page_path, 500),
    left(coalesce(nullif(p_app_release, ''), 'development'), 100),
    case when p_actor_role in ('owner','manager','employee','platform_admin') then p_actor_role else null end,
    case when p_locale in ('en','fr','nl') then p_locale else 'en' end,
    left(coalesce(p_viewport, ''), 100), left(coalesce(p_user_agent, ''), 1000)
  ) returning id into v_id;
  return jsonb_build_object('ok', true, 'feedback_id', v_id);
end
$submit_feedback$;

create function public.get_admin_feedback()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $admin_feedback$
begin
  perform public.require_platform_admin();
  return coalesce((
    select jsonb_agg(
      to_jsonb(f) || jsonb_build_object(
        'restaurant_name', r.name,
        'reporter_name', nullif(btrim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), ''),
        'reporter_email', p.email
      ) order by f.created_at desc
    )
    from public.pilot_feedback f
    left join public.restaurants r on r.id = f.restaurant_id
    left join public.profiles p on p.id = f.reporter_profile_id
  ), '[]'::jsonb);
end
$admin_feedback$;

create function public.admin_update_feedback(p_feedback_id uuid, p_status text, p_admin_note text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $admin_update_feedback$
declare
  v_admin uuid := public.require_platform_admin();
begin
  if p_status not in ('new','reviewing','resolved','closed') then
    raise exception 'Unsupported feedback status.' using errcode = '22023';
  end if;
  update public.pilot_feedback set
    status = p_status,
    admin_note = left(coalesce(p_admin_note, ''), 2000),
    resolved_at = case when p_status in ('resolved','closed') then coalesce(resolved_at, now()) else null end,
    updated_at = now()
  where id = p_feedback_id;
  if not found then raise exception 'Feedback not found.' using errcode = 'P0002'; end if;
  insert into public.platform_admin_events (admin_profile_id, action, target_type, target_id, detail)
  values (v_admin, 'feedback_updated', 'pilot_feedback', p_feedback_id, jsonb_build_object('status', p_status));
  return jsonb_build_object('ok', true);
end
$admin_update_feedback$;

create function public.get_preview_personas(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $preview_personas$
declare
  v_profile_id uuid := public.current_profile_id();
  v_is_admin boolean;
  v_is_manager boolean;
begin
  if v_profile_id is null then raise exception 'Authenticated session required.' using errcode = '42501'; end if;
  v_is_admin := public.is_platform_admin(v_profile_id);
  select exists (
    select 1 from public.restaurant_memberships m
    where m.restaurant_id = p_restaurant_id and m.profile_id = v_profile_id
      and m.status = 'active' and m.role in ('owner','manager')
  ) into v_is_manager;
  if not v_is_admin and not v_is_manager then
    raise exception 'Preview access denied.' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(persona order by persona->>'role', lower(persona->>'display_name'))
    from (
      select jsonb_build_object(
        'key', 'employee:' || e.id,
        'role', 'employee',
        'employee_id', e.id,
        'display_name', e.display_name,
        'detail', case when ea.profile_id is null then 'No account yet' else 'Employee account' end
      ) persona
      from public.employees e
      left join public.employee_access ea
        on ea.restaurant_id = e.restaurant_id and ea.employee_id = e.id and ea.access_status = 'active'
      where e.restaurant_id = p_restaurant_id and e.active
      union all
      select jsonb_build_object(
        'key', m.role || ':' || m.profile_id,
        'role', m.role,
        'employee_id', ea.employee_id,
        'display_name', coalesce(nullif(btrim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), ''), p.email::text),
        'detail', p.email::text
      ) persona
      from public.restaurant_memberships m
      join public.profiles p on p.id = m.profile_id
      left join public.employee_access ea
        on ea.restaurant_id = m.restaurant_id and ea.profile_id = m.profile_id and ea.access_status = 'active'
      where v_is_admin and m.restaurant_id = p_restaurant_id and m.status = 'active'
        and m.role in ('owner','manager')
    ) personas
  ), '[]'::jsonb);
end
$preview_personas$;

create function public.require_preview_access(p_restaurant_id uuid, p_role text, p_employee_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $preview_access$
declare
  v_profile_id uuid := public.current_profile_id();
  v_is_admin boolean;
begin
  if v_profile_id is null then raise exception 'Authenticated session required.' using errcode = '42501'; end if;
  v_is_admin := public.is_platform_admin(v_profile_id);
  if p_role not in ('owner','manager','employee') then raise exception 'Unsupported preview role.' using errcode = '22023'; end if;
  if not v_is_admin and not exists (
    select 1 from public.restaurant_memberships m
    where m.restaurant_id = p_restaurant_id and m.profile_id = v_profile_id
      and m.status = 'active' and m.role in ('owner','manager') and p_role = 'employee'
  ) then raise exception 'Preview access denied.' using errcode = '42501'; end if;
  if not exists (select 1 from public.restaurants r where r.id = p_restaurant_id and r.active) then
    raise exception 'Restaurant not found.' using errcode = 'P0002';
  end if;
  if p_role = 'employee' and not exists (
    select 1 from public.employees e where e.restaurant_id = p_restaurant_id and e.id = p_employee_id and e.active
  ) then raise exception 'Active employee required.' using errcode = '22023'; end if;
end
$preview_access$;

create function public.get_preview_bootstrap(p_restaurant_id uuid, p_role text, p_employee_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $preview_bootstrap$
begin
  perform public.require_preview_access(p_restaurant_id, p_role, p_employee_id);
  return public.build_workspace_bootstrap_read_model(p_restaurant_id, p_employee_id);
end
$preview_bootstrap$;

create function public.get_preview_operations(
  p_restaurant_id uuid,
  p_role text,
  p_employee_id uuid,
  p_from_date date,
  p_to_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $preview_operations$
begin
  perform public.require_preview_access(p_restaurant_id, p_role, p_employee_id);
  if p_from_date is null or p_to_date is null or p_to_date < p_from_date or p_to_date - p_from_date > 400 then
    raise exception 'Preview date range is invalid.' using errcode = '22023';
  end if;
  if p_role = 'employee' then
    return public.build_employee_operations_read_model(p_restaurant_id, p_employee_id, p_from_date, p_to_date);
  end if;
  return public.build_manager_operations_read_model(p_restaurant_id, p_role, p_from_date, p_to_date);
end
$preview_operations$;

insert into public.notification_types (
  code, audience, label, description, default_action, default_target_module,
  default_in_app_enabled, default_push_enabled, sort_order, active
) values
  ('operational_message_received', 'employee', 'New message', 'A manager sent an operational message.', 'popup', 'messages', true, true, 270, true),
  ('open_shift_request_created', 'employee', 'Help needed', 'A manager asked who can work a service.', 'popup', 'messages', true, true, 280, true),
  ('open_shift_response_received', 'manager', 'Open shift response', 'An employee responded to an open-shift request.', 'popup', 'messages', true, true, 140, true),
  ('open_shift_selection_decided', 'employee', 'Open shift decided', 'A manager confirmed an open-shift request.', 'popup', 'messages', true, true, 290, true)
on conflict (code) do update set
  audience = excluded.audience,
  label = excluded.label,
  description = excluded.description,
  default_action = excluded.default_action,
  default_target_module = excluded.default_target_module,
  default_in_app_enabled = excluded.default_in_app_enabled,
  default_push_enabled = excluded.default_push_enabled,
  sort_order = excluded.sort_order,
  active = true,
  updated_at = now();

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
  if p_from_date is null or p_to_date is null or p_to_date < p_from_date or p_to_date - p_from_date > 63 then
    raise exception 'Push notification read range is invalid.';
  end if;
  select m.role, ea.employee_id, coalesce(s.timezone, 'Europe/Brussels')
  into v_role, v_employee_id, v_timezone
  from public.restaurant_memberships m
  join public.restaurants r on r.id = m.restaurant_id and r.active
  left join public.employee_access ea
    on ea.restaurant_id = m.restaurant_id and ea.profile_id = m.profile_id and ea.access_status = 'active'
  left join public.restaurant_settings s on s.restaurant_id = m.restaurant_id
  where m.restaurant_id = p_restaurant_id and m.profile_id = p_profile_id and m.status = 'active';
  if v_role is null or (v_role = 'employee' and v_employee_id is null) then return null; end if;
  return jsonb_build_object(
    'role', v_role,
    'employee_id', v_employee_id,
    'timezone', v_timezone,
    'operations', case when v_role = 'employee' then public.build_employee_operations_read_model(
      p_restaurant_id, v_employee_id, p_from_date, p_to_date
    ) else public.build_manager_operations_read_model(
      p_restaurant_id, v_role, p_from_date, p_to_date
    ) end,
    'team', case when v_role in ('owner','manager') then public.build_team_read_model(p_restaurant_id, v_role) else null end,
    'communications', public.build_communications_read_model(p_restaurant_id, v_role, v_employee_id)
  );
end
$get_push_dispatch_context$;

alter table public.workspace_realtime_events drop constraint workspace_realtime_events_event;
alter table public.workspace_realtime_events add constraint workspace_realtime_events_event
  check (event in ('planning-saved','actuals-updated','team-updated','restaurant-updated','notification-refresh','communications-updated'));
alter table public.workspace_realtime_events drop constraint workspace_realtime_events_source;
alter table public.workspace_realtime_events add constraint workspace_realtime_events_source
  check (source in ('planning','actuals','team','restaurant','badge','system','communications'));

create or replace function public.publish_workspace_realtime_event(p_restaurant_id uuid, p_event text, p_source text)
returns bigint
language plpgsql
security definer
set search_path = public
as $publish_workspace_realtime_event$
declare v_sequence bigint;
begin
  if auth.uid() is null or not public.is_restaurant_member(p_restaurant_id) then
    raise exception 'Not authorized for this restaurant.' using errcode = '42501';
  end if;
  if p_event not in ('planning-saved','actuals-updated','team-updated','restaurant-updated','notification-refresh','communications-updated') then
    raise exception 'Unsupported workspace event.' using errcode = '22023';
  end if;
  if p_source not in ('planning','actuals','team','restaurant','badge','system','communications') then
    raise exception 'Unsupported workspace event source.' using errcode = '22023';
  end if;
  insert into public.workspace_realtime_events (restaurant_id,event,source,sequence,updated_at)
  values (p_restaurant_id,p_event,p_source,1,now())
  on conflict (restaurant_id) do update set event=excluded.event, source=excluded.source,
    sequence=public.workspace_realtime_events.sequence + 1, updated_at=now()
  returning sequence into v_sequence;
  return v_sequence;
end
$publish_workspace_realtime_event$;

revoke all on function public.require_communications_context(uuid) from public, anon, authenticated;
revoke all on function public.require_restaurant_manager(uuid) from public, anon, authenticated;
revoke all on function public.build_communications_read_model(uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.require_preview_access(uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.get_push_dispatch_context(uuid,uuid,date,date) from public, anon, authenticated, service_role;
grant execute on function public.get_push_dispatch_context(uuid,uuid,date,date) to service_role;

revoke all on function public.get_communications_read_model(uuid) from public, anon, authenticated;
revoke all on function public.send_operational_message(uuid,text,uuid[],text,boolean) from public, anon, authenticated;
revoke all on function public.mark_operational_message(uuid,uuid,boolean) from public, anon, authenticated;
revoke all on function public.create_open_shift_request(uuid,date,text,text,integer) from public, anon, authenticated;
revoke all on function public.respond_to_open_shift_request(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.confirm_open_shift_request(uuid,uuid,uuid[]) from public, anon, authenticated;
revoke all on function public.cancel_open_shift_request(uuid,uuid) from public, anon, authenticated;
revoke all on function public.submit_pilot_feedback(uuid,text,text,text,text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.get_admin_feedback() from public, anon, authenticated;
revoke all on function public.admin_update_feedback(uuid,text,text) from public, anon, authenticated;
revoke all on function public.get_preview_personas(uuid) from public, anon, authenticated;
revoke all on function public.get_preview_bootstrap(uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.get_preview_operations(uuid,text,uuid,date,date) from public, anon, authenticated;

grant execute on function public.get_communications_read_model(uuid) to authenticated;
grant execute on function public.send_operational_message(uuid,text,uuid[],text,boolean) to authenticated;
grant execute on function public.mark_operational_message(uuid,uuid,boolean) to authenticated;
grant execute on function public.create_open_shift_request(uuid,date,text,text,integer) to authenticated;
grant execute on function public.respond_to_open_shift_request(uuid,uuid,text) to authenticated;
grant execute on function public.confirm_open_shift_request(uuid,uuid,uuid[]) to authenticated;
grant execute on function public.cancel_open_shift_request(uuid,uuid) to authenticated;
grant execute on function public.submit_pilot_feedback(uuid,text,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.get_admin_feedback() to authenticated;
grant execute on function public.admin_update_feedback(uuid,text,text) to authenticated;
grant execute on function public.get_preview_personas(uuid) to authenticated;
grant execute on function public.get_preview_bootstrap(uuid,text,uuid) to authenticated;
grant execute on function public.get_preview_operations(uuid,text,uuid,date,date) to authenticated;

commit;
