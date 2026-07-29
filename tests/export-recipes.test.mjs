import assert from 'node:assert/strict';
import test from 'node:test';

import {
  planningPeriodCsv,
  workedTimeCsv
} from '../src/lib/exports/export-recipes.ts';

const snapshot = {
  employees: [
    { id: 'employee-1', display_name: 'Amélie Laurent' },
    { id: 'employee-2', display_name: 'Noah Martin' }
  ],
  work_areas: [{ id: 'area-1', name: 'Dining room' }],
  job_functions: [{ id: 'position-1', name: 'Waiter' }],
  weekly_notes: [
    {
      week_start: '2026-07-27',
      weekday: 2,
      service_key: 'lunch',
      note: 'Private event'
    }
  ],
  planned_shifts: [
    {
      id: 'shift-1',
      employee_id: 'employee-1',
      week_start: '2026-07-27',
      weekday: 2,
      service_key: 'lunch',
      starts_at: '12:00:00',
      ends_at: '20:00:00',
      area_id: 'area-1',
      job_function_id: 'position-1'
    },
    {
      id: 'shift-outside',
      employee_id: 'employee-2',
      week_start: '2026-08-03',
      weekday: 1,
      service_key: 'evening',
      starts_at: '18:00:00',
      ends_at: '23:00:00',
      area_id: 'area-1',
      job_function_id: 'position-1'
    }
  ],
  time_entries: [
    {
      id: 'entry-1',
      employee_id: 'employee-1',
      business_date: '2026-07-28',
      service_key: 'lunch',
      planned_shift_id: 'shift-1',
      actual_area_id: null,
      actual_job_function_id: null,
      clock_in_at: '2026-07-28T12:00:00Z',
      clock_out_at: '2026-07-28T20:00:00Z',
      break_minutes: 30,
      status: 'adjusted'
    },
    {
      id: 'entry-cancelled',
      employee_id: 'employee-2',
      business_date: '2026-07-29',
      service_key: 'evening',
      planned_shift_id: null,
      actual_area_id: null,
      actual_job_function_id: null,
      clock_in_at: '2026-07-29T18:00:00Z',
      clock_out_at: '2026-07-29T23:00:00Z',
      break_minutes: 0,
      status: 'cancelled'
    }
  ]
};

test('planning period export uses the saved plan and filters by business date', () => {
  const file = planningPeriodCsv({
    snapshot,
    range: { from: '2026-07-27', to: '2026-08-02' }
  });

  assert.equal(file.filename, 'planning-2026-07-27-2026-08-02.csv');
  assert.deepEqual(file.headers, [
    'Employee',
    'Date',
    'Service',
    'Planned start',
    'Planned end',
    'Planned hours',
    'Area',
    'Position',
    'Note'
  ]);
  assert.deepEqual(file.rows, [
    ['Amélie Laurent', '2026-07-28', 'Lunch', '12:00', '20:00', '8.00', 'Dining room', 'Waiter', 'Private event']
  ]);
});

test('worked-time export keeps actual evidence and excludes cancelled entries', () => {
  const file = workedTimeCsv({
    snapshot,
    range: { from: '2026-07-27', to: '2026-08-02' },
    timezone: 'UTC'
  });

  assert.equal(file.filename, 'worked-time-2026-07-27-2026-08-02.csv');
  assert.equal(file.rows.length, 1);
  assert.deepEqual(file.rows[0], [
    'Amélie Laurent',
    '2026-07-28',
    'Lunch',
    '12:00',
    '20:00',
    '8.00',
    30,
    '7.50',
    'Dining room',
    'Waiter',
    'Corrected'
  ]);
});
