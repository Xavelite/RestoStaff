import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveNotifications } from '../src/lib/notifications/notification-derived.ts';

const restaurant = { id: 'r1' };
const restaurant_settings = { timezone: 'Europe/Brussels' };
const employees = [{ id: 'e1', display_name: 'Sarah' }];
const baseManager = {
  restaurant,
  restaurant_settings,
  employees,
  employee_contracts: [],
  employee_legal_profiles: [],
  employee_payroll_profiles: [],
  job_functions: [],
  employee_job_functions: [],
  recurring_schedule_slots: [],
  contract_types: [],
  work_areas: [],
  services: [],
  area_service_defaults: [],
  coverage_requirements: [],
  opening_hours: [],
  absence_types: [],
  work_weeks: [],
  work_week_events: [],
  planned_shifts: [],
  employee_availability_slots: [],
  employee_availability_submissions: [],
  weekly_notes: [],
  time_entries: [],
  time_entry_adjustments: [],
  absences: [],
  absence_events: [],
  work_pattern_exceptions: [],
  work_pattern_exception_events: [],
  payroll_export_runs: []
};

const baseEmployee = {
  restaurant,
  restaurant_settings,
  employees,
  employee_contracts: [],
  job_functions: [],
  employee_job_functions: [],
  recurring_schedule_slots: [],
  contract_types: [],
  work_areas: [],
  services: [],
  absence_types: [],
  work_weeks: [],
  work_week_events: [],
  planned_shifts: [],
  employee_availability_slots: [],
  employee_availability_submissions: [],
  time_entries: [],
  absences: [],
  work_pattern_exceptions: []
};

test('manager notifications are derived from operational truth, not stored message rows', () => {
  const items = deriveNotifications({
    restaurantId: 'r1',
    role: 'manager',
    employeeId: null,
    today: '2026-06-23',
    now: new Date('2026-06-23T10:00:00.000Z'),
    timezone: 'Europe/Brussels',
    team: null,
    operations: {
      ...baseManager,
      absences: [
        {
          id: 'a1',
          restaurant_id: 'r1',
          employee_id: 'e1',
          absence_type_id: 'holiday',
          status: 'pending',
          start_date: '2026-06-27',
          end_date: '2026-06-27',
          service_key: 'evening',
          employee_comment: null,
          manager_comment: null,
          metadata: {},
          requested_by_profile_id: 'p1',
          approved_at: null,
          approved_by_profile_id: null,
          rejected_at: null,
          rejected_by_profile_id: null,
          cancelled_at: null,
          cancelled_by_profile_id: null,
          cancelled_by_role: null,
          cancellation_reason: null,
          payroll_export_id: null,
          payroll_export_status: 'not_exported',
          duration_days: null,
          duration_hours: null,
          created_at: '2026-06-23T08:00:00.000Z',
          updated_at: '2026-06-23T08:00:00.000Z'
        }
      ]
    }
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].key, 'absence-request:a1');
  assert.equal(items[0].source.table, 'absences');
  assert.equal(items[0].actionMode, 'popup');
  assert.equal(items[0].targetUrl, '/schedule?week=2026-06-22');
});

