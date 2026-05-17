-- restogogo v397.6 composite FK verification / repair
-- Purpose:
--   1) Verify the live DB uses intentional composite foreign keys.
--   2) Show orphan rows before any repair is attempted.
--   3) Rebuild the known child-table FKs as clean composite constraints.
--
-- Notes:
--   Supabase schema copy/export can display composite FKs as repeated single-column
--   lines. The catalog query below is the source of truth: each composite FK should
--   show a two-column source array and a two-column referenced array.
--
-- Run in Supabase SQL Editor after a backup/snapshot.
-- If any orphan count is greater than 0, fix/delete orphan rows before running the
-- repair transaction.

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

-- 3) Repair/rebuild FK constraints as deliberate composite FKs.
-- Uncomment/run the transaction only after orphan diagnostics are all 0.
begin;

alter table public.restogogo_employees
  drop constraint if exists restogogo_employees_position_fk;

alter table public.restogogo_employee_absences
  drop constraint if exists restogogo_employee_absences_employee_fk,
  drop constraint if exists restogogo_employee_absences_absence_type_fk;

alter table public.restogogo_availability_slots
  drop constraint if exists restogogo_availability_slots_week_fk,
  drop constraint if exists restogogo_availability_slots_employee_fk;

alter table public.restogogo_planned_shifts
  drop constraint if exists restogogo_planned_shifts_week_fk,
  drop constraint if exists restogogo_planned_shifts_employee_fk,
  drop constraint if exists restogogo_planned_shifts_zone_fk;

alter table public.restogogo_employee_week_submissions
  drop constraint if exists restogogo_employee_week_submissions_week_fk,
  drop constraint if exists restogogo_employee_week_submissions_employee_fk;

alter table public.restogogo_weekly_notes
  drop constraint if exists restogogo_weekly_notes_week_fk;

alter table public.restogogo_actual_shift_entries
  drop constraint if exists restogogo_actual_shift_entries_week_fk,
  drop constraint if exists restogogo_actual_shift_entries_employee_fk;

alter table public.restogogo_employees
  add constraint restogogo_employees_position_fk
  foreign key (restaurant_id, position_id)
  references public.restogogo_positions(restaurant_id, id)
  on update cascade
  on delete restrict;

alter table public.restogogo_employee_absences
  add constraint restogogo_employee_absences_employee_fk
  foreign key (restaurant_id, employee_id)
  references public.restogogo_employees(restaurant_id, id)
  on delete cascade,
  add constraint restogogo_employee_absences_absence_type_fk
  foreign key (restaurant_id, absence_type_id)
  references public.restogogo_absence_types(restaurant_id, id)
  on update cascade
  on delete restrict;

alter table public.restogogo_availability_slots
  add constraint restogogo_availability_slots_week_fk
  foreign key (restaurant_id, week_start)
  references public.restogogo_weekly_status(restaurant_id, week_start)
  on delete cascade,
  add constraint restogogo_availability_slots_employee_fk
  foreign key (restaurant_id, employee_id)
  references public.restogogo_employees(restaurant_id, id)
  on delete cascade;

alter table public.restogogo_planned_shifts
  add constraint restogogo_planned_shifts_week_fk
  foreign key (restaurant_id, week_start)
  references public.restogogo_weekly_status(restaurant_id, week_start)
  on delete cascade,
  add constraint restogogo_planned_shifts_employee_fk
  foreign key (restaurant_id, employee_id)
  references public.restogogo_employees(restaurant_id, id)
  on delete cascade,
  add constraint restogogo_planned_shifts_zone_fk
  foreign key (restaurant_id, zone_id)
  references public.restogogo_zones(restaurant_id, id)
  on update cascade
  on delete restrict;

alter table public.restogogo_employee_week_submissions
  add constraint restogogo_employee_week_submissions_week_fk
  foreign key (restaurant_id, week_start)
  references public.restogogo_weekly_status(restaurant_id, week_start)
  on delete cascade,
  add constraint restogogo_employee_week_submissions_employee_fk
  foreign key (restaurant_id, employee_id)
  references public.restogogo_employees(restaurant_id, id)
  on delete cascade;

alter table public.restogogo_weekly_notes
  add constraint restogogo_weekly_notes_week_fk
  foreign key (restaurant_id, week_start)
  references public.restogogo_weekly_status(restaurant_id, week_start)
  on delete cascade;

alter table public.restogogo_actual_shift_entries
  add constraint restogogo_actual_shift_entries_week_fk
  foreign key (restaurant_id, week_start)
  references public.restogogo_weekly_status(restaurant_id, week_start)
  on delete cascade,
  add constraint restogogo_actual_shift_entries_employee_fk
  foreign key (restaurant_id, employee_id)
  references public.restogogo_employees(restaurant_id, id)
  on delete cascade;

commit;

-- 4) Confirm final FK shape after repair.
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
