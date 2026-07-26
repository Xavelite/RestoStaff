-- Cover reservation foreign keys used by joins and cascading integrity checks.
-- These are intentionally narrow: existing restaurant/date indexes already
-- cover the tenant-scoped hot paths.

create index reservation_events_actor_profile_idx
  on public.reservation_events (actor_profile_id)
  where actor_profile_id is not null;

create index reservation_guests_preferred_room_idx
  on public.reservation_guests (restaurant_id, preferred_room_id)
  where preferred_room_id is not null;

create index reservation_guests_preferred_table_idx
  on public.reservation_guests (restaurant_id, preferred_table_id)
  where preferred_table_id is not null;

create index reservation_service_exceptions_created_by_idx
  on public.reservation_service_exceptions (created_by_profile_id)
  where created_by_profile_id is not null;

create index reservation_assignments_assigned_by_idx
  on public.reservation_table_assignments (assigned_by_profile_id)
  where assigned_by_profile_id is not null;

create index reservation_combination_members_table_idx
  on public.reservation_table_combination_members (restaurant_id, table_id);

create index reservations_created_by_idx
  on public.reservations (created_by_profile_id)
  where created_by_profile_id is not null;

create index reservations_guest_idx
  on public.reservations (restaurant_id, guest_id);

create index reservations_room_preference_idx
  on public.reservations (restaurant_id, room_preference_id)
  where room_preference_id is not null;

create index reservations_service_idx
  on public.reservations (restaurant_id, service_key);

create index reservations_updated_by_idx
  on public.reservations (updated_by_profile_id)
  where updated_by_profile_id is not null;
