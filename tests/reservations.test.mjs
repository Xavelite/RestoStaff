import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const {
  parseAvailability,
  parseReservationSetup,
  parseReservationWorkspace
} = await import('../src/lib/reservations/reservation-types.ts');
const {
  RESERVATION_STATUSES,
  RESERVATION_STATUS,
  reservationStatusMeta
} = await import('../src/lib/reservations/reservation-status.ts');
const { moduleForPath, subNavItemForPath } = await import('../src/lib/classic/classic-nav.ts');

test('reservation navigation is a live workspace with setup beneath it', () => {
  const reservations = moduleForPath('/reservations');
  assert.equal(reservations?.key, 'reservations');
  assert.equal(reservations?.href, '/reservations');
  assert.equal(subNavItemForPath(reservations, '/reservations')?.href, '/reservations');
  assert.equal(
    subNavItemForPath(reservations, '/reservations/bookings')?.href,
    '/reservations/bookings'
  );
  assert.equal(
    subNavItemForPath(reservations, '/reservations/floor-plans')?.href,
    '/reservations/floor-plans'
  );
  assert.equal(
    subNavItemForPath(reservations, '/reservations/setup')?.href,
    '/reservations/setup'
  );
});

test('every reservation lifecycle status has one centralized visual definition', () => {
  assert.deepEqual(Object.keys(RESERVATION_STATUS), RESERVATION_STATUSES);
  for (const status of RESERVATION_STATUSES) {
    const meta = reservationStatusMeta(status);
    assert.ok(meta.label);
    assert.ok(meta.tone);
    assert.ok(meta.symbol);
  }
});

test('reservation JSON parsers provide stable safe defaults', () => {
  assert.deepEqual(parseReservationWorkspace({}), {
    restaurantId: '',
    businessDate: '',
    timezone: 'Europe/Brussels',
    services: [],
    rooms: [],
    tables: [],
    reservations: []
  });
  assert.deepEqual(parseReservationSetup({}), {
    restaurantId: '',
    services: [],
    areas: [],
    rooms: [],
    tables: [],
    combinations: [],
    exceptions: []
  });
  assert.deepEqual(parseAvailability({ available: true, code: 'available' }), {
    available: true,
    code: 'available',
    reason: undefined,
    starts_at: undefined,
    ends_at: undefined,
    booked_covers: undefined,
    maximum_covers: undefined,
    automatic_confirmation: undefined
  });
});

test('venue editor can create reservation rooms during its first transactional save', async () => {
  const migration = await readFile(
    'supabase/migrations/20260726153118_upsert_reservation_rooms_from_venue_editor.sql',
    'utf8'
  );

  assert.match(migration, /insert into public\.reservation_rooms/i);
  assert.match(migration, /on conflict \(id\) do update set/i);
  assert.match(migration, /work_area_id = excluded\.work_area_id/i);
});
