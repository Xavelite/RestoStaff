import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCostInsights } from '../src/lib/dashboard/cost-model.ts';

const model = {
  employees: [
    { id: 'employee-1', display_name: 'Alex', active: true },
    { id: 'employee-2', display_name: 'No rate', active: true }
  ],
  employee_contracts: [
    { employee_id: 'employee-1', is_current: true, work_regime: 'fixed_schedule' },
    { employee_id: 'employee-2', is_current: true, work_regime: 'weekly_availability' }
  ],
  work_areas: [{ id: 'room', name: 'Dining room' }],
  services: [{ service_key: 'evening' }],
  planned_shifts: [
    {
      id: 'plan-1', employee_id: 'employee-1', area_id: 'room', service_key: 'evening',
      week_start: '2026-07-20', weekday: 4, starts_at: '18:00:00', ends_at: '22:00:00'
    }
  ],
  time_entries: [
    {
      id: 'worked-1', employee_id: 'employee-1', planned_shift_id: 'plan-1',
      actual_area_id: 'room', business_date: '2026-07-23', service_key: 'evening',
      status: 'closed', clock_in_at: '2026-07-23T16:00:00Z',
      clock_out_at: '2026-07-23T20:00:00Z', break_minutes: 30
    },
    {
      id: 'open-1', employee_id: 'employee-1', planned_shift_id: null,
      actual_area_id: 'room', business_date: '2026-07-23', service_key: 'evening',
      status: 'open', clock_in_at: '2026-07-23T21:00:00Z', clock_out_at: null, break_minutes: 0
    },
    {
      id: 'missing-rate', employee_id: 'employee-2', planned_shift_id: null,
      actual_area_id: 'room', business_date: '2026-07-23', service_key: 'evening',
      status: 'adjusted', clock_in_at: '2026-07-23T16:00:00Z',
      clock_out_at: '2026-07-23T18:00:00Z', break_minutes: 0
    },
    {
      id: 'comparison-1', employee_id: 'employee-1', planned_shift_id: null,
      actual_area_id: 'room', business_date: '2026-07-16', service_key: 'evening',
      status: 'closed', clock_in_at: '2026-07-16T16:00:00Z',
      clock_out_at: '2026-07-16T18:00:00Z', break_minutes: 0
    }
  ]
};

const rates = {
  source: 'estimated_profile_rate',
  rates: [
    { employee_id: 'employee-1', estimated_hourly_cost_cents: 2400, has_rate: true, employment_type: 'CDI' },
    { employee_id: 'employee-2', estimated_hourly_cost_cents: null, has_rate: false, employment_type: 'FLEXI' }
  ],
  missing_active_employee_count: 1
};

test('owner cost insights use minutes, deduct breaks and expose incomplete coverage', () => {
  const view = buildCostInsights(
    model,
    rates,
    { from: '2026-07-23', to: '2026-07-23', label: 'Today' },
    { from: '2026-07-16', to: '2026-07-16', label: 'Previous' },
    { workforce: 'all', employeeId: '', areaId: '', serviceKey: '' },
    ['2026-07-23'],
    'week'
  );

  assert.equal(view.plannedCostCents, 9600n);
  assert.equal(view.workedCostCents, 8400n);
  assert.equal(view.comparisonWorkedCostCents, 4800n);
  assert.equal(view.varianceCents, -1200n);
  assert.equal(view.averageWorkedHourlyCostCents, 2400n);
  assert.equal(view.coveredWorkedMinutes, 210);
  assert.equal(view.eligibleWorkedMinutes, 330);
  assert.equal(view.coverage, 210 / 330);
  assert.equal(view.missingActiveEmployeeCount, 1);
  assert.equal(view.excludedEntryCount, 1);
  assert.equal(view.employees[0].hourlyCostCents, 2400n);
});

test('cost filters apply before planned and worked amounts are aggregated', () => {
  const view = buildCostInsights(
    model,
    rates,
    { from: '2026-07-23', to: '2026-07-23', label: 'Today' },
    { from: '2026-07-16', to: '2026-07-16', label: 'Previous' },
    { workforce: 'flexi', employeeId: '', areaId: '', serviceKey: '' },
    ['2026-07-23'],
    'week'
  );
  assert.equal(view.plannedCostCents, 0n);
  assert.equal(view.workedCostCents, 0n);
  assert.equal(view.eligibleWorkedMinutes, 120);
});
