-- Work-week finalized event type closure.
--
-- Preconditions:
-- - 202606250035_actuals_approval_auto_finalize.sql introduced the
--   planning_finalized lifecycle event.
-- Product contract:
-- - Every lifecycle event written by an approved trigger/RPC must be accepted
--   by the database constraint and remain append-only operational evidence.
-- Rollback strategy:
-- - Only remove planning_finalized from the constraint after replacing
--   guard_actuals_approval() with a function that no longer writes it.

begin;

alter table public.work_week_events
  drop constraint if exists work_week_events_event_type_check,
  add constraint work_week_events_event_type_check
  check (
    event_type in (
      'planning_published',
      'planning_reverted',
      'planning_finalized',
      'actuals_approved',
      'actuals_reopened',
      'actuals_locked'
    )
  );

do $verify_work_week_event_type$
begin
  if position(
    '''planning_finalized'''
    in pg_get_constraintdef((
      select oid
      from pg_constraint
      where conrelid = 'public.work_week_events'::regclass
        and conname = 'work_week_events_event_type_check'
    ))
  ) = 0 then
    raise exception 'work_week_events must allow planning_finalized lifecycle evidence.';
  end if;
end
$verify_work_week_event_type$;

commit;
