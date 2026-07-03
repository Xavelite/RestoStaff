-- Phase 5 follow-up: remove the unused role argument from the bootstrap builder.
--
-- Preconditions:
-- - Migration 202606210023 is applied.
--
-- Rollback:
-- - Restore the previous internal builder/getter definitions.
-- - No rows or public browser signatures change.
begin;

create function public.build_workspace_bootstrap_read_model(
  p_restaurant_id uuid,
  p_employee_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $bootstrap$
  select jsonb_build_object(
    'restaurant', to_jsonb(r),
    'restaurant_settings', coalesce(
      (
        select to_jsonb(s)
        from public.restaurant_settings s
        where s.restaurant_id = r.id
      ),
      '{}'::jsonb
    ),
    'current_employee', coalesce(
      (
        select to_jsonb(e)
        from public.employees e
        where e.restaurant_id = r.id
          and e.id = p_employee_id
      ),
      'null'::jsonb
    ),
    'readiness', jsonb_build_object(
      'has_active_employees', exists (
        select 1 from public.employees e
        where e.restaurant_id = r.id and e.active
      ),
      'has_active_areas', exists (
        select 1 from public.work_areas a
        where a.restaurant_id = r.id and a.active
      ),
      'has_active_job_functions', exists (
        select 1 from public.job_functions j
        where j.restaurant_id = r.id and j.active
      ),
      'has_open_services', exists (
        select 1 from public.opening_hours h
        where h.restaurant_id = r.id and h.is_open
      ),
      'has_coverage_rules', exists (
        select 1 from public.coverage_requirements c
        where c.restaurant_id = r.id and c.active
      ),
      'has_absence_policy', exists (
        select 1 from public.absence_types a
        where a.restaurant_id = r.id and a.active
      )
    )
  )
  from public.restaurants r
  where r.id = p_restaurant_id
$bootstrap$;

create or replace function public.get_workspace_bootstrap(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $get_bootstrap$
declare
  v_context record;
begin
  select * into v_context from public.require_workspace_read_context(p_restaurant_id);
  return public.build_workspace_bootstrap_read_model(
    p_restaurant_id, v_context.employee_id
  );
end
$get_bootstrap$;

drop function public.build_workspace_bootstrap_read_model(uuid,text,uuid);

revoke all on function public.build_workspace_bootstrap_read_model(uuid,uuid)
  from public, anon, authenticated;
revoke all on function public.get_workspace_bootstrap(uuid)
  from public, anon, authenticated;
grant execute on function public.get_workspace_bootstrap(uuid) to authenticated;

commit;
