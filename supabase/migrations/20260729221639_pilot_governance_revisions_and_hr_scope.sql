-- Pilot governance, optimistic configuration saves and sensitive HR scope.
--
-- This migration is additive. The proven V501 bootstrap and existing save
-- implementations remain intact behind revision-aware wrappers.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';
select pg_advisory_xact_lock(
  hashtextextended('restogogo:20260729221639:pilot-governance', 0)
);

-- ---------------------------------------------------------------------------
-- Controlled pilot access
-- ---------------------------------------------------------------------------

create table public.pilot_access_requests (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  email citext not null,
  status text not null default 'pending',
  request_note text,
  review_note text,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by_profile_id uuid references public.profiles(id) on delete set null,
  constraint pilot_access_requests_status_check
    check (status in ('pending', 'approved', 'declined'))
);

alter table public.pilot_access_requests enable row level security;
revoke all on table public.pilot_access_requests from public, anon, authenticated;
grant all on table public.pilot_access_requests to service_role;

create function public.request_pilot_access(p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $request$
declare
  v_user_id uuid := auth.uid();
  v_email citext := nullif(lower(btrim(coalesce(auth.jwt()->>'email', ''))), '')::citext;
  v_status text;
begin
  if v_user_id is null or v_email is null then
    raise exception 'A confirmed signed-in account is required.'
      using errcode = '42501';
  end if;

  insert into public.pilot_access_requests (
    auth_user_id, email, request_note, status, requested_at
  )
  values (
    v_user_id, v_email, nullif(btrim(p_note), ''), 'pending', now()
  )
  on conflict (auth_user_id) do update set
    email = excluded.email,
    request_note = coalesce(excluded.request_note, pilot_access_requests.request_note),
    status = case
      when pilot_access_requests.status = 'approved' then 'approved'
      else 'pending'
    end,
    requested_at = case
      when pilot_access_requests.status = 'approved' then pilot_access_requests.requested_at
      else now()
    end,
    reviewed_at = case
      when pilot_access_requests.status = 'approved' then pilot_access_requests.reviewed_at
      else null
    end,
    reviewed_by_profile_id = case
      when pilot_access_requests.status = 'approved' then pilot_access_requests.reviewed_by_profile_id
      else null
    end,
    review_note = case
      when pilot_access_requests.status = 'approved' then pilot_access_requests.review_note
      else null
    end
  returning status into v_status;

  return jsonb_build_object('status', v_status, 'email', v_email);
end
$request$;

create function public.get_pilot_access_state()
returns jsonb
language sql
stable
security definer
set search_path = public
as $state$
  select jsonb_build_object(
    'status', coalesce((
      select r.status
      from public.pilot_access_requests r
      where r.auth_user_id = auth.uid()
    ), 'not_requested'),
    'requested_at', (
      select r.requested_at
      from public.pilot_access_requests r
      where r.auth_user_id = auth.uid()
    ),
    'reviewed_at', (
      select r.reviewed_at
      from public.pilot_access_requests r
      where r.auth_user_id = auth.uid()
    ),
    'can_create_workspace',
      exists (
        select 1
        from public.pilot_access_requests r
        where r.auth_user_id = auth.uid() and r.status = 'approved'
      )
      or exists (
        select 1
        from public.restaurant_memberships m
        join public.profiles p on p.id = m.profile_id
        where p.auth_user_id = auth.uid()
          and m.role = 'owner'
          and m.status = 'active'
      )
      or public.is_platform_admin(public.current_profile_id())
  )
$state$;

create function public.admin_list_pilot_access_requests()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $list$
begin
  perform public.require_platform_admin();
  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'auth_user_id', r.auth_user_id,
        'email', r.email,
        'status', r.status,
        'request_note', r.request_note,
        'review_note', r.review_note,
        'requested_at', r.requested_at,
        'reviewed_at', r.reviewed_at
      )
      order by
        case r.status when 'pending' then 0 when 'approved' then 1 else 2 end,
        r.requested_at desc
    )
    from public.pilot_access_requests r
  ), '[]'::jsonb);
