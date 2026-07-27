import { supabase } from '$lib/supabase/client';
import { toApiError } from '$lib/api/error';
import { asJson, asJsonArray } from '$lib/api/json';
import type { RestaurantSavePayload } from '$lib/api/mutations';
import {
  parseAvailability,
  parseReservationFloorPlans,
  parseReservationSetup,
  parseReservationWorkspace,
  type AvailabilityResult,
  type ReservationDemand,
  type ReservationDraft,
  type ReservationFloorPlans,
  type ReservationFloorPlansDraft,
  type ReservationSetup,
  type ReservationSetupDraft,
  type ReservationStatus,
  type ReservationWorkspace
} from './reservation-types';

export async function getReservationWorkspace(
  restaurantId: string,
  businessDate: string
): Promise<ReservationWorkspace> {
  const { data, error } = await supabase.rpc('get_reservation_workspace', {
    p_restaurant_id: restaurantId,
    p_business_date: businessDate
  });
  if (error) throw toApiError(error, 'Reservations could not be loaded.');
  return parseReservationWorkspace(data);
}

export async function getReservationSetup(
  restaurantId: string
): Promise<ReservationSetup> {
  const { data, error } = await supabase.rpc('get_reservation_setup', {
    p_restaurant_id: restaurantId
  });
  if (error) throw toApiError(error, 'Reservation setup could not be loaded.');
  return parseReservationSetup(data);
}

export async function getReservationFloorPlans(
  restaurantId: string
): Promise<ReservationFloorPlans> {
  const { data, error } = await supabase.rpc('get_reservation_floor_plans', {
    p_restaurant_id: restaurantId
  });
  if (error) throw toApiError(error, 'Floor plans could not be loaded.');
  return parseReservationFloorPlans(data);
}

export async function saveReservationFloorPlans(
  restaurantId: string,
  draft: ReservationFloorPlansDraft,
  expectedRevision: number
): Promise<void> {
  const { error } = await supabase.rpc('save_reservation_floor_plans', {
    p_restaurant_id: restaurantId,
    p_floors: asJsonArray(draft.floors),
    p_rooms: asJsonArray(draft.rooms),
    p_tables: asJsonArray(draft.tables),
    p_combinations: asJsonArray(draft.combinations),
    p_expected_revision: expectedRevision
  });
  if (error) throw toApiError(error, 'Floor plans could not be saved.');
}

export async function saveReservationSetup(
  restaurantId: string,
  draft: ReservationSetupDraft,
  expectedRevision: number
): Promise<void> {
  const { error } = await supabase.rpc('save_reservation_setup', {
    p_restaurant_id: restaurantId,
    p_services: asJsonArray(draft.services),
    p_rooms: asJsonArray(draft.rooms),
    p_tables: asJsonArray(draft.tables),
    p_combinations: asJsonArray(draft.combinations),
    p_exceptions: asJsonArray(draft.exceptions),
    p_expected_revision: expectedRevision
  });
  if (error) throw toApiError(error, 'Reservation setup could not be saved.');
}

export async function saveRestaurantAreasModel(
  restaurantId: string,
  restaurant: RestaurantSavePayload,
  draft: ReservationFloorPlansDraft,
  expectedRevision: number
): Promise<void> {
  const { error } = await supabase.rpc('save_venue_model', {
    p_restaurant_id: restaurantId,
    p_restaurant: restaurant.restaurant,
    p_settings: restaurant.settings,
    p_job_functions: restaurant.jobFunctions,
    p_areas: restaurant.areas,
    p_opening_hours: restaurant.openingHours,
    p_area_service_defaults: restaurant.areaServiceDefaults,
    p_coverage_requirements: restaurant.coverageRequirements,
    p_floors: asJsonArray(draft.floors),
    p_rooms: asJsonArray(draft.rooms),
    p_tables: asJsonArray(draft.tables),
    p_combinations: asJsonArray(draft.combinations),
    p_expected_revision: expectedRevision
  });
  if (error) throw toApiError(error, 'Restaurant areas could not be saved.');
}

export async function checkReservationAvailability(
  restaurantId: string,
  draft: ReservationDraft
): Promise<AvailabilityResult> {
  const { data, error } = await supabase.rpc('check_reservation_availability', {
    p_restaurant_id: restaurantId,
    p_business_date: draft.business_date,
    p_service_key: draft.service_key,
    p_local_time: draft.local_time,
    p_party_size: draft.party_size,
    p_room_id: draft.room_preference_id || undefined,
    p_exclude_reservation_id: draft.id || undefined
  });
  if (error) throw toApiError(error, 'Availability could not be checked.');
  return parseAvailability(data);
}

export async function saveReservation(
  restaurantId: string,
  draft: ReservationDraft
): Promise<void> {
  const { error } = await supabase.rpc('save_reservation', {
    p_restaurant_id: restaurantId,
    p_reservation: asJson(draft)
  });
  if (error) throw toApiError(error, 'Reservation could not be saved.');
}

export async function setReservationStatus(
  restaurantId: string,
  reservationId: string,
  status: ReservationStatus,
  expectedRevision: number,
  comment = ''
): Promise<void> {
  const { error } = await supabase.rpc('set_reservation_status', {
    p_restaurant_id: restaurantId,
    p_reservation_id: reservationId,
    p_status: status,
    p_expected_revision: expectedRevision,
    p_comment: comment || undefined
  });
  if (error) throw toApiError(error, 'Reservation status could not be updated.');
}

export async function getReservationDemand(
  restaurantId: string,
  fromDate: string,
  toDate: string
): Promise<ReservationDemand[]> {
  const { data, error } = await supabase.rpc('get_reservation_demand', {
    p_restaurant_id: restaurantId,
    p_from_date: fromDate,
    p_to_date: toDate
  });
  if (error) throw toApiError(error, 'Reservation demand could not be loaded.');
  return (data ?? []).map((row) => ({
    ...row,
    first_arrival: row.first_arrival ?? null,
    last_arrival: row.last_arrival ?? null
  }));
}
