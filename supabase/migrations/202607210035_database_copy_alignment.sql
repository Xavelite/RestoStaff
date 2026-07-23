-- Keep authoritative database errors and audit evidence aligned with the
-- visible Schedule and Timesheet product terminology.
begin;

do $copy_alignment$
declare
  v_definition text;
  v_aligned text;
begin
  select pg_get_functiondef('public.guard_actuals_approval()'::regprocedure)
  into v_definition;

  v_aligned := replace(replace(v_definition, 'Planning', 'Schedule'), 'Actuals', 'Timesheet');
  if v_aligned = v_definition then
    raise exception 'Schedule and Timesheet copy alignment contract drifted.';
  end if;

  execute v_aligned;
end
$copy_alignment$;

commit;