test('employee notifications include published planning and shift soon from real shifts', () => {
  const items = deriveNotifications({
    restaurantId: 'r1',
    role: 'employee',
    employeeId: 'e1',
    today: '2026-06-23',
    now: new Date('2026-06-23T07:30:00.000Z'),
    timezone: 'Europe/Brussels',
    operations: {
      ...baseEmployee,
      work_weeks: [
        {
          restaurant_id: 'r1',
          week_start: '2026-06-22',
          planning_status: 'published',
          planning_revision: 1,
          published_at: '2026-06-22T12:00:00.000Z',
          published_by_profile_id: 'p1',
          actuals_status: 'open',
          actuals_revision: 0,
          actuals_approved_at: null,
          actuals_approved_by_profile_id: null,
          actuals_locked_at: null,
          actuals_locked_by_profile_id: null,
          actuals_reopened_at: null,
          actuals_reopened_by_profile_id: null,
          created_at: '2026-06-22T10:00:00.000Z',
          updated_at: '2026-06-22T12:00:00.000Z'
        }
      ],
      planned_shifts: [
        {
          id: 's1',
          restaurant_id: 'r1',
          employee_id: 'e1',
          week_start: '2026-06-22',
          weekday: 2,
          service_key: 'lunch',
          starts_at: '10:00:00',
          ends_at: '14:00:00',
          area_id: null,
          job_function_id: null,
          source: 'manual',
          created_at: '2026-06-22T10:00:00.000Z',
          updated_at: '2026-06-22T10:00:00.000Z'
        }
      ]
    }
  });

  assert.ok(items.some((item) => item.key === 'planning-published:2026-06-22:1'));
  assert.equal(items.find((item) => item.type === 'planning_published')?.source.table, 'work_weeks');
  assert.equal(items.find((item) => item.type === 'planning_published')?.targetUrl, '/my-service?week=2026-06-22');
  assert.ok(items.some((item) => item.key === 'shift-soon:s1'));
  assert.equal(items.find((item) => item.key === 'shift-soon:s1')?.targetUrl, '/my-service?week=2026-06-22');
});

test('late badge notifications match the planned shift even when planned_shift_id is absent', () => {
  const items = deriveNotifications({
    restaurantId: 'r1',
    role: 'manager',
    employeeId: null,
    today: '2026-06-23',
    now: new Date('2026-06-23T12:00:00.000Z'),
    timezone: 'Europe/Brussels',
    team: null,
    operations: {
      ...baseManager,
      work_weeks: [
        {
          restaurant_id: 'r1',
          week_start: '2026-06-22',
          planning_status: 'published',
          planning_revision: 1,
          published_at: '2026-06-22T12:00:00.000Z',
          published_by_profile_id: 'p1',
          actuals_status: 'open',
          actuals_revision: 0,
          actuals_approved_at: null,
          actuals_approved_by_profile_id: null,
          actuals_locked_at: null,
          actuals_locked_by_profile_id: null,
          actuals_reopened_at: null,
          actuals_reopened_by_profile_id: null,
          created_at: '2026-06-22T10:00:00.000Z',
          updated_at: '2026-06-22T12:00:00.000Z'
        }
      ],
      planned_shifts: [
        {
          id: 's1',
          restaurant_id: 'r1',
          employee_id: 'e1',
          week_start: '2026-06-22',
          weekday: 2,
          service_key: 'lunch',
          starts_at: '10:00:00',
          ends_at: '14:00:00',
          area_id: null,
          job_function_id: null,
          source: 'manual',
          created_at: '2026-06-22T10:00:00.000Z',
          updated_at: '2026-06-22T10:00:00.000Z'
        }
      ],
      time_entries: [
        {
          id: 't1',
          restaurant_id: 'r1',
          employee_id: 'e1',
          business_date: '2026-06-23',
          service_key: 'lunch',
          planned_shift_id: null,
          source: 'badge_terminal',
          status: 'closed',
          clock_in_at: '2026-06-23T08:20:00.000Z',
          clock_out_at: '2026-06-23T12:00:00.000Z',
          badge_terminal_id: null,
          manager_note: null,
          proof_image_path: null,
          created_by_profile_id: 'p1',
          updated_by_profile_id: 'p1',
          created_at: '2026-06-23T08:20:00.000Z',
          updated_at: '2026-06-23T12:00:00.000Z'
        }
      ]
    }
  });

  assert.ok(items.some((item) => item.key === 'late-badge-in:t1'));
});

