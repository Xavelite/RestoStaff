-- Payroll helper search-path closure.
--
-- Preconditions:
-- - 202606240033_payroll_export_columns.sql has been applied.
-- Rollback strategy:
-- - None expected. The helper is internal and immutable; this only pins routine
--   name resolution to the public schema.
-- Product contract:
-- - Every app-owned SQL/PLpgSQL routine has an explicit search_path.

begin;

alter function public.payroll_export_field_label(text)
  set search_path = public;

do $payroll_helper_search_path$
begin
  if not exists (
    select 1
    from pg_proc p
    where p.oid = 'public.payroll_export_field_label(text)'::regprocedure
      and exists (
        select 1
        from unnest(coalesce(p.proconfig, array[]::text[])) setting
        where setting = 'search_path=public'
      )
  ) then
    raise exception 'Payroll export field-label helper must have an explicit search_path.';
  end if;
end
$payroll_helper_search_path$;

commit;