end
$list$;

create function public.admin_review_pilot_access(
  p_auth_user_id uuid,
  p_approved boolean,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $review$
declare
  v_admin uuid := public.require_platform_admin();
  v_status text := case when p_approved then 'approved' else 'declined' end;
  v_email citext;
begin
  update public.pilot_access_requests
  set status = v_status,
      review_note = nullif(btrim(p_note), ''),
      reviewed_at = now(),
      reviewed_by_profile_id = v_admin
  where auth_user_id = p_auth_user_id
  returning email into v_email;

  if v_email is null then
    raise exception 'Pilot access request not found.' using errcode = 'P0002';
  end if;

  insert into public.platform_admin_events (
    admin_profile_id, action, target_type, target_id, detail
  )
  values (
    v_admin,
    case when p_approved then 'pilot_access_approved' else 'pilot_access_declined' end,
    'auth_user',
    p_auth_user_id,
    jsonb_build_object('email', v_email, 'note', nullif(btrim(p_note), ''))
  );

  return jsonb_build_object('ok', true, 'status', v_status, 'email', v_email);
end
$review$;

create function public.enforce_controlled_restaurant_creation()
returns trigger
language plpgsql
security definer
set search_path = public
as $guard$
declare
  v_user_id uuid := auth.uid();
  v_profile_id uuid;
begin
  -- Bootstrap, seed and service-role operations have no end-user auth context.
  if v_user_id is null then
    return new;
  end if;

  select p.id into v_profile_id
  from public.profiles p
  where p.auth_user_id = v_user_id;

  if public.is_platform_admin(v_profile_id)
      or exists (
        select 1
        from public.restaurant_memberships m
        where m.profile_id = v_profile_id
          and m.role = 'owner'
          and m.status = 'active'
      )
      or exists (
        select 1
        from public.pilot_access_requests r
        where r.auth_user_id = v_user_id
          and r.status = 'approved'
      ) then
    return new;
  end if;

  raise exception 'Pilot access approval is required before creating a restaurant.'
    using errcode = '42501', detail = 'PILOT_ACCESS_REQUIRED';
end
$guard$;

drop trigger if exists enforce_controlled_restaurant_creation on public.restaurants;
create trigger enforce_controlled_restaurant_creation
before insert on public.restaurants
for each row execute function public.enforce_controlled_restaurant_creation();

-- Existing owners are grandfathered into the controlled pilot.
insert into public.pilot_access_requests (
  auth_user_id, email, status, request_note, review_note, requested_at, reviewed_at
)
select distinct
  p.auth_user_id,
  p.email,
  'approved',
  'Existing restaurant owner.',
  'Grandfathered when controlled pilot access was introduced.',
  coalesce(p.created_at, now()),
  now()
from public.restaurant_memberships m
join public.profiles p on p.id = m.profile_id
where m.role = 'owner'
  and m.status = 'active'
  and p.auth_user_id is not null
  and p.email is not null
on conflict (auth_user_id) do nothing;

-- ---------------------------------------------------------------------------
-- Server-owned module entitlements
-- ---------------------------------------------------------------------------

create table public.restaurant_module_entitlements (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  module_key text not null,
  state text not null default 'disabled',
  updated_at timestamptz not null default now(),
  updated_by_profile_id uuid references public.profiles(id) on delete set null,
  primary key (restaurant_id, module_key),
  constraint restaurant_module_entitlements_key_check
    check (module_key ~ '^[a-z][a-z0-9-]{1,63}$'),
  constraint restaurant_module_entitlements_state_check
    check (state in ('enabled', 'preview', 'disabled'))
);

alter table public.restaurant_module_entitlements enable row level security;
revoke all on table public.restaurant_module_entitlements from public, anon, authenticated;
grant all on table public.restaurant_module_entitlements to service_role;

create function public.seed_restaurant_module_entitlements()
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
      ('reservations', 'disabled'),
      ('payroll', 'disabled'),
      ('reports', 'disabled')
  ) as seed(module_key, state)
  on conflict (restaurant_id, module_key) do nothing;
  return new;
