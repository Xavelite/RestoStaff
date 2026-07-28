import assert from 'node:assert/strict';
import test from 'node:test';
import { csvText } from '../src/lib/exports/csv.ts';
import {
  parseManagerOperationsReadModel,
  parseRestaurantReadModel,
  parseTeamReadModel,
  parseWorkspaceBootstrap
} from '../src/lib/api/workspace-snapshot.ts';

test('CSV export preserves commas, quotes and new lines', () => {
  assert.equal(
    csvText(['Name', 'Note'], [['Ada, A.', 'Said "hello"\nthen left']]),
    'Name,Note\r\n"Ada, A.","Said ""hello""\nthen left"'
  );
});

test('CSV export neutralizes spreadsheet formulas without changing numbers', () => {
  assert.equal(
    csvText(
      ['Name', 'Phone', 'Hours'],
      [['=HYPERLINK("bad")', '+32000000000', -2]]
    ),
    'Name,Phone,Hours\r\n"\'=HYPERLINK(""bad"")",\'+32000000000,-2'
  );
});

test('workspace parsing rejects missing restaurant truth', () => {
  assert.throws(() => parseWorkspaceBootstrap({}), /valid restaurant/);
});

test('manager operations parsing gives audit collections explicit empty defaults', () => {
  const snapshot = parseManagerOperationsReadModel({
    restaurant: { id: 'restaurant-1' },
    restaurant_settings: {}
  });
  assert.deepEqual(snapshot.work_week_events, []);
  assert.deepEqual(snapshot.time_entry_adjustments, []);
  assert.deepEqual(snapshot.absence_events, []);
  assert.deepEqual(snapshot.work_pattern_exceptions, []);
  assert.deepEqual(snapshot.work_pattern_exception_events, []);
  assert.deepEqual(snapshot.payroll_export_runs, []);
  assert.deepEqual(snapshot.work_areas, []);
  assert.deepEqual(snapshot.employee_job_functions, []);
  assert.deepEqual(snapshot.recurring_schedule_slots, []);
});

test('canonical work areas preserve identifiers at the Restaurant boundary', () => {
  const snapshot = parseRestaurantReadModel({
    restaurant: { id: 'restaurant-1' },
    restaurant_settings: {},
    work_areas: [
      {
        id: 'area-1',
        restaurant_id: 'restaurant-1',
        name: 'Salle',
        code: 'salle',
        notes: null,
        active: true,
        sort_order: 0
      }
    ]
  });
  assert.equal(snapshot.work_areas[0].id, 'area-1');
  assert.equal(snapshot.work_areas[0].name, 'Salle');
});

test('Team parsing exposes only canonical contract and absence types', () => {
  const snapshot = parseTeamReadModel({
    restaurant: { id: 'restaurant-1' },
    contract_types: [{ code: 'CDI' }, { code: 'CUSTOM' }],
    absence_types: [{ code: 'HOLIDAY' }, { code: 'TRAINING' }]
  });

  assert.deepEqual(snapshot.contract_types.map((item) => item.code), ['CDI']);
  assert.deepEqual(snapshot.absence_types.map((item) => item.code), ['HOLIDAY']);
});
