-- break_minutes is the minute-resolution summary used by rosters and exports.
-- Derive it from the combined active evidence so several partial minutes do
-- not disappear when an employee clocks out and back in repeatedly.
begin;

create or replace function public.recalculate_badge_break_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_seconds bigint;
  v_new_seconds bigint;
begin
  if old.status = 'closed'
      and new.status = 'open'
      and old.clock_out_at is not null
      and new.clock_out_at is null
      and new.source = 'badge_terminal'
      and new.updated_at > old.clock_out_at then
    select coalesce(sum(b.duration_seconds), 0)
    into v_existing_seconds
    from public.time_entry_break_intervals b
    where b.restaurant_id = new.restaurant_id
      and b.time_entry_id = new.id
      and b.active;

    v_new_seconds := floor(extract(epoch from (new.updated_at - old.clock_out_at)))::bigint;
    new.break_minutes := floor((v_existing_seconds + greatest(v_new_seconds, 0)) / 60.0)::integer;
  end if;
  return new;
end;
$$;

drop trigger if exists time_entries_badge_break_total on public.time_entries;
create trigger time_entries_badge_break_total
before update of break_minutes, clock_out_at, status on public.time_entries
for each row execute function public.recalculate_badge_break_total();

revoke all on function public.recalculate_badge_break_total()
  from public, anon, authenticated;

commit;
