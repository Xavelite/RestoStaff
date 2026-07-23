-- Keep live workspace refreshes in an application-owned, tenant-scoped table.
-- Postgres Changes applies the table's normal RLS and avoids policies on
-- Supabase-managed realtime.messages, whose ownership is platform-controlled.
begin;

create table public.workspace_realtime_events (
  restaurant_id uuid primary key
    references public.restaurants(id) on delete cascade,
  event text not null,
  source text not null,
  sequence bigint not null default 1,
  updated_at timestamptz not null default now(),
  constraint workspace_realtime_events_event
    check (event in (
      'planning-saved',
      'actuals-updated',
      'team-updated',
      'restaurant-updated',
      'notification-refresh'
    )),
  constraint workspace_realtime_events_source
    check (source in ('planning', 'actuals', 'team', 'restaurant', 'badge', 'system')),
  constraint workspace_realtime_events_sequence check (sequence > 0)
);

comment on table public.workspace_realtime_events is
  'One RLS-protected change signal per restaurant for live workspace refreshes.';

alter table public.workspace_realtime_events enable row level security;

create policy workspace_realtime_events_select
on public.workspace_realtime_events
for select
to authenticated
using (public.is_restaurant_member(restaurant_id));

revoke all on table public.workspace_realtime_events from public, anon, authenticated;
grant select on table public.workspace_realtime_events to authenticated;
grant all on table public.workspace_realtime_events to service_role;

create or replace function public.publish_workspace_realtime_event(
  p_restaurant_id uuid,
  p_event text,
  p_source text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $publish_workspace_realtime_event$
declare
  v_sequence bigint;
begin
  if auth.uid() is null or not public.is_restaurant_member(p_restaurant_id) then
    raise exception 'Not authorized for this restaurant.' using errcode = '42501';
  end if;

  if p_event not in (
    'planning-saved',
    'actuals-updated',
    'team-updated',
    'restaurant-updated',
    'notification-refresh'
  ) then
    raise exception 'Unsupported workspace event.' using errcode = '22023';
  end if;

  if p_source not in ('planning', 'actuals', 'team', 'restaurant', 'badge', 'system') then
    raise exception 'Unsupported workspace event source.' using errcode = '22023';
  end if;

  insert into public.workspace_realtime_events (
    restaurant_id,
    event,
    source,
    sequence,
    updated_at
  )
  values (p_restaurant_id, p_event, p_source, 1, now())
  on conflict (restaurant_id) do update set
    event = excluded.event,
    source = excluded.source,
    sequence = public.workspace_realtime_events.sequence + 1,
    updated_at = now()
  returning sequence into v_sequence;

  return v_sequence;
end;
$publish_workspace_realtime_event$;

revoke all on function public.publish_workspace_realtime_event(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.publish_workspace_realtime_event(uuid, text, text)
  to authenticated;

do $publication$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'workspace_realtime_events'
  ) then
    alter publication supabase_realtime
      add table public.workspace_realtime_events;
  end if;
end
$publication$;

commit;