test('manager notifications group availability changes that conflict with published shifts', () => {
  const items = deriveNotifications({
    restaurantId: 'r1',
    role: 'manager',
    employeeId: null,
    today: '2026-06-23',
    now: new Date('2026-06-23T10:00:00.000Z'),
    timezone: 'Europe/Brussels',
    team: null,
    operations: {
      ...baseManager,
      employee_contracts: [
        {
          employee_id: 'e1',
          active: true,
          is_current: true,
          work_regime: 'weekly_availability'
        }
      ],
      work_weeks: [
        {
          week_start: '2026-06-29',
          planning_status: 'published'
        }
      ],
      planned_shifts: [
        {
          id: 'published-shift',
          employee_id: 'e1',
          week_start: '2026-06-29',
          weekday: 1,
          service_key: 'lunch',
          starts_at: '12:00:00',
          ends_at: '15:00:00',
          updated_at: '2026-06-22T09:00:00.000Z'
        }
      ],
      employee_availability_slots: [
        {
          employee_id: 'e1',
          week_start: '2026-06-29',
          weekday: 1,
          service_key: 'lunch',
          availability_state: 'unavailable'
        }
      ],
      employee_availability_submissions: [
        {
          restaurant_id: 'r1',
          employee_id: 'e1',
          week_start: '2026-06-29',
          status: 'submitted',
          submitted_at: '2026-06-23T09:00:00.000Z',
          created_at: '2026-06-23T08:50:00.000Z',
          updated_at: '2026-06-23T09:00:00.000Z'
        }
      ]
    }
  });

  const item = items.find((candidate) => candidate.type === 'employee_availability_updated');
  assert.ok(item);
  assert.equal(item.key, 'availability-submitted:e1:2026-06-29:2026-06-23T09:00:00.000Z');
  assert.equal(item?.title, '{name} changed availability on published shifts');
  assert.deepEqual(item?.titleParams, { name: 'Sarah' });
  assert.equal(item?.body, '{count} published shifts now conflict');
  assert.deepEqual(item?.bodyParams, { count: 1 });
  assert.equal(item?.severity, 'attention');
  assert.equal(item?.source.table, 'employee_availability_submissions');
  assert.equal(item?.targetUrl, '/schedule?week=2026-06-29');
});

test('manager notifications ignore harmless one-slot availability edits', () => {
  const items = deriveNotifications({
    restaurantId: 'r1',
    role: 'manager',
    employeeId: null,
    today: '2026-06-23',
    now: new Date('2026-06-23T10:00:00.000Z'),
    timezone: 'Europe/Brussels',
    team: null,
    operations: {
      ...baseManager,
      employee_contracts: [{ employee_id: 'e1', active: true, is_current: true, work_regime: 'weekly_availability' }],
      employee_availability_slots: [{ employee_id: 'e1', week_start: '2026-06-29', weekday: 1, service_key: 'lunch', availability_state: 'available' }],
      employee_availability_submissions: [{
        restaurant_id: 'r1', employee_id: 'e1', week_start: '2026-06-29', status: 'submitted',
        submitted_at: '2026-06-23T09:00:00.000Z', created_at: '2026-06-23T08:50:00.000Z', updated_at: '2026-06-23T09:00:00.000Z'
      }]
    }
  });
  assert.equal(items.some((candidate) => candidate.type === 'employee_availability_updated'), false);
});

test('manager notifications ignore stale availability submissions from fixed schedules', () => {
  const items = deriveNotifications({
    restaurantId: 'r1',
    role: 'manager',
    employeeId: null,
    today: '2026-06-23',
    now: new Date('2026-06-23T10:00:00.000Z'),
    timezone: 'Europe/Brussels',
    team: null,
    operations: {
      ...baseManager,
      employee_contracts: [
        {
          employee_id: 'e1',
          active: true,
          is_current: true,
          work_regime: 'fixed_schedule'
        }
      ],
      employee_availability_submissions: [
        {
          restaurant_id: 'r1',
          employee_id: 'e1',
          week_start: '2026-06-29',
          status: 'submitted',
          submitted_at: '2026-06-23T09:00:00.000Z',
          created_at: '2026-06-23T08:50:00.000Z',
          updated_at: '2026-06-23T09:00:00.000Z'
        }
      ]
    }
  });

  assert.equal(
    items.some((candidate) => candidate.type === 'employee_availability_updated'),
    false
  );
});

