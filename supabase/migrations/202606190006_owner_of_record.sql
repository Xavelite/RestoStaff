begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Until now the only record of who owns a restaurant was the *mutable*
-- restaurant_memberships.role = 'owner' row. That is why an invitation could
-- silently demote the owner, and why the 004 repair had to guess the owner by
-- matching restaurants.email to profiles.email. This column is the single,
-- authoritative source of truth for ownership.
alter table public.restaurants
  add column if not exists owner_profile_id uuid references public.profiles(id);

-- Backfill deterministically from the current active owner membership
-- (no email matching).
update public.restaurants r
set owner_profile_id = m.profile_id
from public.restaurant_memberships m
where m.restaurant_id = r.id
  and m.role = 'owner'
  and m.status = 'active'
  and r.owner_profile_id is null;

-- Ownership is mandatory. Fail loudly and actionably rather than with a cryptic
-- NOT NULL violation if any restaurant has no active owner.
do $$
declare
  v_orphans int;
begin
  select count(*) into v_orphans
  from public.restaurants
  where owner_profile_id is null;
  if v_orphans > 0 then
    raise exception
      'Cannot enforce owner_profile_id: % restaurant(s) have no active owner membership. Resolve ownership before re-running.', v_orphans;
  end if;
end;
$$;

alter table public.restaurants
  alter column owner_profile_id set not null;

-- Capture the owner of record automatically the moment an owner membership is
-- created (e.g. inside setup_owner_workspace). No application code sets it.
create or replace function public.capture_owner_of_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'owner' then
    update public.restaurants
    set owner_profile_id = new.profile_id
    where id = new.restaurant_id and owner_profile_id is null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_capture_owner_of_record on public.restaurant_memberships;
create trigger trg_capture_owner_of_record
after insert on public.restaurant_memberships
for each row execute function public.capture_owner_of_record();

-- The owner of record must always keep an active owner membership. This makes
-- the historical demotion bug structurally impossible at the table boundary,
-- instead of relying on a guard inside one RPC.
-- A cascade delete of the restaurant itself is allowed: the restaurant row is
-- already gone when its membership rows cascade, so owner lookup returns null.
create or replace function public.enforce_owner_membership()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select owner_profile_id into v_owner
  from public.restaurants
  where id = coalesce(old.restaurant_id, new.restaurant_id);

  if v_owner is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' and old.profile_id = v_owner then
    raise exception 'The owner membership cannot be removed.';
  end if;

  if tg_op = 'UPDATE' and old.profile_id = v_owner
     and (new.role <> 'owner' or new.status <> 'active') then
    raise exception 'The owner membership cannot be demoted or deactivated.';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_enforce_owner_membership on public.restaurant_memberships;
create trigger trg_enforce_owner_membership
before update or delete on public.restaurant_memberships
for each row execute function public.enforce_owner_membership();

commit;
