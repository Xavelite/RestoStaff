import type { Json } from '$lib/supabase/database.types';

export type ReservationStatus =
  | 'pending'
  | 'confirmed'
  | 'arrived'
  | 'waiting'
  | 'seated'
  | 'finished'
  | 'cancelled'
  | 'no_show';

export type ReservationSource =
  | 'internal'
  | 'phone'
  | 'walk_in'
  | 'widget'
  | 'integration';

export type ReservationServiceSetting = {
  restaurant_id: string;
  service_key: string;
  booking_enabled: boolean;
  automatic_confirmation: boolean;
  slot_interval_minutes: number;
  default_duration_minutes: number;
  turn_time_minutes: number;
  minimum_party_size: number;
  maximum_party_size: number;
  maximum_covers: number | null;
  booking_cutoff_minutes: number;
  advance_booking_days: number;
};

export type ReservationService = {
  service_key: string;
  name: string;
  sort_order: number;
  active: boolean;
  setting: ReservationServiceSetting | null;
  opening?: {
    weekday: number;
    is_open: boolean;
    opens_at: string | null;
    closes_at: string | null;
  } | null;
  opening_hours?: Array<{
    weekday: number;
    is_open: boolean;
    opens_at: string | null;
    closes_at: string | null;
  }>;
  exception?: ReservationException | null;
};

export type ReservationArea = {
  id: string;
  name: string;
  code: string;
  catalogue_key: string | null;
  color: string | null;
  icon_key: string | null;
  instance_number: number;
  floor_level: number | null;
  active: boolean;
  sort_order: number;
  metadata: Json;
};

export type ReservationFloor = {
  id: string;
  restaurant_id: string;
  name: string;
  level: number;
  canvas_width: number;
  canvas_height: number;
  active: boolean;
  sort_order: number;
};

export type ReservationRoom = {
  id: string;
  restaurant_id: string;
  work_area_id: string;
  floor_id: string | null;
  name: string;
  area_code: string;
  area_color: string | null;
  area_icon?: string | null;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  active: boolean;
  sort_order: number;
};

export type ReservationTable = {
  id: string;
  restaurant_id: string;
  room_id: string;
  label: string;
  minimum_capacity: number;
  maximum_capacity: number;
  shape: 'round' | 'square' | 'rectangle';
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  rotation_degrees: number;
  active: boolean;
  blocked: boolean;
  sort_order: number;
};

export type ReservationCombination = {
  id: string;
  restaurant_id: string;
  room_id: string;
  name: string;
  minimum_capacity: number;
  maximum_capacity: number;
  active: boolean;
  sort_order: number;
  table_ids: string[];
};

export type ReservationException = {
  id: string;
  restaurant_id: string;
  service_key: string;
  business_date: string;
  availability: 'closed' | 'open';
  opens_at: string | null;
  closes_at: string | null;
  reason: string | null;
};

export type ReservationGuest = {
  id: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  language_code: string;
  preferences: string | null;
  allergies: string | null;
  internal_notes: string | null;
};

export type Reservation = {
  id: string;
  restaurant_id: string;
  guest_id: string;
  business_date: string;
  service_key: string;
  starts_at: string;
  ends_at: string;
  party_size: number;
  status: ReservationStatus;
  source: ReservationSource;
  room_preference_id: string | null;
  preferred_table_id: string | null;
  guest_comment: string | null;
  internal_notes: string | null;
  assignment_locked: boolean;
  revision: number;
  guest: ReservationGuest;
  table_ids: string[];
  table_labels: string[];
};

export type ReservationWorkspace = {
  restaurantId: string;
  businessDate: string;
  timezone: string;
  services: ReservationService[];
  rooms: ReservationRoom[];
  tables: ReservationTable[];
  reservations: Reservation[];
};

export type ReservationSetup = {
  restaurantId: string;
  revision: number;
  services: ReservationService[];
  areas: ReservationArea[];
  rooms: ReservationRoom[];
  tables: ReservationTable[];
  combinations: ReservationCombination[];
  exceptions: ReservationException[];
};

export type ReservationFloorPlans = {
  restaurantId: string;
  revision: number;
  floors: ReservationFloor[];
  areas: ReservationArea[];
  rooms: ReservationRoom[];
  tables: ReservationTable[];
  combinations: ReservationCombination[];
};

