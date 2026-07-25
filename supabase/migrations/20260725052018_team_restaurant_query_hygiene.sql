-- V586: remove a duplicate station SELECT policy and add relationship indexes
-- used by the Restaurant and Team workspaces.

drop policy if exists restaurant_stations_write on public.restaurant_stations;

create policy restaurant_stations_insert
  on public.restaurant_stations
  for insert
  to authenticated
  with check (public.is_owner_or_manager(restaurant_id));

create policy restaurant_stations_update
  on public.restaurant_stations
  for update
  to authenticated
  using (public.is_owner_or_manager(restaurant_id))
  with check (public.is_owner_or_manager(restaurant_id));

create policy restaurant_stations_delete
  on public.restaurant_stations
  for delete
  to authenticated
  using (public.is_owner_or_manager(restaurant_id));

create index if not exists employee_contracts_restaurant_contract_type_idx
  on public.employee_contracts (restaurant_id, contract_type_id);
create index if not exists employee_job_functions_restaurant_position_idx
  on public.employee_job_functions (restaurant_id, job_function_id, active);
create index if not exists coverage_requirements_restaurant_area_idx
  on public.coverage_requirements (restaurant_id, area_id);
create index if not exists coverage_requirements_restaurant_position_idx
  on public.coverage_requirements (restaurant_id, job_function_id);
create index if not exists coverage_requirements_restaurant_service_idx
  on public.coverage_requirements (restaurant_id, service_key);
create index if not exists area_service_defaults_restaurant_service_idx
  on public.area_service_defaults (restaurant_id, service_key);
create index if not exists absences_restaurant_type_idx
  on public.absences (restaurant_id, absence_type_id);
create index if not exists absences_restaurant_service_idx
  on public.absences (restaurant_id, service_key);
