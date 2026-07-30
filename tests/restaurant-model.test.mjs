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

test('restaurant hours preserve configurable service periods independently', async () => {
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
    restaurant_employment_settings: {
      restaurant_id: 'restaurant-1',
      onss_employer_number: 'ONSS-42',
      establishment_unit_number: '2123456789',
      joint_committee_code: '302',
      dimona_submission_mode: 'social_secretariat',
      social_secretariat_name: 'Pilot Secretariat',
      external_employer_id: 'EMP-42',
      metadata: { source: 'pilot' }
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
    job_function_areas: [
      {
        restaurant_id: 'restaurant-1',
        job_function_id: 'position-1',
        area_id: 'area-1',
        is_primary: true,
        active: true
      }
    ],
    work_areas: [
      {
        id: 'area-1',
        restaurant_id: 'restaurant-1',
        code: 'dining-room',
        name: 'Dining room',
        notes: null,
        instance_number: 1,
        active: true,
        sort_order: 0,
        metadata: { color: '#16a34a' }
      }
    ],
    services: [
      {
        id: 'service-lunch',
        restaurant_id: 'restaurant-1',
        service_key: 'lunch',
        name: 'Lunch',
        active: true,
        sort_order: 0,
        metadata: { default_start: '12:00', default_end: '15:00' }
      },
      {
        id: 'service-evening',
        restaurant_id: 'restaurant-1',
        service_key: 'evening',
        name: 'Dinner',
        active: true,
        sort_order: 1,
        metadata: { default_start: '18:00', default_end: '23:00' }
      },
      {
        id: 'service-breakfast',
        restaurant_id: 'restaurant-1',
        service_key: 'breakfast',
        name: 'Breakfast',
        active: true,
        sort_order: 2,
        metadata: { default_start: '07:00', default_end: '10:30' }
      }
    ],
    area_service_defaults: [],
    opening_hours: [
      { weekday: 1, service_key: 'lunch', is_open: false, opens_at: null, closes_at: null },
      { weekday: 1, service_key: 'evening', is_open: true, opens_at: '18:00:00', closes_at: '23:00:00' },
      { weekday: 1, service_key: 'breakfast', is_open: true, opens_at: '07:00:00', closes_at: '10:30:00' }
    ],
    coverage_requirements: []
  };

  const draft = restaurantDraft(snapshot);
  assert.equal(draft.opening[0].services.lunch.open, false);
  assert.equal(draft.opening[0].services.evening.open, true);
  assert.equal(draft.opening[0].services.breakfast.open, true);
  assert.equal(draft.services[2].name, 'Breakfast');
  assert.deepEqual(draft.jobFunctions[0].areaIds, ['area-1']);
  assert.equal(draft.areas[0].color, '#16a34a');
  assert.equal(draft.displayName, 'Demo');
  assert.equal(draft.legalName, 'Demo');
  assert.equal(draft.onssEmployerNumber, 'ONSS-42');
  assert.equal(draft.dimonaSubmissionMode, 'social_secretariat');

  draft.jobFunctions.unshift({
    ...draft.jobFunctions[0],
    id: 'blank-position',
    name: '',
    areaIds: ['area-1']
  });
  draft.areas.unshift({
    ...draft.areas[0],
    id: 'blank-area',
    name: ''
  });
  const payload = restaurantSavePayload(snapshot, draft);
  const mondayLunch = payload.openingHours.find((row) => row.weekday === 1 && row.service_key === 'lunch');
  const mondayEvening = payload.openingHours.find((row) => row.weekday === 1 && row.service_key === 'evening');
  const mondayBreakfast = payload.openingHours.find((row) => row.weekday === 1 && row.service_key === 'breakfast');
  assert.equal(mondayLunch.is_open, false);
  assert.equal(mondayEvening.is_open, true);
  assert.equal(mondayBreakfast.is_open, true);
  assert.equal(payload.services.find((row) => row.service_key === 'breakfast').name, 'Breakfast');
  assert.deepEqual(payload.jobFunctions[0].area_ids, ['area-1']);
  assert.equal(payload.jobFunctions.length, 1);
  assert.deepEqual(payload.jobFunctions[0].metadata, {});
  assert.equal(payload.areas[0].color, '#16a34a');
  assert.equal(payload.areas[0].instance_number, 1);
  assert.equal(payload.areas.length, 1);
  assert.deepEqual(payload.areas[0].metadata, { reservable: true });
  assert.equal(payload.restaurant.name, 'Demo');
  assert.equal(payload.restaurant.legal_name, 'Demo');
  assert.deepEqual(payload.restaurant.employment_settings, {
    onss_employer_number: 'ONSS-42',
    establishment_unit_number: '2123456789',
    joint_committee_code: '302',
    dimona_submission_mode: 'social_secretariat',
    social_secretariat_name: 'Pilot Secretariat',
    external_employer_id: 'EMP-42',
    metadata: { source: 'pilot' }
  });
});
