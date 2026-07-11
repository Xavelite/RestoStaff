import assert from 'node:assert/strict';
import test from 'node:test';
import { buildActualsWeek } from '../src/lib/timesheet/timesheet-model.ts';
import {
  projectServiceSlot,
  resolveWorkspaceServiceSlot
} from '../src/lib/calendar/service-slot.ts';
import { buildEmployeeWeek, employeeMonth } from '../src/lib/employee/employee-model.ts';
import { buildPlanningWeek, planningDraftForWeek } from '../src/lib/schedule/schedule-model.ts';

function snapshot(overrides = {}) {
  return {
    restaurant: { id: 'r1', name: 'Grid Test' },
    restaurant_settings: { timezone: 'Europe/Brussels' },
    employees: [
      {
        id: 'e1',
        active: true,
        display_name: 'Alex',
      }
    ],
    employee_job_functions: [
      { restaurant_id: 'r1', employee_id: 'e1', job_function_id: 'j1', is_primary: true, active: true }
    ],
    job_functions: [{ id: 'j1', name: 'Server', active: true }],
    work_areas: [{ id: 'a1', name: 'Dining room', active: true }],
    opening_hours: [],
    coverage_requirements: [],
    planned_shifts: [],
    employee_availability_slots: [],
    recurring_schedule_slots: [],
    absences: [],
    time_entries: [],
    work_weeks: [],
    weekly_notes: [],
    ...overrides
  };
}

test('service-slot truth exposes worked time over approved leave as a conflict', () => {
  const truth = resolveWorkspaceServiceSlot({
    snapshot: snapshot({
      absences: [{
        id: 'leave-1',
        employee_id: 'e1',
        status: 'approved',
        start_date: '2026-06-16',
        end_date: '2026-06-16',
        service_key: 'lunch'
      }],
      time_entries: [{
        id: 'entry-1',
        employee_id: 'e1',
        business_date: '2026-06-16',
        service_key: 'lunch',
        status: 'closed',
        clock_in_at: '2026-06-16T10:00:00Z',
        clock_out_at: '2026-06-16T13:00:00Z',
        break_minutes: 0
      }]
    }),
    employeeId: 'e1',
    date: '2026-06-16',
    serviceKey: 'lunch',
    today: '2026-06-18',
    plan: null
  });

  assert.equal(truth.state, 'conflict');
  assert.deepEqual(truth.conflictReasons, ['approved leave']);
  assert.equal(truth.actualHours, 3);
});

test('availability is a slot background and never an operational card', () => {
  const truth = resolveWorkspaceServiceSlot({
    snapshot: snapshot(),
    employeeId: 'e1',
    date: '2026-06-22',
    serviceKey: 'lunch',
    today: '2026-06-20',
    plan: null,
    availability: 'available'
  });
  const presentation = projectServiceSlot(truth, 'employee');
  assert.equal(presentation.background, 'available');
  assert.equal(presentation.card, null);
});

test('recurring fixed schedule is planning baseline, not availability', () => {
  const modelSnapshot = snapshot({
    recurring_schedule_slots: [
      {
        employee_id: 'e1',
        weekday: 1,
        service_key: 'lunch',
        active: true
      }
    ]
  });

  const truth = resolveWorkspaceServiceSlot({
    snapshot: modelSnapshot,
    employeeId: 'e1',
    date: '2026-06-15',
    serviceKey: 'lunch',
    today: '2026-06-15',
    plan: null
  });
  assert.equal(truth.availability, '');
  assert.equal(truth.state, 'empty');

  const draft = planningDraftForWeek(modelSnapshot, '2026-06-15');
  assert.equal(draft.length, 1);
  assert.equal(draft[0].source, 'template');
  assert.equal(draft[0].areaId, 'a1');
  assert.equal(draft[0].jobFunctionId, 'j1');
  assert.equal(draft[0].startsAt, '12:00');

  const planning = buildPlanningWeek({
    snapshot: modelSnapshot,
    weekStart: '2026-06-15',
    today: '2026-06-15',
    draft
  });
  const slot = planning.slotsByKey.get('e1|2026-06-15|lunch');
  assert.equal(slot?.shift?.source, 'template');
  assert.equal(slot?.truth.plan?.contractBaseline, true);
  assert.equal(slot?.truth.availability, '');
  assert.equal(slot?.truth.state, 'planned');
  assert.equal(slot?.truth.conflictReasons.length, 0);
  assert.equal(slot?.truth.plan?.startsAt, '12:00');
  assert.equal(planning.rows[0].cells[0].slots[0].presentation.background, 'available');
});

