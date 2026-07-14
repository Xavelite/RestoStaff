import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildInsights,
  dashboardReadRanges,
  insightComparisonRange,
  insightLoadRange,
  insightPeriodRange
} from '../src/lib/dashboard/dashboard-model.ts';

test('Insights periods stay calendar-aligned and backend reads never exceed 63 days', () => {
  const week = insightPeriodRange('2026-07-14', 'week');
  assert.equal(week.from, '2026-07-13');
  assert.equal(week.to, '2026-07-19');
  assert.match(week.label, /^13 Jul.+19 Jul$/);
  assert.equal(insightComparisonRange('2026-07-14', 'month', 'previous').from, '2026-06-01');
  assert.equal(insightComparisonRange('2026-07-14', 'month', 'year').from, '2025-07-01');
  assert.deepEqual(insightLoadRange('2026-07-14', 'year', 'year'), {
    from: '2025-01-01',
    to: '2026-12-31'
  });

  const chunks = dashboardReadRanges('2025-01-01', '2026-12-31');
  assert.equal(chunks[0].from, '2025-01-01');
  assert.equal(chunks.at(-1).to, '2026-12-31');
  for (const chunk of chunks) {
    const days = Math.round(
      (new Date(`${chunk.to}T00:00:00Z`).getTime() -
        new Date(`${chunk.from}T00:00:00Z`).getTime()) /
        86_400_000
    );
    assert.ok(days <= 62);
  }
});

test('Insights derives planned dates from week and weekday clock fields', () => {
  const employeeId = 'employee-1';
  const shiftId = 'shift-1';
  const model = {
    restaurant: { id: 'restaurant-1' },
    restaurant_settings: { timezone: 'Europe/Brussels' },
    employees: [
      {
        id: employeeId,
        active: true,
        display_name: 'Amelie Laurent',
        created_at: '2026-01-01T00:00:00Z'
      }
    ],
    employee_contracts: [
      {
        id: 'contract-1',
        employee_id: employeeId,
        is_current: true,
        work_regime: 'fixed_schedule',
        contract_start: '2026-01-01'
      }
    ],
    employee_job_functions: [
      { employee_id: employeeId, job_function_id: 'job-1', active: true }
    ],
    job_functions: [{ id: 'job-1', name: 'Server' }],
    work_areas: [{ id: 'hall', name: 'Hall', active: true }],
    services: [{ id: 'lunch', service_key: 'lunch', active: true }],
    planned_shifts: [
      {
        id: shiftId,
        employee_id: employeeId,
        area_id: 'hall',
        service_key: 'lunch',
        week_start: '2026-07-13',
        weekday: 2,
        starts_at: '12:00:00',
        ends_at: '15:00:00'
      },
      {
        id: 'shift-missing',
        employee_id: employeeId,
        area_id: 'hall',
        service_key: 'lunch',
        week_start: '2026-07-13',
        weekday: 1,
        starts_at: '12:00:00',
        ends_at: '15:00:00'
      },
      {
        id: 'shift-on-leave',
        employee_id: employeeId,
        area_id: 'hall',
        service_key: 'lunch',
        week_start: '2026-07-13',
        weekday: 3,
        starts_at: '12:00:00',
        ends_at: '15:00:00'
      }
    ],
    time_entries: [
      {
        id: 'entry-1',
        employee_id: employeeId,
        planned_shift_id: shiftId,
        business_date: '2026-07-14',
        service_key: 'lunch',
        status: 'closed',
        clock_in_at: '2026-07-14T10:07:00Z',
        clock_out_at: '2026-07-14T13:00:00Z',
        break_minutes: 0,
        adjustment_reason: null
      }
    ],
    absences: [
      {
        id: 'absence-1',
        employee_id: employeeId,
        service_key: 'lunch',
        start_date: '2026-07-15',
        end_date: '2026-07-15',
        status: 'approved'
      }
    ],
    work_pattern_exceptions: []
  };

  const view = buildInsights(
    model,
    '2026-07-14',
    'month',
    'previous',
    { workforce: 'all', employeeId: '', areaId: '', serviceKey: '' },
    '2026-07-16'
  );

  assert.equal(view.current.planned, 9);
  assert.equal(view.current.worked, 2.9);
  assert.equal(view.current.lateCount, 1);
  assert.equal(view.current.missingBadges, 1);
  assert.equal(view.employees[0].lateCount, 1);
  const workedEvidence = view.employees[0].shiftsEvidence.find((row) => row.id === shiftId);
  assert.equal(workedEvidence?.date, '2026-07-14');
  assert.equal(workedEvidence?.lateMinutes, 7);
  assert.equal(
    view.employees[0].shiftsEvidence.find((row) => row.id === 'shift-on-leave')?.status,
    'excused'
  );
});
