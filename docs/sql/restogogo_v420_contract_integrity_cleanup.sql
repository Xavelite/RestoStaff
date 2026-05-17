-- restogogo v420 — Contract integrity cleanup
-- Run after v418 and v419 migrations.
-- Purpose:
-- 1) Move zone default shift times out of hidden metadata into explicit restogogo_zones.default_times.
-- 2) Canonicalize employee position labels from position_id.
-- 3) Align employee rate/hourly_cost with the v420 cost rule.

begin;

alter table public.restogogo_zones
  add column if not exists default_times jsonb not null default '{"Lunch":"","Evening":""}'::jsonb;

update public.restogogo_zones
set default_times = jsonb_build_object(
    'Lunch', coalesce(metadata #>> '{defaultTimes,Lunch}', default_times ->> 'Lunch', ''),
    'Evening', coalesce(metadata #>> '{defaultTimes,Evening}', default_times ->> 'Evening', '')
  )
where metadata ? 'defaultTimes';

update public.restogogo_zones
set metadata = metadata - 'defaultTimes' - 'default_times'
where metadata ? 'defaultTimes' or metadata ? 'default_times';

update public.restogogo_employees e
set
  position = p.name,
  hourly_cost = case
    when coalesce(e.hourly_cost,0) > 0 then e.hourly_cost
    when coalesce(e.rate,0) > 0 then e.rate
    else coalesce(p.hourly_cost,0)
  end,
  rate = case
    when coalesce(e.hourly_cost,0) > 0 then e.hourly_cost
    when coalesce(e.rate,0) > 0 then e.rate
    else coalesce(p.hourly_cost,0)
  end
from public.restogogo_positions p
where e.restaurant_id = p.restaurant_id
  and e.position_id = p.id;

commit;

-- Optional safety report after the update.
-- Active employees returned here still need a valid Restaurant position before saving in v420.
select e.restaurant_id, e.id, e.name, e.position, e.position_id
from public.restogogo_employees e
left join public.restogogo_positions p
  on p.restaurant_id = e.restaurant_id
 and p.id = e.position_id
where e.active = true
  and (e.position_id is null or p.id is null)
order by e.restaurant_id, e.name;
