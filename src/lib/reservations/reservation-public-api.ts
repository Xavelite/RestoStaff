import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
import type { Json } from '$lib/supabase/database.types';
import {
  parsePublicAvailabilitySlots,
  parsePublicReservationConfirmation,
  parsePublicReservationContext,
  parsePublicReservationHold,
  type PublicAvailabilitySlot,
  type PublicReservationConfirmation,
  type PublicReservationContext,
  type PublicReservationHold
} from './reservation-types';

type PublicBookingAction = 'context' | 'availability' | 'holds' | 'release' | 'confirm';

async function request(
  action: PublicBookingAction,
  publicKey: string,
  websiteOrigin: string,
  body: Record<string, unknown>,
  idempotencyKey?: string,
  embedSession?: string
): Promise<Json> {
  const response = await fetch(
    `${PUBLIC_SUPABASE_URL}/functions/v1/reservation-public/${action}`,
    {
      method: 'POST',
      headers: {
        apikey: PUBLIC_SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        'X-Restogogo-Key': publicKey,
        'X-Restogogo-Origin': websiteOrigin,
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        ...(embedSession ? { 'X-Restogogo-Session': embedSession } : {})
      },
      body: JSON.stringify(body)
    }
  );
  const result = (await response.json().catch(() => ({}))) as Json;
  if (!response.ok) {
    const message =
      result && typeof result === 'object' && !Array.isArray(result)
        ? String((result as Record<string, Json | undefined>).error ?? '')
        : '';
    throw new Error(message || 'The booking request could not be completed.');
  }
  return result;
}

export async function getPublicReservationContext(
  publicKey: string,
  websiteOrigin: string,
  embedSession = ''
): Promise<PublicReservationContext> {
  return parsePublicReservationContext(
    await request('context', publicKey, websiteOrigin, {}, undefined, embedSession)
  );
}

export async function searchPublicReservationAvailability(
  publicKey: string,
  websiteOrigin: string,
  input: {
    businessDate: string;
    serviceKey: string;
    partySize: number;
    areaId?: string;
  },
  embedSession = ''
): Promise<PublicAvailabilitySlot[]> {
  return parsePublicAvailabilitySlots(
    await request(
      'availability',
      publicKey,
      websiteOrigin,
      {
        business_date: input.businessDate,
        service_key: input.serviceKey,
        party_size: input.partySize,
        area_id: input.areaId || undefined
      },
      undefined,
      embedSession
    )
  );
}

export async function createPublicReservationHold(
  publicKey: string,
  websiteOrigin: string,
  input: {
    businessDate: string;
    serviceKey: string;
    localTime: string;
    partySize: number;
    areaId?: string;
  },
  idempotencyKey: string,
  embedSession = ''
): Promise<PublicReservationHold> {
  return parsePublicReservationHold(
    await request(
      'holds',
      publicKey,
      websiteOrigin,
      {
        business_date: input.businessDate,
        service_key: input.serviceKey,
        local_time: input.localTime,
        party_size: input.partySize,
        area_id: input.areaId || undefined
      },
      idempotencyKey,
      embedSession
    )
  );
}

export async function confirmPublicReservation(
  publicKey: string,
  websiteOrigin: string,
  holdToken: string,
  guest: {
    name: string;
    email: string;
    phone: string;
    comment: string;
    languageCode: string;
  },
  idempotencyKey: string,
  embedSession = ''
): Promise<PublicReservationConfirmation> {
  return parsePublicReservationConfirmation(
    await request(
      'confirm',
      publicKey,
      websiteOrigin,
      {
        hold_token: holdToken,
        guest: {
          name: guest.name,
          email: guest.email,
          phone: guest.phone,
          comment: guest.comment,
          language_code: guest.languageCode
        }
      },
      idempotencyKey,
      embedSession
    )
  );
}

export async function releasePublicReservationHold(
  publicKey: string,
  websiteOrigin: string,
  holdToken: string,
  embedSession = ''
): Promise<void> {
  await request(
    'release',
    publicKey,
    websiteOrigin,
    { hold_token: holdToken },
    undefined,
    embedSession
  );
}
