import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildEmployeeWeek } from '../src/lib/employee/employee-model.ts';
import {
  planningConflicts,
  slotContext
} from '../src/lib/planning/planning-model.ts';

const migrationPath =
  'supabase/migrations/202606210019_canonical_work_pattern_model.sql';

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

test('work-pattern exceptions are a separate audited lifecycle, not absences', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  assert.match(sql, /rename to work_pattern_exceptions/i);
  assert.match(sql, /rename to work_pattern_exception_events/i);
  assert.match(sql, /save_work_pattern_exception_lifecycle/i);
  assert.match(sql, /fixed_schedule/i);
  assert.match(sql, /work_pattern_exceptions_regime_guard/i);
  assert.match(sql, /drop function public\.save_schedule_exception_lifecycle/i);
  assert.match(
    sql,
    /revoke all on table public\.work_pattern_exceptions\s+from public, anon, authenticated/i
  );
  assert.match(sql, /'work_pattern_exceptions'/i);
  assert.match(
    sql,
    /build_workspace_runtime_snapshot_v2[\s\S]*'work_pattern_exceptions'/i
  );
  assert.doesNotMatch(
    sql,
    /insert into public\.absences/i,
    'work-pattern exceptions must never consume the leave domain'
  );
});

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
