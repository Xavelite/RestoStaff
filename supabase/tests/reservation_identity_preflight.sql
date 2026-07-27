-- Read-only gate before applying reservation floor/table identity migrations to
-- an existing environment. Resolve every reported duplicate before db push.
begin;
set transaction read only;

do $reservation_identity_preflight$
begin
  if exists (
    select 1
    from public.reservation_floors
    group by restaurant_id, coalesce(level, 0)
    having count(*) > 1
  ) then
    raise exception 'Reservation floors contain duplicate physical levels.';
  end if;

  if exists (
    select 1
    from public.reservation_tables
    where active
    group by restaurant_id, room_id, lower(btrim(label))
    having count(*) > 1
  ) then
    raise exception 'Active reservation tables contain duplicate normalized labels.';
  end if;

  if exists (
    select 1
    from public.reservation_table_combinations
    where active
    group by restaurant_id, room_id, lower(btrim(name))
    having count(*) > 1
  ) then
    raise exception 'Active table combinations contain duplicate normalized names.';
  end if;
end
$reservation_identity_preflight$;

rollback;
