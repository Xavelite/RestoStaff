-- Preconditions:
-- - 202606210029_model_closure_integrity.sql has been applied.
-- - If an earlier manual notification foundation was applied, it may have
--   created public.notification_feed_states; this migration renames that table
--   to the final product name public.notification_receipts.
-- Rollback strategy:
-- - Drop notification_receipts, notification_preferences, notification_types
--   only if no frontend version depends on them and no read/dismiss/user
--   preference state must be preserved.
-- Product contract:
-- - Operational tables remain the source of truth.
-- - Notifications are derived from absences, planning, time entries, invitations
--   and work-week lifecycle data.
-- - These tables only store type catalog, user preferences and per-user
--   read/dismiss receipts for deterministic notification keys.

begin;

do $$
begin
  if to_regclass('public.notification_feed_states') is not null
     and to_regclass('public.notification_receipts') is null then
    alter table public.notification_feed_states rename to notification_receipts;
  end if;
end $$;

create table if not exists public.notification_types (
  code text primary key,
  audience text not null check (audience in ('manager', 'employee', 'both')),
  label text not null,
  description text not null default '',
  default_action text not null default 'route' check (default_action in ('popup', 'route')),
  default_target_module text not null,
  default_in_app_enabled boolean not null default true,
  default_push_enabled boolean not null default false,
  sort_order integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_types_code_format check (code ~ '^[a-z0-9_]+$')
);

create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  profile_id uuid not null,
  notification_type text not null references public.notification_types(code) on update cascade,
  in_app_enabled boolean not null,
  push_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_preferences_membership_fk
    foreign key (restaurant_id, profile_id)
    references public.restaurant_memberships (restaurant_id, profile_id)
    on delete cascade,
  constraint notification_preferences_unique
    unique (restaurant_id, profile_id, notification_type)
);

create table if not exists public.notification_receipts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  profile_id uuid not null,
  notification_key text not null,
  notification_type text not null references public.notification_types(code) on update cascade,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_receipts_membership_fk
    foreign key (restaurant_id, profile_id)
    references public.restaurant_memberships (restaurant_id, profile_id)
    on delete cascade,
  constraint notification_receipts_key_format
    check (length(btrim(notification_key)) between 3 and 240 and notification_key !~ '\s'),
  constraint notification_receipts_unique
    unique (restaurant_id, profile_id, notification_key)
);

comment on table public.notification_types is
  'Catalog of supported notification types. Notification items are derived from operational source tables.';
comment on table public.notification_preferences is
  'Per-user notification settings. Missing row means use notification_types defaults.';
comment on table public.notification_receipts is
  'Per-user read/dismiss receipts for deterministic derived notification keys.';
comment on column public.notification_receipts.notification_key is
  'Stable derived key, for example absence-request:{absence_id} or forgot-badge-out:{time_entry_id}.';
comment on column public.notification_types.default_push_enabled is
  'Reserved for future web/mobile push. First implementation uses in-app only.';

insert into public.notification_types (
  code,
  audience,
  label,
  description,
  default_action,
  default_target_module,
  default_in_app_enabled,
  default_push_enabled,
  sort_order
)
values
  ('absence_request_submitted', 'manager', 'Absence request submitted', 'An employee submitted an absence request.', 'popup', 'calendar', true, false, 10),
  ('employee_unavailable_on_planned_shift', 'manager', 'Employee unavailable on planned shift', 'An employee is unavailable for a planned shift.', 'route', 'planning', true, false, 20),
  ('employee_forgot_badge_out', 'manager', 'Employee forgot to badge out', 'An employee has an open or incomplete time entry.', 'popup', 'actuals', true, false, 30),
  ('employee_badged_late', 'manager', 'Employee badged late', 'An employee badged in later than the planned shift start.', 'route', 'actuals', true, false, 40),
  ('employee_no_show', 'manager', 'Employee did not show up', 'A planned employee has no matching worked time.', 'route', 'actuals', true, false, 50),
  ('worked_during_approved_absence', 'manager', 'Worked during approved absence', 'Worked time overlaps an approved absence.', 'route', 'actuals', true, false, 60),
  ('employee_invite_accepted', 'manager', 'Employee accepted invite', 'An invited employee accepted access to the restaurant.', 'route', 'team', true, false, 70),
  ('employee_availability_updated', 'manager', 'Employee updated availability', 'An employee updated future availability.', 'route', 'planning', false, false, 110),
  ('published_planning_changed', 'manager', 'Published planning changed', 'A published planning was changed.', 'route', 'planning', false, false, 120),
  ('payroll_export_created', 'manager', 'Payroll export created', 'A payroll export was created.', 'route', 'actuals', false, false, 130),
  ('planning_published', 'employee', 'New planning published', 'A new planning was published.', 'route', 'shifts', true, false, 210),
  ('absence_request_decided', 'employee', 'Absence request approved or refused', 'A manager approved or refused an absence request.', 'popup', 'calendar', true, false, 220),
  ('own_forgot_badge_out', 'employee', 'Forgot to badge out', 'Your time entry is missing a badge-out time.', 'popup', 'badge', true, false, 230),
  ('shift_soon', 'employee', 'Shift soon', 'You have an upcoming shift.', 'popup', 'shifts', true, false, 240),
  ('shift_changed_after_publication', 'employee', 'Shift changed after publication', 'A published shift was changed.', 'route', 'shifts', false, false, 260)
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

