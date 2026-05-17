-- restogogo v397.6 composite FK verification only
-- Run this first. It does not modify the database.
--
-- Purpose:
--   1) Verify the live DB uses intentional composite foreign keys.
--   2) Show orphan rows before any repair is attempted.
--
-- Notes:
--   Supabase schema copy/export can display composite FKs as repeated single-column
--   lines. The catalog query below is the source of truth: each composite FK should
--   show a two-column source array and a two-column referenced array.

-- 1) Current FK overview. Composite FKs must show two source columns and two target columns.
select
  c.conrelid::regclass::text as table_name,
  c.conname as constraint_name,
  array(
    select a.attname
    from unnest(c.conkey) with ordinality as k(attnum, ord)
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
    order by k.ord
  ) as source_columns,
  c.confrelid::regclass::text as referenced_table,
  array(
    select a.attname
    from unnest(c.confkey) with ordinality as k(attnum, ord)
    join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.attnum
    order by k.ord
  ) as referenced_columns
from pg_constraint c
where c.contype = 'f'
  and c.conrelid in (
    'public.restogogo_employees'::regclass,
    'public.restogogo_employee_absences'::regclass,
    'public.restogogo_availability_slots'::regclass,
    'public.restogogo_planned_shifts'::regclass,
    'public.restogogo_employee_week_submissions'::regclass,
    'public.restogogo_weekly_notes'::regclass,
    'public.restogogo_actual_shift_entries'::regclass
  )
order by table_name, constraint_name;

-- Expected composite FK shapes:
-- restogogo_employees.position_fk:              {restaurant_id,position_id}      -> restogogo_positions {restaurant_id,id}
-- restogogo_employee_absences.employee_fk:      {restaurant_id,employee_id}      -> restogogo_employees {restaurant_id,id}
-- restogogo_employee_absences.absence_type_fk:  {restaurant_id,absence_type_id}  -> restogogo_absence_types {restaurant_id,id}
-- weekly child tables week_fk:                  {restaurant_id,week_start}       -> restogogo_weekly_status {restaurant_id,week_start}
-- weekly child tables employee_fk:              {restaurant_id,employee_id}      -> restogogo_employees {restaurant_id,id}
-- restogogo_planned_shifts.zone_fk:            {restaurant_id,zone_id}          -> restogogo_zones {restaurant_id,id}

-- 2) Orphan diagnostics. All counts should be 0 before FK repair can validate.
select 'employees -> positions' as relationship, count(*) as orphan_rows
from public.restogogo_employees c
left join public.restogogo_positions p
  on p.restaurant_id = c.restaurant_id and p.id = c.position_id
where c.position_id is not null and p.restaurant_id is null
union all
select 'employee_absences -> employees', count(*)
from public.restogogo_employee_absences c
left join public.restogogo_employees p
  on p.restaurant_id = c.restaurant_id and p.id = c.employee_id
where p.restaurant_id is null
union all
select 'employee_absences -> absence_types', count(*)
from public.restogogo_employee_absences c
left join public.restogogo_absence_types p
  on p.restaurant_id = c.restaurant_id and p.id = c.absence_type_id
where c.absence_type_id is not null and p.restaurant_id is null
union all
select 'availability_slots -> weekly_status', count(*)
from public.restogogo_availability_slots c
left join public.restogogo_weekly_status p
  on p.restaurant_id = c.restaurant_id and p.week_start = c.week_start
where p.restaurant_id is null
union all
select 'availability_slots -> employees', count(*)
from public.restogogo_availability_slots c
left join public.restogogo_employees p
  on p.restaurant_id = c.restaurant_id and p.id = c.employee_id
where p.restaurant_id is null
union all
select 'planned_shifts -> weekly_status', count(*)
from public.restogogo_planned_shifts c
left join public.restogogo_weekly_status p
  on p.restaurant_id = c.restaurant_id and p.week_start = c.week_start
where p.restaurant_id is null
union all
select 'planned_shifts -> employees', count(*)
from public.restogogo_planned_shifts c
left join public.restogogo_employees p
  on p.restaurant_id = c.restaurant_id and p.id = c.employee_id
where p.restaurant_id is null
union all
select 'planned_shifts -> zones', count(*)
from public.restogogo_planned_shifts c
left join public.restogogo_zones p
  on p.restaurant_id = c.restaurant_id and p.id = c.zone_id
where c.zone_id is not null and p.restaurant_id is null
union all
select 'employee_week_submissions -> weekly_status', count(*)
from public.restogogo_employee_week_submissions c
left join public.restogogo_weekly_status p
  on p.restaurant_id = c.restaurant_id and p.week_start = c.week_start
where p.restaurant_id is null
union all
select 'employee_week_submissions -> employees', count(*)
from public.restogogo_employee_week_submissions c
left join public.restogogo_employees p
  on p.restaurant_id = c.restaurant_id and p.id = c.employee_id
where p.restaurant_id is null
union all
select 'weekly_notes -> weekly_status', count(*)
from public.restogogo_weekly_notes c
left join public.restogogo_weekly_status p
  on p.restaurant_id = c.restaurant_id and p.week_start = c.week_start
where p.restaurant_id is null
union all
select 'actual_shift_entries -> weekly_status', count(*)
from public.restogogo_actual_shift_entries c
left join public.restogogo_weekly_status p
  on p.restaurant_id = c.restaurant_id and p.week_start = c.week_start
where p.restaurant_id is null
union all
select 'actual_shift_entries -> employees', count(*)
from public.restogogo_actual_shift_entries c
left join public.restogogo_employees p
  on p.restaurant_id = c.restaurant_id and p.id = c.employee_id
where p.restaurant_id is null;

