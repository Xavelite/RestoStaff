-- V580: align finalization checks with the existing reconciliation lifecycle.
begin;

create or replace function public.set_payroll_run_status(
  p_restaurant_id uuid,
  p_payroll_run_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.payroll_runs%rowtype;
begin
  if not public.is_owner(p_restaurant_id) then
    raise exception 'Only an owner can change payroll status.';
  end if;
  select * into v_run from public.payroll_runs
  where restaurant_id = p_restaurant_id and id = p_payroll_run_id for update;
  if v_run.id is null then raise exception 'Payroll run not found.'; end if;

  if v_run.status = 'calculated' and p_status = 'reviewed' then
    update public.payroll_runs set status = 'reviewed', reviewed_at = now(),
      reviewed_by_profile_id = public.current_profile_id() where id = v_run.id;
  elsif v_run.status = 'reviewed' and p_status = 'locked_estimate' then
    update public.payroll_runs set status = 'locked_estimate' where id = v_run.id;
  elsif v_run.status in ('reviewed','locked_estimate') and p_status = 'reconciled' then
    if not exists (
      select 1 from public.payroll_reconciliations r where r.payroll_run_id = v_run.id
    ) then
      raise exception 'Import and reconcile authoritative provider results first.';
    end if;
    if exists (
      select 1 from public.payroll_reconciliations r
      where r.payroll_run_id = v_run.id and r.status = 'open'
    ) then
      raise exception 'Resolve every provider variance before reconciliation.';
    end if;
    update public.payroll_runs set status = 'reconciled', calculation_quality = 'reconciled',
      reconciled_at = now(), reconciled_by_profile_id = public.current_profile_id()
    where id = v_run.id;
  elsif v_run.status = 'reconciled' and p_status = 'finalized' then
    update public.payroll_runs set status = 'finalized', finalized_at = now(),
      finalized_by_profile_id = public.current_profile_id() where id = v_run.id;
    update public.payroll_periods set status = 'closed' where id = v_run.payroll_period_id;
  else
    raise exception 'Unsupported payroll status transition from % to %.', v_run.status, p_status;
  end if;
  return jsonb_build_object('ok', true, 'status', p_status);
end
$$;

commit;