test('approved leave suppresses an unsaved recurring planning baseline', () => {
  const draft = planningDraftForWeek(
    snapshot({
      recurring_schedule_slots: [
        {
          employee_id: 'e1',
          weekday: 1,
          service_key: 'lunch',
          active: true
        }
      ],
      absences: [
        {
          id: 'leave-1',
          employee_id: 'e1',
          status: 'approved',
          start_date: '2026-06-15',
          end_date: '2026-06-15',
          service_key: 'lunch'
        }
      ]
    }),
    '2026-06-15'
  );
  assert.deepEqual(draft, []);
});

test('time off overrides an available background without hiding its card', () => {
  const truth = resolveWorkspaceServiceSlot({
    snapshot: snapshot({
      absences: [
        {
          id: 'a1',
          employee_id: 'e1',
          absence_type_id: 'holiday',
          start_date: '2026-06-22',
          end_date: '2026-06-22',
          service_key: 'lunch',
          status: 'approved'
        }
      ]
    }),
    employeeId: 'e1',
    date: '2026-06-22',
    serviceKey: 'lunch',
    today: '2026-06-20',
    plan: null,
    availability: 'available'
  });
  const presentation = projectServiceSlot(truth, 'employee');
  assert.equal(presentation.background, 'unavailable');
  assert.equal(presentation.card?.tone, 'absence');
});

test('planning weekly grid is employee by seven days by two services', () => {
  const model = buildPlanningWeek({
    snapshot: snapshot({
      employee_availability_slots: [
        {
          employee_id: 'e1',
          week_start: '2026-06-15',
          weekday: 1,
          service_key: 'lunch',
          availability_state: 'unavailable'
        }
      ],
      time_entries: [
        {
          id: 'worked-1',
          employee_id: 'e1',
          business_date: '2026-06-15',
          service_key: 'lunch',
          status: 'adjusted',
          clock_in_at: '2026-06-15T10:00:00Z',
          clock_out_at: '2026-06-15T13:00:00Z'
        }
      ]
    }),
    weekStart: '2026-06-15',
    today: '2026-06-18',
    draft: [
      {
        employeeId: 'e1',
        weekday: 1,
        serviceKey: 'lunch',
        areaId: 'a1',
        jobFunctionId: 'j1',
        startsAt: '12:00',
        endsAt: '15:00',
        source: 'manual'
      }
    ]
  });

  assert.equal(model.days.length, 7);
  assert.equal(model.rows.length, 1);
  assert.equal(model.rows[0].cells.length, 7);
  assert.equal(model.rows[0].cells[0].slots.length, 2);
  assert.equal(model.rows[0].cells[0].slots[0].presentation.background, 'conflict');
  assert.equal(model.rows[0].cells[0].slots[0].presentation.card?.tone, 'conflict');
  assert.equal(model.rows[0].cells[0].slots[0].presentation.card?.label, '12:00–15:00');
});

test('planning reads a planned shift as valid / attention / conflict against context', () => {
  const plan = { id: 'p1', startsAt: '12:00', endsAt: '15:00', area: 'Dining room' };
  const base = {
    snapshot: snapshot(),
    employeeId: 'e1',
    date: '2026-06-22',
    serviceKey: 'lunch',
    today: '2026-06-20'
  };

  // Planned where the employee is available → valid (green).
  const onAvailable = projectServiceSlot(
    resolveWorkspaceServiceSlot({ ...base, plan, availability: 'available' }),
    'planning'
  );
  assert.equal(onAvailable.background, 'available');

  // Planned where availability is not set → attention (yellow), not silent neutral.
  const onNeutral = projectServiceSlot(
    resolveWorkspaceServiceSlot({ ...base, plan, availability: '' }),
    'planning'
  );
  assert.equal(onNeutral.background, 'warning');

  // Planned over approved leave → conflict (red).
  const onLeave = projectServiceSlot(
    resolveWorkspaceServiceSlot({
      ...base,
      plan,
      availability: 'available',
      snapshot: snapshot({
        absences: [
          {
            id: 'leave-1',
            employee_id: 'e1',
            status: 'approved',
            start_date: '2026-06-22',
            end_date: '2026-06-22',
            service_key: 'lunch'
          }
        ]
      })
    }),
    'planning'
  );
  assert.equal(onLeave.background, 'conflict');

  // No plan → fall back to the plain availability context so free slots read clearly.
  const noPlan = projectServiceSlot(
    resolveWorkspaceServiceSlot({ ...base, plan: null, availability: 'available' }),
    'planning'
  );
  assert.equal(noPlan.background, 'available');
});