end
$seed$;

drop trigger if exists seed_restaurant_module_entitlements on public.restaurants;
create trigger seed_restaurant_module_entitlements
after insert on public.restaurants
for each row execute function public.seed_restaurant_module_entitlements();

insert into public.restaurant_module_entitlements (
  restaurant_id, module_key, state
)
select
  r.id,
  seed.module_key,
  case
    when seed.module_key = 'reservations'
      and exists (
        select 1
        from public.reservations reservation
        where reservation.restaurant_id = r.id
      )
      then 'enabled'
    else seed.state
  end
from public.restaurants r
cross join (
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
    ('reservations', 'disabled'),
    ('payroll', 'disabled'),
    ('reports', 'disabled')
) as seed(module_key, state)
on conflict (restaurant_id, module_key) do nothing;

create function public.restaurant_module_entitlements_json(p_restaurant_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $entitlements$
  select coalesce(
    jsonb_object_agg(e.module_key, e.state order by e.module_key),
    '{}'::jsonb
  )
  from public.restaurant_module_entitlements e
  where e.restaurant_id = p_restaurant_id
$entitlements$;

create function public.restaurant_module_enabled(
  p_restaurant_id uuid,
  p_module_key text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $enabled$
  select coalesce((
    select e.state in ('enabled', 'preview')
    from public.restaurant_module_entitlements e
    where e.restaurant_id = p_restaurant_id
      and e.module_key = p_module_key
  ), false)
$enabled$;

create function public.require_restaurant_module(
  p_restaurant_id uuid,
  p_module_key text
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $require$
begin
  if not public.restaurant_module_enabled(p_restaurant_id, p_module_key) then
    raise exception 'This module is not enabled for the restaurant.'
      using errcode = '42501', detail = 'MODULE_NOT_ENABLED:' || p_module_key;
  end if;
end
$require$;

create function public.admin_set_restaurant_module_entitlement(
  p_restaurant_id uuid,
  p_module_key text,
  p_state text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $set_entitlement$
declare
  v_admin uuid := public.require_platform_admin();
begin
  if p_module_key !~ '^[a-z][a-z0-9-]{1,63}$'
      or p_state not in ('enabled', 'preview', 'disabled') then
    raise exception 'Invalid module entitlement.' using errcode = '22023';
  end if;

  insert into public.restaurant_module_entitlements (
    restaurant_id, module_key, state, updated_by_profile_id
  )
  values (p_restaurant_id, p_module_key, p_state, v_admin)
  on conflict (restaurant_id, module_key) do update set
    state = excluded.state,
    updated_at = now(),
    updated_by_profile_id = excluded.updated_by_profile_id;

  insert into public.platform_admin_events (
    admin_profile_id, action, target_type, target_id, detail
  )
  values (
    v_admin,
    'module_entitlement_changed',
    'restaurant',
    p_restaurant_id,
    jsonb_build_object('module_key', p_module_key, 'state', p_state)
  );

  return jsonb_build_object(
    'ok', true,
    'module_key', p_module_key,
    'state', p_state
  );
end
$set_entitlement$;

-- ---------------------------------------------------------------------------
-- Revision-aware Team and Restaurant workspaces
-- ---------------------------------------------------------------------------

create table public.restaurant_workspace_revisions (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  team_revision bigint not null default 0,
  restaurant_revision bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint restaurant_workspace_revisions_team_check check (team_revision >= 0),
  constraint restaurant_workspace_revisions_restaurant_check check (restaurant_revision >= 0)
);

alter table public.restaurant_workspace_revisions enable row level security;
revoke all on table public.restaurant_workspace_revisions from public, anon, authenticated;
grant all on table public.restaurant_workspace_revisions to service_role;

create table public.workspace_configuration_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  module_key text not null,
  revision bigint not null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint workspace_configuration_events_module_check
    check (module_key in ('team', 'restaurant')),
  constraint workspace_configuration_events_revision_check check (revision > 0),
  constraint workspace_configuration_events_summary_check
    check (jsonb_typeof(summary) = 'object')
);

create index workspace_configuration_events_restaurant_module_created_idx
  on public.workspace_configuration_events (restaurant_id, module_key, created_at desc);

alter table public.workspace_configuration_events enable row level security;
revoke all on table public.workspace_configuration_events from public, anon, authenticated;
grant all on table public.workspace_configuration_events to service_role;

create function public.seed_restaurant_workspace_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $seed_revision$
begin
  insert into public.restaurant_workspace_revisions (restaurant_id)
  values (new.id)
  on conflict (restaurant_id) do nothing;
  return new;
end
$seed_revision$;

drop trigger if exists seed_restaurant_workspace_revision on public.restaurants;
create trigger seed_restaurant_workspace_revision
after insert on public.restaurants
for each row execute function public.seed_restaurant_workspace_revision();

insert into public.restaurant_workspace_revisions (restaurant_id)
select r.id from public.restaurants r
on conflict (restaurant_id) do nothing;

-- Keep managers operationally useful while withholding the national registry
-- number. Owner previews and owner reads retain the full legal profile.
create or replace function public.build_team_read_model(
  p_restaurant_id uuid,
  p_role text
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $team$
  select jsonb_build_object(
    'restaurant', to_jsonb(r),
    'restaurant_settings', coalesce((
      select case when p_role = 'owner' then to_jsonb(s) else to_jsonb(s) - 'payroll_settings' end
      from public.restaurant_settings s where s.restaurant_id = r.id
    ), '{}'::jsonb),
    'restaurant_memberships', coalesce((select jsonb_agg(to_jsonb(m)) from public.restaurant_memberships m where m.restaurant_id = r.id), '[]'::jsonb),
    'employees', coalesce((select jsonb_agg(to_jsonb(e) order by e.sort_order, e.display_name) from public.employees e where e.restaurant_id = r.id), '[]'::jsonb),
    'employee_access', coalesce((select jsonb_agg(to_jsonb(a)) from public.employee_access a where a.restaurant_id = r.id), '[]'::jsonb),
    'employee_invitation_states', public.employee_invitation_states_for_restaurant(r.id),
    'employee_pin_credentials', coalesce((select jsonb_agg(jsonb_build_object('restaurant_id', p.restaurant_id, 'employee_id', p.employee_id, 'pin_status', p.pin_status, 'locked_until', p.locked_until, 'last_used_at', p.last_used_at, 'last_rotated_at', p.last_rotated_at)) from public.employee_pin_credentials p where p.restaurant_id = r.id), '[]'::jsonb),
    'employee_contact_details', coalesce((select jsonb_agg(to_jsonb(c)) from public.employee_contact_details c where c.restaurant_id = r.id), '[]'::jsonb),
    'employee_contracts', coalesce((select jsonb_agg(to_jsonb(c)) from public.employee_contracts c where c.restaurant_id = r.id), '[]'::jsonb),
    'employee_legal_profiles', coalesce((
      select jsonb_agg(
        case when p_role = 'owner'
          then to_jsonb(l)
          else to_jsonb(l) - 'national_registry_number'
        end
      )
      from public.employee_legal_profiles l
      where l.restaurant_id = r.id
    ), '[]'::jsonb),
    'employee_payroll_profiles', case when p_role = 'owner' then coalesce((select jsonb_agg(to_jsonb(p)) from public.employee_payroll_profiles p where p.restaurant_id = r.id), '[]'::jsonb) else '[]'::jsonb end,
    'job_functions', coalesce((
      select jsonb_agg(case when p_role = 'owner' then to_jsonb(j) else to_jsonb(j) - 'estimated_hourly_cost' end order by j.sort_order, j.name)
      from public.job_functions j where j.restaurant_id = r.id
    ), '[]'::jsonb),
    'employee_job_functions', coalesce((select jsonb_agg(to_jsonb(ej)) from public.employee_job_functions ej where ej.restaurant_id = r.id), '[]'::jsonb),
    'recurring_schedule_slots', coalesce((select jsonb_agg(to_jsonb(rs)) from public.recurring_schedule_slots rs where rs.restaurant_id = r.id), '[]'::jsonb),
    'contract_types', coalesce((select jsonb_agg(to_jsonb(ct) order by ct.sort_order) from public.contract_types ct where ct.restaurant_id = r.id and ct.active), '[]'::jsonb),
    'absence_types', coalesce((select jsonb_agg(to_jsonb(t) order by t.sort_order) from public.absence_types t where t.restaurant_id = r.id and t.active), '[]'::jsonb),
    'absences', coalesce((select jsonb_agg(to_jsonb(a)) from public.absences a where a.restaurant_id = r.id), '[]'::jsonb),
    'absence_events', coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at) from public.absence_events e where e.restaurant_id = r.id), '[]'::jsonb),
    'work_pattern_exceptions', coalesce((select jsonb_agg(to_jsonb(x)) from public.work_pattern_exceptions x where x.restaurant_id = r.id), '[]'::jsonb),
    'work_pattern_exception_events', coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at) from public.work_pattern_exception_events e where e.restaurant_id = r.id), '[]'::jsonb)
  )
  from public.restaurants r
  where r.id = p_restaurant_id
