-- Keep user-visible database errors aligned with the current product language.
do $migration$
declare
  v_function oid;
  v_definition text;
begin
  for v_function in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'create_payroll_export_run',
        'guard_actuals_approval',
        'guard_time_entry_history',
        'save_actuals_lifecycle',
        'save_manager_planning'
      )
  loop
    v_definition := pg_get_functiondef(v_function);
    v_definition := replace(v_definition, 'Actuals', 'Timesheet');
    v_definition := replace(v_definition, 'Planning', 'Schedule');
    execute v_definition;
  end loop;
end
$migration$;