test('employee weekly slots expose worked, corrected and missing-badge truth', () => {
  const model = buildEmployeeWeek({
    snapshot: snapshot({
      work_weeks: [{ week_start: '2026-06-15', planning_status: 'published' }],
      planned_shifts: [
        {
          id: 'p1',
          employee_id: 'e1',
          week_start: '2026-06-15',
          weekday: 1,
          service_key: 'lunch',
          starts_at: '12:00',
          ends_at: '15:00',
          area_id: 'a1',
          job_function_id: 'j1'
        },
        {
          id: 'p2',
          employee_id: 'e1',
          week_start: '2026-06-15',
          weekday: 2,
          service_key: 'lunch',
          starts_at: '12:00',
          ends_at: '15:00',
          area_id: 'a1',
          job_function_id: 'j1'
        }
      ],
      time_entries: [
        {
          id: 't1',
          employee_id: 'e1',
          business_date: '2026-06-16',
          service_key: 'lunch',
          status: 'adjusted',
          adjusted_at: '2026-06-17T10:00:00Z',
          adjustment_reason: 'Forgot clock-out',
          clock_in_at: '2026-06-16T10:00:00Z',
          clock_out_at: '2026-06-16T13:00:00Z',
          break_minutes: 30
        }
      ]
    }),
    employeeId: 'e1',
    weekStart: '2026-06-15',
    today: '2026-06-18',
    availability: [],
    availabilityMode: 'fixed_schedule'
  });

  assert.equal(model.slotsByKey.get('e1|2026-06-15|lunch')?.state, 'missing_badge');
  assert.equal(model.slotsByKey.get('e1|2026-06-16|lunch')?.state, 'corrected');
  assert.equal(model.slotsByKey.get('e1|2026-06-16|lunch')?.editable, false);
});

test('employee month shows one effective truth per service slot', () => {
  const days = employeeMonth(
    snapshot({
      work_weeks: [{ week_start: '2026-06-15', planning_status: 'published' }],
      planned_shifts: [
        {
          id: 'p1',
          employee_id: 'e1',
          week_start: '2026-06-15',
          weekday: 2,
          service_key: 'lunch',
          starts_at: '12:00',
          ends_at: '15:00',
          area_id: 'a1',
          job_function_id: 'j1'
        }
      ],
      time_entries: [
        {
          id: 't1',
          employee_id: 'e1',
          business_date: '2026-06-16',
          service_key: 'lunch',
          status: 'adjusted',
          adjusted_at: '2026-06-17T10:00:00Z',
          clock_in_at: '2026-06-16T10:00:00Z',
          clock_out_at: '2026-06-16T13:00:00Z',
          break_minutes: 30
        }
      ]
    }),
    'e1',
    '2026-06-01',
    '2026-06-16',
    '2026-06-18'
  );

  const day = days.find((item) => item.date === '2026-06-16');
  assert.deepEqual(day?.slots.map((slot) => slot.presentation.card?.tone ?? 'empty'), ['correction', 'empty']);
  assert.deepEqual(day?.slots.map((slot) => slot.serviceKey), ['lunch', 'evening']);
  assert.equal(day?.total, '2h30');
});

test('actuals weekly grid uses correction semantics and keeps empty slots actionable', () => {
  const model = buildActualsWeek({
    snapshot: snapshot({
      time_entries: [
        {
          id: 't1',
          employee_id: 'e1',
          business_date: '2026-06-15',
          service_key: 'lunch',
          status: 'adjusted',
          clock_in_at: '2026-06-15T10:00:00Z',
          clock_out_at: '2026-06-15T13:00:00Z',
          clock_in_photo_status: 'captured',
          clock_out_photo_status: 'captured'
        }
      ]
    }),
    weekStart: '2026-06-15',
    today: '2026-06-18'
  });

  const lunch = model.rows[0].cells[0].slots[0];
  const evening = model.rows[0].cells[0].slots[1];
  assert.equal(lunch.presentation.card?.tone, 'correction');
  assert.equal(evening.presentation.card, null);
  assert.ok(model.slotsByKey.has(evening.key));
});