$team$;

create function public.get_workspace_bootstrap_v2(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $bootstrap$
declare
  v_result jsonb;
begin
  v_result := public.get_workspace_bootstrap(p_restaurant_id);
  return v_result || jsonb_build_object(
    'module_entitlements',
    public.restaurant_module_entitlements_json(p_restaurant_id)
  );
end
$bootstrap$;

create function public.get_team_read_model_v2(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $get_team$
declare
  v_result jsonb;
  v_revision bigint;
begin
  perform public.require_restaurant_module(p_restaurant_id, 'team');
  v_result := public.get_team_read_model(p_restaurant_id);
  select team_revision into v_revision
  from public.restaurant_workspace_revisions
  where restaurant_id = p_restaurant_id;
  return v_result || jsonb_build_object('workspace_revision', coalesce(v_revision, 0));
end
$get_team$;

create function public.get_restaurant_read_model_v2(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $get_restaurant$
declare
  v_result jsonb;
  v_revision bigint;
begin
  perform public.require_restaurant_module(p_restaurant_id, 'restaurant');
  v_result := public.get_restaurant_read_model(p_restaurant_id);
  select restaurant_revision into v_revision
  from public.restaurant_workspace_revisions
  where restaurant_id = p_restaurant_id;
  return v_result || jsonb_build_object('workspace_revision', coalesce(v_revision, 0));
end
$get_restaurant$;

create function public.save_team_workspace_v2(
  p_restaurant_id uuid,
  p_expected_revision bigint,
  p_employees jsonb default '[]'::jsonb,
  p_employee_job_functions jsonb default '[]'::jsonb,
  p_recurring_schedule_slots jsonb default '[]'::jsonb,
  p_contacts jsonb default '[]'::jsonb,
  p_legal_profiles jsonb default '[]'::jsonb,
  p_contracts jsonb default '[]'::jsonb,
  p_payroll_profiles jsonb default '[]'::jsonb,
  p_access jsonb default '[]'::jsonb,
  p_employment_terms jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $save_team$
declare
  v_current_revision bigint;
  v_next_revision bigint;
  v_result jsonb;
  v_legal_profiles jsonb := coalesce(p_legal_profiles, '[]'::jsonb);
  v_actor uuid := public.current_profile_id();
begin
  perform public.require_restaurant_module(p_restaurant_id, 'team');
  perform 1 from public.require_owner_or_manager_context(p_restaurant_id);

  insert into public.restaurant_workspace_revisions (restaurant_id)
  values (p_restaurant_id)
  on conflict (restaurant_id) do nothing;

  select team_revision into v_current_revision
  from public.restaurant_workspace_revisions
  where restaurant_id = p_restaurant_id
  for update;

  if p_expected_revision is distinct from v_current_revision then
    raise exception 'Team changed in another session. Reload before saving again.'
      using errcode = '40001',
            detail = 'TEAM_REVISION_CONFLICT',
            hint = 'Reload Team to merge the latest changes.';
  end if;

  if not public.is_owner(p_restaurant_id) then
    select coalesce(jsonb_agg(
      (item.value - 'national_registry_number')
      || jsonb_build_object(
        'national_registry_number',
        legal.national_registry_number
      )
      order by item.ordinality
    ), '[]'::jsonb)
    into v_legal_profiles
    from jsonb_array_elements(v_legal_profiles) with ordinality as item(value, ordinality)
    left join public.employee_legal_profiles legal
      on legal.restaurant_id = p_restaurant_id
     and legal.employee_id = nullif(item.value->>'employee_id', '')::uuid;
  end if;

  select public.save_team_workspace(
    p_restaurant_id,
    p_employees,
    p_employee_job_functions,
    p_recurring_schedule_slots,
    p_contacts,
    v_legal_profiles,
    p_contracts,
    p_payroll_profiles,
    p_access,
    p_employment_terms
  ) into v_result;

  update public.restaurant_workspace_revisions
  set team_revision = team_revision + 1,
      updated_at = now()
  where restaurant_id = p_restaurant_id
  returning team_revision into v_next_revision;

  insert into public.workspace_configuration_events (
    restaurant_id, module_key, revision, actor_profile_id, summary
  )
  values (
    p_restaurant_id,
    'team',
    v_next_revision,
    v_actor,
    jsonb_build_object(
      'employees', jsonb_array_length(coalesce(p_employees, '[]'::jsonb)),
      'contracts', jsonb_array_length(coalesce(p_contracts, '[]'::jsonb)),
      'access_records', jsonb_array_length(coalesce(p_access, '[]'::jsonb))
    )
  );

  return v_result || jsonb_build_object('workspace_revision', v_next_revision);
end
$save_team$;

create function public.save_restaurant_model_v2(
  p_restaurant_id uuid,
  p_expected_revision bigint,
  p_restaurant jsonb default '{}'::jsonb,
  p_settings jsonb default '{}'::jsonb,
  p_job_functions jsonb default '[]'::jsonb,
  p_areas jsonb default '[]'::jsonb,
  p_opening_hours jsonb default '[]'::jsonb,
  p_area_service_defaults jsonb default '[]'::jsonb,
  p_coverage_requirements jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $save_restaurant$
declare
  v_current_revision bigint;
  v_next_revision bigint;
  v_result jsonb;
  v_actor uuid := public.current_profile_id();
begin
  perform public.require_restaurant_module(p_restaurant_id, 'restaurant');
  perform 1 from public.require_owner_or_manager_context(p_restaurant_id);

  insert into public.restaurant_workspace_revisions (restaurant_id)
  values (p_restaurant_id)
  on conflict (restaurant_id) do nothing;

  select restaurant_revision into v_current_revision
  from public.restaurant_workspace_revisions
  where restaurant_id = p_restaurant_id
  for update;

  if p_expected_revision is distinct from v_current_revision then
    raise exception 'Restaurant setup changed in another session. Reload before saving again.'
      using errcode = '40001',
            detail = 'RESTAURANT_REVISION_CONFLICT',
            hint = 'Reload Restaurant to merge the latest changes.';
  end if;

  select public.save_restaurant_model(
    p_restaurant_id,
    p_restaurant,
    p_settings,
    p_job_functions,
    p_areas,
    p_opening_hours,
    p_area_service_defaults,
    p_coverage_requirements
  ) into v_result;

  update public.restaurant_workspace_revisions
  set restaurant_revision = restaurant_revision + 1,
      updated_at = now()
  where restaurant_id = p_restaurant_id
  returning restaurant_revision into v_next_revision;

  insert into public.workspace_configuration_events (
    restaurant_id, module_key, revision, actor_profile_id, summary
  )
  values (
    p_restaurant_id,
    'restaurant',
    v_next_revision,
    v_actor,
    jsonb_build_object(
      'areas', jsonb_array_length(coalesce(p_areas, '[]'::jsonb)),
      'positions', jsonb_array_length(coalesce(p_job_functions, '[]'::jsonb)),
      'opening_hours', jsonb_array_length(coalesce(p_opening_hours, '[]'::jsonb)),
      'coverage_rules', jsonb_array_length(coalesce(p_coverage_requirements, '[]'::jsonb))
    )
  );

  return v_result || jsonb_build_object('workspace_revision', v_next_revision);
end
$save_restaurant$;

-- The v2 wrappers are the authenticated API. Retaining the old functions for
-- internal composition avoids rewriting proven implementation bodies.
revoke all on function public.get_workspace_bootstrap(uuid) from authenticated;
revoke all on function public.get_team_read_model(uuid) from authenticated;
revoke all on function public.get_restaurant_read_model(uuid) from authenticated;
revoke all on function public.save_team_model(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)
  from authenticated;
revoke all on function public.save_team_workspace(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)
  from authenticated;
revoke all on function public.save_restaurant_model(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)
  from authenticated;

revoke all on function public.request_pilot_access(text) from public, anon, authenticated;
revoke all on function public.get_pilot_access_state() from public, anon, authenticated;
revoke all on function public.admin_list_pilot_access_requests() from public, anon, authenticated;
revoke all on function public.admin_review_pilot_access(uuid,boolean,text) from public, anon, authenticated;
revoke all on function public.enforce_controlled_restaurant_creation() from public, anon, authenticated;
revoke all on function public.seed_restaurant_module_entitlements() from public, anon, authenticated;
revoke all on function public.restaurant_module_entitlements_json(uuid) from public, anon, authenticated;
revoke all on function public.restaurant_module_enabled(uuid,text) from public, anon, authenticated;
revoke all on function public.require_restaurant_module(uuid,text) from public, anon, authenticated;
revoke all on function public.admin_set_restaurant_module_entitlement(uuid,text,text)
  from public, anon, authenticated;
revoke all on function public.seed_restaurant_workspace_revision() from public, anon, authenticated;
revoke all on function public.get_workspace_bootstrap_v2(uuid) from public, anon, authenticated;
revoke all on function public.get_team_read_model_v2(uuid) from public, anon, authenticated;
revoke all on function public.get_restaurant_read_model_v2(uuid) from public, anon, authenticated;
revoke all on function public.save_team_workspace_v2(uuid,bigint,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)
  from public, anon, authenticated;
revoke all on function public.save_restaurant_model_v2(uuid,bigint,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)
  from public, anon, authenticated;

grant execute on function public.request_pilot_access(text) to authenticated;
grant execute on function public.get_pilot_access_state() to authenticated;
grant execute on function public.admin_list_pilot_access_requests() to authenticated;
grant execute on function public.admin_review_pilot_access(uuid,boolean,text) to authenticated;
grant execute on function public.admin_set_restaurant_module_entitlement(uuid,text,text) to authenticated;
grant execute on function public.get_workspace_bootstrap_v2(uuid) to authenticated;
grant execute on function public.get_team_read_model_v2(uuid) to authenticated;
grant execute on function public.get_restaurant_read_model_v2(uuid) to authenticated;
grant execute on function public.save_team_workspace_v2(uuid,bigint,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)
  to authenticated;
grant execute on function public.save_restaurant_model_v2(uuid,bigint,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)
  to authenticated;

grant execute on function public.get_workspace_bootstrap_v2(uuid) to service_role;
grant execute on function public.get_team_read_model_v2(uuid) to service_role;
grant execute on function public.get_restaurant_read_model_v2(uuid) to service_role;
grant execute on function public.save_team_workspace_v2(uuid,bigint,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)
  to service_role;
grant execute on function public.save_restaurant_model_v2(uuid,bigint,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)
  to service_role;

notify pgrst, 'reload schema';
commit;
