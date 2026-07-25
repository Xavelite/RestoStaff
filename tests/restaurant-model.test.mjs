import assert from 'node:assert/strict';
import test from 'node:test';

import { setupItemCode } from '../src/lib/restaurant/setup-item-code.ts';

test('new restaurant items derive their code from the complete current name', () => {
  const id = '12345678-1234-1234-1234-123456789abc';

  assert.equal(setupItemCode('C', id, 'position'), 'c');
  assert.equal(setupItemCode('Chef de rang', id, 'position'), 'chef-de-rang');
  assert.equal(setupItemCode('Cuisine Chaud', id, 'area'), 'cuisine-chaud');
});

test('empty restaurant item names keep a deterministic technical fallback', () => {
  const id = '12345678-1234-1234-1234-123456789abc';

  assert.equal(setupItemCode('', id, 'area'), 'area-12345678');
  assert.equal(setupItemCode('', id, 'position'), 'position-12345678');
});

test('restaurant hours preserve lunch and evening opening states independently', async () => {
  const { restaurantDraft, restaurantSavePayload } = await import('../src/lib/restaurant/restaurant-model.ts');
  const snapshot = {
    restaurant: {
      id: 'restaurant-1',
      name: 'Demo',
      legal_name: 'Demo',
      company_number: null,
      email: null,
      phone: null,
      address_line1: null,
      postal_code: null,
      city: null
    },
    restaurant_settings: {
      timezone: 'Europe/Brussels',
      locale: 'en-BE',
      currency_code: 'EUR',
      active_week_start: '2026-07-20',
      settings: {},
      payroll_settings: {}
    },
    job_functions: [
      {
        id: 'position-1',
        restaurant_id: 'restaurant-1',
        code: 'server',
        name: 'Server',
        active: true,
        sort_order: 0,
        estimated_hourly_cost: 0,
        metadata: { color: '#2563eb' }
      }
    ],
    work_areas: [],
    area_service_defaults: [],
    opening_hours: [
      { weekday: 1, service_key: 'lunch', is_open: false, opens_at: null, closes_at: null },
      { weekday: 1, service_key: 'evening', is_open: true, opens_at: '18:00:00', closes_at: '23:00:00' }
    ],
    coverage_requirements: []
  };

  const draft = restaurantDraft(snapshot);
  assert.equal(draft.opening[0].lunchOpen, false);
  assert.equal(draft.opening[0].eveningOpen, true);
  assert.equal(draft.jobFunctions[0].color, '#2563eb');

  const payload = restaurantSavePayload(snapshot, draft);
  const mondayLunch = payload.openingHours.find((row) => row.weekday === 1 && row.service_key === 'lunch');
  const mondayEvening = payload.openingHours.find((row) => row.weekday === 1 && row.service_key === 'evening');
  assert.equal(mondayLunch.is_open, false);
  assert.equal(mondayEvening.is_open, true);
  assert.deepEqual(payload.jobFunctions[0].metadata, { color: '#2563eb' });
});
