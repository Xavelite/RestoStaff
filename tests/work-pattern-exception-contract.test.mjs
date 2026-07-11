import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEmployeeWeek } from '../src/lib/employee/employee-model.ts';
import {
  blocksPlanningAssignment,
  planningConflicts,
  planningRequestIdentity,
  slotContext
} from '../src/lib/schedule/schedule-model.ts';

function snapshot(overrides = {}) {
  return {
    restaurant: { id: 'r1', name: 'Exception Test' },
    restaurant_settings: { timezone: 'Europe/Brussels' },
    employees: [{ id: 'e1', active: true, display_name: 'Alex' }],
    employee_job_functions: [],
    job_functions: [],
    work_areas: [],
    opening_hours: [],
    coverage_requirements: [],
    planned_shifts: [],
    employee_availability_slots: [],
    employee_availability_submissions: [],
    recurring_schedule_slots: [],
    absences: [],
    work_pattern_exceptions: [],
    time_entries: [],
    work_weeks: [],
    weekly_notes: [],
    ...overrides
  };
}

test('active work-pattern exceptions block overlapping Planning until resolved', () => {
  const approvedSnapshot = snapshot({
    work_pattern_exceptions: [
      {
        id: 'x1',
        employee_id: 'e1',
        start_date: '2026-06-15',
        end_date: '2026-06-15',
        service_key: 'lunch',
        status: 'approved',
        reason: 'Appointment'
      }
    ]
  });
  const shift = {
    employeeId: 'e1',
    weekday: 1,
    serviceKey: 'lunch',
    areaId: '',
    jobFunctionId: '',
    startsAt: '12:00',
    endsAt: '15:00',
    source: 'manual'
  };

  assert.equal(
    slotContext(approvedSnapshot, 'e1', '2026-06-15', 'lunch').workPatternException,
    'approved'
  );
  assert.equal(planningConflicts(approvedSnapshot, [shift], '2026-06-15').length, 1);

  const pendingSnapshot = snapshot({
    work_pattern_exceptions: [
      {
        ...approvedSnapshot.work_pattern_exceptions[0],
        status: 'pending'
      }
    ]
  });
  assert.equal(
    slotContext(pendingSnapshot, 'e1', '2026-06-15', 'lunch').workPatternException,
    'pending'
  );
  assert.equal(planningConflicts(pendingSnapshot, [shift], '2026-06-15').length, 1);
});

test('pending and approved leave both block normal schedule assignment', () => {
  const shift = {
    employeeId: 'e1',
    weekday: 1,
    serviceKey: 'lunch',
    areaId: '',
    jobFunctionId: '',
    startsAt: '12:00',
    endsAt: '15:00',
    source: 'manual'
  };
  for (const status of ['pending', 'approved']) {
    const model = snapshot({
      absences: [
        {
          id: `leave-${status}`,
          employee_id: 'e1',
          start_date: '2026-06-15',
          end_date: '2026-06-15',
          service_key: 'lunch',
          status
        }
      ]
    });
    assert.equal(slotContext(model, 'e1', '2026-06-15', 'lunch').absence, status);
    assert.equal(planningConflicts(model, [shift], '2026-06-15').length, 1);
  }
});

test('planning request actions retain the selected blocker identity only', () => {
  const context = {
    availability: 'available',
    absence: 'pending',
    absenceId: 'selected-leave',
    workPatternException: 'approved',
    workPatternExceptionId: 'selected-change',
    workPatternExceptionReason: 'Class'
  };
  assert.equal(blocksPlanningAssignment(context), true);
  assert.equal(planningRequestIdentity(context, 'absence'), 'selected-leave');
  assert.equal(
    planningRequestIdentity(context, 'work_pattern_exception'),
    'selected-change'
  );
  assert.equal(
    planningRequestIdentity({ ...context, absence: '', absenceId: 'unrelated-leave' }, 'absence'),
    null
  );
  assert.equal(
    planningRequestIdentity(
      { ...context, workPatternException: '', workPatternExceptionId: 'unrelated-change' },
      'work_pattern_exception'
    ),
    null
  );
});

test('employee weekly view exposes approved work-pattern exceptions without rewriting availability', () => {
  const model = buildEmployeeWeek({
    snapshot: snapshot({
      work_pattern_exceptions: [
        {
          id: 'x1',
          employee_id: 'e1',
          start_date: '2026-06-17',
          end_date: '2026-06-17',
          service_key: 'evening',
          status: 'approved',
          reason: 'Medical appointment'
        }
      ]
    }),
    employeeId: 'e1',
    weekStart: '2026-06-15',
    today: '2026-06-15',
    availability: [],
    availabilityMode: 'fixed_schedule'
  });

  const slot = model.slotsByKey.get('e1|2026-06-17|evening');
  assert.equal(slot?.state, 'work_pattern_approved');
  assert.equal(slot?.availability, '');
  assert.equal(slot?.workPatternExceptionReason, 'Medical appointment');
});
