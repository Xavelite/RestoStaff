-- Keep the private planning draft relations efficient as the restaurant history
-- grows. These indexes cover the foreign-key lookup paths used by validation
-- and cascading relationship checks.
create index planning_draft_shifts_employee_idx
  on public.planning_draft_shifts (restaurant_id, employee_id);

create index planning_draft_shifts_service_idx
  on public.planning_draft_shifts (restaurant_id, service_key);

create index planning_draft_shifts_area_idx
  on public.planning_draft_shifts (restaurant_id, area_id)
  where area_id is not null;

create index planning_draft_shifts_job_function_idx
  on public.planning_draft_shifts (restaurant_id, job_function_id)
  where job_function_id is not null;

create index planning_draft_notes_service_idx
  on public.planning_draft_notes (restaurant_id, service_key);

create index work_weeks_planning_draft_author_idx
  on public.work_weeks (planning_draft_updated_by_profile_id)
  where planning_draft_updated_by_profile_id is not null;
