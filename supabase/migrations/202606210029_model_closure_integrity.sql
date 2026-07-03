-- Phase 7: final model, evidence and routine-security closure.
--
-- Preconditions:
-- - Migrations through 202606210028 are applied.
-- - Planning/Actuals evidence already uses restricted deletion and append-only
--   event tables.
--
-- This migration applies the same practical traceability contract to
-- absences, fixed-schedule exceptions and employment contracts. It also makes
-- the RPC-only security boundary cover every app-owned SQL/PLpgSQL routine,
-- not only SECURITY DEFINER routines.
--
-- Rollback:
-- - Restore the prior employee/parent foreign keys with ON DELETE CASCADE.
-- - Drop the two append-only event triggers and contract-history guard.
-- - Restoring broad routine grants is intentionally not recommended.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- Important employee history must survive ordinary employee maintenance.
alter table public.employee_contracts
  drop constraint employee_contracts_employee_fk,
  add constraint employee_contracts_employee_fk
    foreign key (restaurant_id, employee_id)
    references public.employees(restaurant_id, id)
    on delete restrict;

alter table public.absences
  drop constraint absences_employee_fk,
  add constraint absences_employee_fk
    foreign key (restaurant_id, employee_id)
    references public.employees(restaurant_id, id)
    on delete restrict;

alter table public.absence_events
  drop constraint absence_events_absence_fk,
  add constraint absence_events_absence_fk
    foreign key (restaurant_id, absence_id)
    references public.absences(restaurant_id, id)
    on delete restrict;

alter table public.work_pattern_exceptions
  drop constraint work_pattern_exceptions_employee_fk,
  add constraint work_pattern_exceptions_employee_fk
    foreign key (restaurant_id, employee_id)
    references public.employees(restaurant_id, id)
    on delete restrict;

alter table public.work_pattern_exception_events
  drop constraint work_pattern_exception_events_exception_fk,
  add constraint work_pattern_exception_events_exception_fk
    foreign key (restaurant_id, work_pattern_exception_id)
    references public.work_pattern_exceptions(restaurant_id, id)
    on delete restrict,
  drop constraint work_pattern_exception_events_employee_fk,
  add constraint work_pattern_exception_events_employee_fk
    foreign key (restaurant_id, employee_id)
    references public.employees(restaurant_id, id)
    on delete restrict;

-- Lifecycle event rows are evidence, not mutable application state.
drop trigger if exists absence_events_append_only
  on public.absence_events;
create trigger absence_events_append_only
before update or delete on public.absence_events
for each row execute function public.reject_audit_evidence_mutation();

drop trigger if exists work_pattern_exception_events_append_only
  on public.work_pattern_exception_events;
create trigger work_pattern_exception_events_append_only
before update or delete on public.work_pattern_exception_events
for each row execute function public.reject_audit_evidence_mutation();

-- Current contracts may be closed and superseded, but a historical contract
-- must never be rewritten or deleted.
create function public.guard_employee_contract_history()
returns trigger
language plpgsql
set search_path = public
as $guard_employee_contract_history$
begin
  if tg_op = 'DELETE' then
    raise exception
      'Employment contracts are retained as operational history.';
  end if;
  if not old.active or not old.is_current then
    raise exception
      'Historical employment contracts are immutable.';
  end if;
  return new;
end
$guard_employee_contract_history$;

create trigger employee_contracts_history_guard
before update or delete on public.employee_contracts
for each row execute function public.guard_employee_contract_history();

create index employee_contracts_employee_history_idx
  on public.employee_contracts (
    restaurant_id,
    employee_id,
    contract_start desc nulls last,
    created_at desc
  );

-- All app-owned routines have an explicit resolution path. Trigger functions
-- are internal implementation details and never browser/service RPCs.
alter function public.generate_four_digit_pin()
  set search_path = public;
alter function public.set_updated_at()
  set search_path = public;

do $close_trigger_routine_grants$
declare
  v_routine regprocedure;
begin
  for v_routine in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prorettype = 'pg_catalog.trigger'::regtype
      and not exists (
        select 1
        from pg_depend d
        where d.classid = 'pg_proc'::regclass
          and d.objid = p.oid
          and d.deptype = 'e'
      )
  loop
    execute format(
      'revoke all on function %s from public, anon, authenticated, service_role',
      v_routine
    );
  end loop;
end
$close_trigger_routine_grants$;

do $model_closure_verification$
declare
  v_routine regprocedure;
begin
  if (
    select count(*)
    from pg_trigger t
    where not t.tgisinternal
      and t.tgname in (
        'absence_events_append_only',
        'work_pattern_exception_events_append_only',
        'employee_contracts_history_guard'
      )
  ) <> 3 then
    raise exception 'Phase 7 evidence guards are incomplete.';
  end if;

  if exists (
    select 1
    from pg_constraint c
    where c.conname in (
      'employee_contracts_employee_fk',
      'absences_employee_fk',
      'absence_events_absence_fk',
      'work_pattern_exceptions_employee_fk',
      'work_pattern_exception_events_exception_fk',
      'work_pattern_exception_events_employee_fk'
    )
      and c.confdeltype <> 'r'
  ) then
    raise exception 'A Phase 7 historical foreign key still permits deletion.';
  end if;

  for v_routine in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prorettype = 'pg_catalog.trigger'::regtype
      and not exists (
        select 1
        from pg_depend d
        where d.classid = 'pg_proc'::regclass
          and d.objid = p.oid
          and d.deptype = 'e'
      )
  loop
    if has_function_privilege('public', v_routine, 'EXECUTE')
       or has_function_privilege('anon', v_routine, 'EXECUTE')
       or has_function_privilege('authenticated', v_routine, 'EXECUTE')
       or has_function_privilege('service_role', v_routine, 'EXECUTE') then
      raise exception 'Trigger helper remains directly executable: %', v_routine;
    end if;
  end loop;
end
$model_closure_verification$;

commit;
