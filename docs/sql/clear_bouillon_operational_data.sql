-- restogogo relational pilot reset
-- Clears Bouillon operational weekly data while preserving restaurant setup,
-- employees, positions, zones and documents.

begin;

delete from public.restogogo_actual_shift_entries where restaurant_id = 'bouillon-bruxelles';
delete from public.restogogo_availability_slots where restaurant_id = 'bouillon-bruxelles';
delete from public.restogogo_planned_shifts where restaurant_id = 'bouillon-bruxelles';
delete from public.restogogo_employee_week_submissions where restaurant_id = 'bouillon-bruxelles';
delete from public.restogogo_weekly_notes where restaurant_id = 'bouillon-bruxelles';
delete from public.restogogo_weekly_status where restaurant_id = 'bouillon-bruxelles';

update public.restogogo_restaurants
set active_week_start = date_trunc('week', current_date + interval '7 days')::date,
    settings = coalesce(settings, '{}'::jsonb) || '{"notifications":[]}'::jsonb
where id = 'bouillon-bruxelles';

commit;

select
  r.id,
  r.updated_at,
  r.active_week_start,
  (select count(*) from public.restogogo_employees e where e.restaurant_id = r.id) as employees_preserved,
  (select count(*) from public.restogogo_positions p where p.restaurant_id = r.id) as positions_preserved,
  (select count(*) from public.restogogo_zones z where z.restaurant_id = r.id) as zones_preserved,
  (select count(*) from public.restogogo_weekly_status ws where ws.restaurant_id = r.id) as weekly_rows_remaining
from public.restogogo_restaurants r
where r.id = 'bouillon-bruxelles';