create index if not exists notification_types_active_sort_idx
  on public.notification_types (active, audience, sort_order);
create index if not exists notification_preferences_profile_restaurant_idx
  on public.notification_preferences (profile_id, restaurant_id);
create index if not exists notification_preferences_restaurant_type_idx
  on public.notification_preferences (restaurant_id, notification_type);
create index if not exists notification_receipts_profile_restaurant_idx
  on public.notification_receipts (profile_id, restaurant_id);
create index if not exists notification_receipts_restaurant_type_idx
  on public.notification_receipts (restaurant_id, notification_type);
create index if not exists notification_receipts_unread_idx
  on public.notification_receipts (restaurant_id, profile_id, read_at, dismissed_at);

create or replace function public.set_notification_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_notification_types_updated_at on public.notification_types;
create trigger set_notification_types_updated_at
before update on public.notification_types
for each row execute function public.set_notification_updated_at();

drop trigger if exists set_notification_preferences_updated_at on public.notification_preferences;
create trigger set_notification_preferences_updated_at
before update on public.notification_preferences
for each row execute function public.set_notification_updated_at();

drop trigger if exists set_notification_receipts_updated_at on public.notification_receipts;
create trigger set_notification_receipts_updated_at
before update on public.notification_receipts
for each row execute function public.set_notification_updated_at();

alter table public.notification_types enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_receipts enable row level security;

drop policy if exists "notification_types_select_active" on public.notification_types;
create policy "notification_types_select_active"
on public.notification_types
for select
to authenticated
using (active = true);

drop policy if exists "notification_preferences_select_own" on public.notification_preferences;
create policy "notification_preferences_select_own"
on public.notification_preferences
for select
to authenticated
using (profile_id = public.current_profile_id() and public.is_restaurant_member(restaurant_id));

drop policy if exists "notification_preferences_insert_own" on public.notification_preferences;
create policy "notification_preferences_insert_own"
on public.notification_preferences
for insert
to authenticated
with check (profile_id = public.current_profile_id() and public.is_restaurant_member(restaurant_id));

drop policy if exists "notification_preferences_update_own" on public.notification_preferences;
create policy "notification_preferences_update_own"
on public.notification_preferences
for update
to authenticated
using (profile_id = public.current_profile_id() and public.is_restaurant_member(restaurant_id))
with check (profile_id = public.current_profile_id() and public.is_restaurant_member(restaurant_id));

drop policy if exists "notification_preferences_delete_own" on public.notification_preferences;
create policy "notification_preferences_delete_own"
on public.notification_preferences
for delete
to authenticated
using (profile_id = public.current_profile_id() and public.is_restaurant_member(restaurant_id));

drop policy if exists "notification_receipts_select_own" on public.notification_receipts;
create policy "notification_receipts_select_own"
on public.notification_receipts
for select
to authenticated
using (profile_id = public.current_profile_id() and public.is_restaurant_member(restaurant_id));

drop policy if exists "notification_receipts_insert_own" on public.notification_receipts;
create policy "notification_receipts_insert_own"
on public.notification_receipts
for insert
to authenticated
with check (profile_id = public.current_profile_id() and public.is_restaurant_member(restaurant_id));

drop policy if exists "notification_receipts_update_own" on public.notification_receipts;
create policy "notification_receipts_update_own"
on public.notification_receipts
for update
to authenticated
using (profile_id = public.current_profile_id() and public.is_restaurant_member(restaurant_id))
with check (profile_id = public.current_profile_id() and public.is_restaurant_member(restaurant_id));

revoke all on public.notification_types from anon, authenticated;
revoke all on public.notification_preferences from anon, authenticated;
revoke all on public.notification_receipts from anon, authenticated;

grant select on public.notification_types to authenticated;
grant select, insert, update, delete on public.notification_preferences to authenticated;
grant select, insert, update on public.notification_receipts to authenticated;

grant all on public.notification_types to service_role;
grant all on public.notification_preferences to service_role;
grant all on public.notification_receipts to service_role;

commit;