export type ReservationDemand = {
  business_date: string;
  service_key: string;
  reservation_count: number;
  expected_covers: number;
  first_arrival: string | null;
  last_arrival: string | null;
};

export type ReservationDraft = {
  id?: string;
  guest_id?: string;
  expected_revision?: number;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  business_date: string;
  service_key: string;
  local_time: string;
  party_size: number;
  room_preference_id: string;
  preferred_table_id: string;
  source: ReservationSource;
  guest_comment: string;
  internal_notes: string;
  language_code: string;
};

export type AvailabilityResult = {
  available: boolean;
  code: string;
  reason?: string;
  starts_at?: string;
  ends_at?: string;
  booked_covers?: number;
  maximum_covers?: number | null;
  automatic_confirmation?: boolean;
};

export type ReservationServiceDraft = ReservationServiceSetting;
export type ReservationRoomDraft = Pick<
  ReservationRoom,
  | 'id'
  | 'work_area_id'
  | 'floor_id'
  | 'position_x'
  | 'position_y'
  | 'width'
  | 'height'
  | 'active'
  | 'sort_order'
>;
export type ReservationTableDraft = Omit<ReservationTable, 'restaurant_id'>;
export type ReservationCombinationDraft = Omit<ReservationCombination, 'restaurant_id'>;

export type ReservationSetupDraft = {
  services: ReservationServiceDraft[];
  rooms: ReservationRoomDraft[];
  tables: ReservationTableDraft[];
  combinations: ReservationCombinationDraft[];
  exceptions: ReservationException[];
};

export type ReservationFloorPlansDraft = {
  floors: ReservationFloor[];
  rooms: ReservationRoomDraft[];
  tables: ReservationTableDraft[];
  combinations: ReservationCombinationDraft[];
};

type RecordLike = Record<string, unknown>;

function record(value: unknown): RecordLike {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as RecordLike)
    : {};
}

function rows<T>(value: RecordLike, key: string): T[] {
  return Array.isArray(value[key]) ? (value[key] as T[]) : [];
}

export function parseReservationWorkspace(value: Json): ReservationWorkspace {
  const data = record(value);
  return {
    restaurantId: String(data.restaurant_id ?? ''),
    businessDate: String(data.business_date ?? ''),
    timezone: String(data.timezone ?? 'Europe/Brussels'),
    services: rows(data, 'services'),
    rooms: rows(data, 'rooms'),
    tables: rows(data, 'tables'),
    reservations: rows(data, 'reservations')
  };
}

export function parseReservationSetup(value: Json): ReservationSetup {
  const data = record(value);
  return {
    restaurantId: String(data.restaurant_id ?? ''),
    revision: Number(data.revision ?? 0),
    services: rows(data, 'services'),
    areas: rows(data, 'areas'),
    rooms: rows(data, 'rooms'),
    tables: rows(data, 'tables'),
    combinations: rows(data, 'combinations'),
    exceptions: rows(data, 'exceptions')
  };
}

export function parseReservationFloorPlans(value: Json): ReservationFloorPlans {
  const data = record(value);
  return {
    restaurantId: String(data.restaurant_id ?? ''),
    revision: Number(data.revision ?? 0),
    floors: rows(data, 'floors'),
    areas: rows(data, 'areas'),
    rooms: rows(data, 'rooms'),
    tables: rows(data, 'tables'),
    combinations: rows(data, 'combinations')
  };
}

export function parseAvailability(value: Json): AvailabilityResult {
  const data = record(value);
  return {
    available: data.available === true,
    code: String(data.code ?? ''),
    reason: typeof data.reason === 'string' ? data.reason : undefined,
    starts_at: typeof data.starts_at === 'string' ? data.starts_at : undefined,
    ends_at: typeof data.ends_at === 'string' ? data.ends_at : undefined,
    booked_covers:
      typeof data.booked_covers === 'number' ? data.booked_covers : undefined,
    maximum_covers:
      typeof data.maximum_covers === 'number' || data.maximum_covers === null
        ? data.maximum_covers
        : undefined,
    automatic_confirmation:
      typeof data.automatic_confirmation === 'boolean'
        ? data.automatic_confirmation
        : undefined
  };
}

