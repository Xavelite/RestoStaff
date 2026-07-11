import assert from 'node:assert/strict';
import test from 'node:test';
import { buildHomeModel } from '../src/lib/home/home-model.ts';

function snapshot(overrides = {}) {
  return {
    restaurant: { id: 'r1', name: 'Test Restaurant' },
    restaurant_settings: { timezone: 'Europe/Brussels' },
    employees: [
      { id: 'e1', active: true, display_name: 'Jane Smith' }
    ],
    employee_job_functions: [
      { employee_id: 'e1', job_function_id: 'j1', is_primary: true, active: true }
    ],
    employee_access: [],
    employee_contracts: [],
    employee_legal_profiles: [],
    employee_payroll_profiles: [],
    job_functions: [{ id: 'j1', name: 'Server' }],
    coverage_requirements: [],
    opening_hours: [],
    work_weeks: [{ week_start: '2026-06-15', planning_status: 'draft' }],
    planned_shifts: [],
    employee_availability_submissions: [],
    time_entries: [],
    absences: [],
    ...overrides
  };
}

const thursdayAfternoon = new Date('2026-06-18T12:00:00Z');

test('unplanned live work is never reported as on track', () => {
  const model = buildHomeModel(
    snapshot({
      time_entries: [
        {
          employee_id: 'e1',
          business_date: '2026-06-18',
          service_key: 'lunch',
          status: 'open',
          clock_in_at: '2026-06-18T10:00:00Z',
          clock_out_at: null
        }
      ]
    }),
    'manager',
    thursdayAfternoon
  );

  assert.equal(model.live.rows[0]?.status, 'Unplanned live');
  assert.equal(model.live.rows[0]?.tone, 'warning');
  assert.match(model.live.rows[0]?.detail ?? '', /Unplanned/i);
});

test('late, missing-badge and coverage truths remain visible together', () => {
  const model = buildHomeModel(
    snapshot({
      coverage_requirements: [
        {
          active: true,
          required_count: 2,
          coverage_scope: 'default',
          weekday: null,
          area_id: 'a1',
          job_function_id: 'j1',
          service_key: 'lunch'
        }
      ],
      opening_hours: [{ is_open: true, weekday: 4, service_key: 'lunch' }],
      work_weeks: [{ week_start: '2026-06-15', planning_status: 'published' }],
      planned_shifts: [
        {
          employee_id: 'e1',
          week_start: '2026-06-15',
          weekday: 4,
          service_key: 'lunch',
          starts_at: '11:00:00',
          ends_at: '15:00:00',
          area_id: 'a1',
          job_function_id: 'j1'
        }
      ],
      employee_availability_submissions: [
        { employee_id: 'e1', week_start: '2026-06-15', status: 'submitted' }
      ]
    }),
    'manager',
    thursdayAfternoon
  );

  assert.equal(model.live.late, 1);
  assert.equal(model.pulse.tone, 'danger');
  assert.equal(
    model.pulse.rows.find((row) => row.label === 'Missing badges')?.value,
    '1'
  );
});
