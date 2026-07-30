begin;

alter function public.require_owner_or_manager_context(uuid) stable;

create or replace function public.discard_manager_planning_draft(
  p_restaurant_id uuid,
  p_week_start date,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $discard_planning_draft$
declare
  v_week public.work_weeks%rowtype;
  v_next_revision bigint;
begin
  perform 1 from public.require_owner_or_manager_context(p_restaurant_id);

  perform pg_advisory_xact_lock(
    hashtextextended(p_restaurant_id::text || ':planning:' || p_week_start::text, 0)
  );

  select * into v_week
  from public.work_weeks
  where restaurant_id = p_restaurant_id and week_start = p_week_start
  for update;

  if v_week.restaurant_id is null
      or v_week.planning_status <> 'published'
      or not v_week.planning_has_unpublished_changes then
    raise exception 'No private planning draft exists for this week.';
  end if;
  if p_expected_revision is null or v_week.planning_revision <> p_expected_revision then
    raise exception 'CONFLICT: This planning week changed in another session. Reload before discarding.';
  end if;
  if v_week.actuals_status in ('approved', 'locked') then
    raise exception 'Schedule is locked because Timesheet is %.', v_week.actuals_status;
  end if;

  delete from public.planning_draft_shifts
  where restaurant_id = p_restaurant_id and week_start = p_week_start;
  delete from public.planning_draft_notes
  where restaurant_id = p_restaurant_id and week_start = p_week_start;

  v_next_revision := v_week.planning_revision + 1;
  update public.work_weeks
  set planning_revision = v_next_revision,
      planning_has_unpublished_changes = false,
      planning_draft_updated_at = null,
      planning_draft_updated_by_profile_id = null,
      updated_at = now()
  where restaurant_id = p_restaurant_id and week_start = p_week_start;

  return jsonb_build_object(
    'ok', true,
    'restaurant_id', p_restaurant_id,
    'planning_revision', v_next_revision
  );
end
$discard_planning_draft$;

revoke all on function public.discard_manager_planning_draft(uuid, date, bigint)
  from public, anon;
grant execute on function public.discard_manager_planning_draft(uuid, date, bigint)
  to authenticated;

notify pgrst, 'reload schema';
commit;