export type ReservationPublicChannel = {
  configured: boolean;
  restaurantId: string;
  restaurantName: string;
  id: string | null;
  name: string;
  publicKey: string | null;
  enabled: boolean;
  allowedOrigins: string[];
  updatedAt: string | null;
};

export type PublicReservationService = {
  key: string;
  name: string;
  minimumPartySize: number;
  maximumPartySize: number;
  advanceBookingDays: number;
  bookingCutoffMinutes: number;
  slotIntervalMinutes: number;
};

export type PublicReservationArea = {
  id: string;
  name: string;
};

export type PublicReservationContext = {
  restaurant: {
    name: string;
    timezone: string;
  };
  services: PublicReservationService[];
  areas: PublicReservationArea[];
};

export type PublicAvailabilitySlot = {
  localTime: string;
  startsAt: string;
  endsAt: string;
};

export type PublicReservationHold = {
  holdToken: string;
  expiresAt: string;
  businessDate: string;
  serviceKey: string;
  localTime: string;
  partySize: number;
  areaId: string | null;
};

export type PublicReservationConfirmation = {
  reservationId: string;
  status: 'pending' | 'confirmed';
  businessDate: string;
  serviceKey: string;
  startsAt: string;
  partySize: number;
};

export function parseReservationPublicChannel(value: Json): ReservationPublicChannel {
  const data = record(value);
  return {
    configured: data.configured === true,
    restaurantId: String(data.restaurant_id ?? ''),
    restaurantName: String(data.restaurant_name ?? ''),
    id: typeof data.id === 'string' ? data.id : null,
    name: String(data.name ?? 'Website widget'),
    publicKey: typeof data.public_key === 'string' ? data.public_key : null,
    enabled: data.enabled === true,
    allowedOrigins: Array.isArray(data.allowed_origins)
      ? data.allowed_origins.filter((origin): origin is string => typeof origin === 'string')
      : [],
    updatedAt: typeof data.updated_at === 'string' ? data.updated_at : null
  };
}

export function parsePublicReservationContext(value: Json): PublicReservationContext {
  const data = record(value);
  const restaurant = record(data.restaurant);
  return {
    restaurant: {
      name: String(restaurant.name ?? ''),
      timezone: String(restaurant.timezone ?? 'Europe/Brussels')
    },
    services: rows<RecordLike>(data, 'services').map((service) => ({
      key: String(service.key ?? ''),
      name: String(service.name ?? ''),
      minimumPartySize: Number(service.minimum_party_size ?? 1),
      maximumPartySize: Number(service.maximum_party_size ?? 12),
      advanceBookingDays: Number(service.advance_booking_days ?? 180),
      bookingCutoffMinutes: Number(service.booking_cutoff_minutes ?? 0),
      slotIntervalMinutes: Number(service.slot_interval_minutes ?? 15)
    })),
    areas: rows<RecordLike>(data, 'areas').map((area) => ({
      id: String(area.id ?? ''),
      name: String(area.name ?? '')
    }))
  };
}

export function parsePublicAvailabilitySlots(value: Json): PublicAvailabilitySlot[] {
  return rows<RecordLike>(record(value), 'slots').map((slot) => ({
    localTime: String(slot.local_time ?? ''),
    startsAt: String(slot.starts_at ?? ''),
    endsAt: String(slot.ends_at ?? '')
  }));
}

export function parsePublicReservationHold(value: Json): PublicReservationHold {
  const data = record(value);
  return {
    holdToken: String(data.hold_token ?? ''),
    expiresAt: String(data.expires_at ?? ''),
    businessDate: String(data.business_date ?? ''),
    serviceKey: String(data.service_key ?? ''),
    localTime: String(data.local_time ?? ''),
    partySize: Number(data.party_size ?? 0),
    areaId: typeof data.area_id === 'string' ? data.area_id : null
  };
}

export function parsePublicReservationConfirmation(
  value: Json
): PublicReservationConfirmation {
  const data = record(value);
  return {
    reservationId: String(data.reservation_id ?? ''),
    status: data.status === 'confirmed' ? 'confirmed' : 'pending',
    businessDate: String(data.business_date ?? ''),
    serviceKey: String(data.service_key ?? ''),
    startsAt: String(data.starts_at ?? ''),
    partySize: Number(data.party_size ?? 0)
  };
}