test('manager notifications cover unavailable shifts, open entries, absence conflicts, no-shows and accepted invites', () => {
  const items = deriveNotifications({
    restaurantId: 'r1',
    role: 'manager',
    employeeId: null,
    today: '2026-06-23',
    now: new Date('2026-06-23T12:00:00.000Z'),
    timezone: 'Europe/Brussels',
    team: {
      employee_invitation_states: [
        {
          id: 'invite-1',
          employee_id: 'e1',
          email: 'sarah@example.com',
          status: 'accepted',
          accepted_at: '2026-06-23T10:00:00.000Z',
          sent_at: '2026-06-22T10:00:00.000Z'
        }
      ]
    },
    operations: {
      ...baseManager,
      work_weeks: [
        {
          week_start: '2026-06-22',
          planning_status: 'published'
        }
      ],
      planned_shifts: [
        {
          id: 'shift-unavailable',
          employee_id: 'e1',
          week_start: '2026-06-22',
          weekday: 2,
          service_key: 'lunch',
          starts_at: '10:00:00',
          ends_at: '14:00:00',
          updated_at: '2026-06-23T09:00:00.000Z'
        },
        {
          id: 'shift-no-show',
          employee_id: 'e1',
          week_start: '2026-06-22',
          weekday: 1,
          service_key: 'evening',
          starts_at: '18:00:00',
          ends_at: '22:00:00',
          updated_at: '2026-06-22T09:00:00.000Z'
        }
      ],
      employee_availability_slots: [
        {
          employee_id: 'e1',
          week_start: '2026-06-22',
          weekday: 2,
          service_key: 'lunch',
          availability_state: 'unavailable'
        }
      ],
      absences: [
        {
          id: 'absence-approved',
          employee_id: 'e1',
          status: 'approved',
          start_date: '2026-06-23',
          end_date: '2026-06-23',
          service_key: 'lunch'
        }
      ],
      time_entries: [
        {
          id: 'entry-open',
          employee_id: 'e1',
          business_date: '2026-06-23',
          service_key: 'lunch',
          planned_shift_id: null,
          status: 'open',
          clock_in_at: '2026-06-23T08:00:00.000Z',
          clock_out_at: null,
          updated_at: '2026-06-23T08:00:00.000Z'
        }
      ]
    }
  });

  const types = new Set(items.map((item) => item.type));
  assert.ok(types.has('employee_unavailable_on_planned_shift'));
  assert.ok(types.has('employee_forgot_badge_out'));
  assert.ok(types.has('worked_during_approved_absence'));
  assert.ok(types.has('employee_no_show'));
  assert.ok(types.has('employee_invite_accepted'));
  assert.equal(items.find((item) => item.type === 'employee_invite_accepted')?.targetUrl, '/team');
});

test('employee notifications cover absence decisions and an own open badge entry', () => {
  const items = deriveNotifications({
    restaurantId: 'r1',
    role: 'employee',
    employeeId: 'e1',
    today: '2026-06-23',
    now: new Date('2026-06-23T12:00:00.000Z'),
    timezone: 'Europe/Brussels',
    operations: {
      ...baseEmployee,
      absences: [
        {
          id: 'absence-decided',
          employee_id: 'e1',
          status: 'approved',
          start_date: '2026-06-27',
          end_date: '2026-06-27',
          service_key: 'evening',
          approved_at: '2026-06-23T10:00:00.000Z',
          rejected_at: null,
          updated_at: '2026-06-23T10:00:00.000Z'
        }
      ],
      time_entries: [
        {
          id: 'own-open-entry',
          employee_id: 'e1',
          business_date: '2026-06-23',
          service_key: 'lunch',
          status: 'open',
          clock_in_at: '2026-06-23T08:00:00.000Z',
          clock_out_at: null,
          updated_at: '2026-06-23T08:00:00.000Z'
        }
      ]
    }
  });

  assert.ok(items.some((item) => item.key === 'absence-decided:absence-decided:approved'));
  assert.equal(
    items.find((item) => item.type === 'absence_request_decided')?.targetUrl,
    '/my-time?date=2026-06-27&service=evening'
  );
  assert.ok(items.some((item) => item.key === 'own-forgot-badge-out:own-open-entry'));
});
