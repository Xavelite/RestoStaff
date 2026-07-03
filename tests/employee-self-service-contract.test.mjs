import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  defaultEmployeeTimeOffType,
  employeeSlotAction,
  employeeTimeOffTypes,
  groupTimeOffRanges,
  setAvailabilityOverride,
  toggleEmployeeSlotSelection
} from '../src/lib/employee/employee-self-service.ts';

const migration =
  'supabase/migrations/202606200010_employee_self_service_policy.sql';
const cleanupMigration =
  'supabase/migrations/202606200011_remove_obsolete_employee_self_service.sql';

test('unconfigured employees default to weekly self-service at the database boundary', async () => {
  const sql = await readFile(migration, 'utf8');
  assert.match(sql, /contract_type_id is null[\s\S]*weekly_availability/i);
  assert.match(
    sql,
    /alter column work_regime set default 'weekly_availability'/i
  );
  assert.match(sql, /create or replace function public\.save_employee_availability/i);
  assert.match(sql, /Availability is locked once the week is published/i);
  assert.match(sql, /guard_actuals_approval/i);
});

test('the superseded mixed employee mutation is removed', async () => {
  const sql = await readFile(cleanupMigration, 'utf8');
  assert.match(sql, /drop function public\.save_employee_self_service/i);
});

test('slot selection toggles without duplicate state', () => {
  const slot = { key: 'e1|2026-06-22|lunch', date: '2026-06-22', serviceKey: 'lunch' };
  assert.deepEqual(toggleEmployeeSlotSelection([], slot), [slot]);
  assert.deepEqual(toggleEmployeeSlotSelection([slot], slot), []);
});

test('time off groups any selection into ranges — never silently dropped', () => {
  // Consecutive same-service days merge into one range.
  assert.deepEqual(
    groupTimeOffRanges([
      { key: '1', date: '2026-06-22', serviceKey: 'lunch' },
      { key: '2', date: '2026-06-23', serviceKey: 'lunch' }
    ]),
    [{ startDate: '2026-06-22', endDate: '2026-06-23', serviceKey: 'lunch' }]
  );
  // Both services on a day collapse to a single full-day ('') range.
  assert.deepEqual(
    groupTimeOffRanges([
      { key: '1', date: '2026-06-22', serviceKey: 'lunch' },
      { key: '2', date: '2026-06-22', serviceKey: 'evening' }
    ]),
    [{ startDate: '2026-06-22', endDate: '2026-06-22', serviceKey: '' }]
  );
  // A non-contiguous / mixed selection that the old single-range model dropped
  // now yields one range per contiguous same-service run — all submittable.
  assert.deepEqual(
    groupTimeOffRanges([
      { key: '1', date: '2026-06-22', serviceKey: 'lunch' },
      { key: '2', date: '2026-06-24', serviceKey: 'lunch' },
      { key: '3', date: '2026-06-25', serviceKey: 'evening' }
    ]),
    [
      { startDate: '2026-06-22', endDate: '2026-06-22', serviceKey: 'lunch' },
      { startDate: '2026-06-24', endDate: '2026-06-24', serviceKey: 'lunch' },
      { startDate: '2026-06-25', endDate: '2026-06-25', serviceKey: 'evening' }
    ]
  );
  assert.deepEqual(groupTimeOffRanges([]), []);
});

test('employee time off defaults to the restaurant holiday type', () => {
  const types = [
    { id: 'sick', name: 'Sick leave', code: 'SICK', category: 'medical', active: true },
    { id: 'holiday', name: 'Annual holiday', code: 'HOLIDAY', category: 'holiday', active: true }
  ];
  assert.equal(defaultEmployeeTimeOffType(types)?.id, 'holiday');
});

test('public holidays are not offered as ordinary employee requests', () => {
  const types = [
    { id: 'public', name: 'Public holiday', code: 'PUBLIC_HOLIDAY', active: true },
    { id: 'holiday', name: 'Annual holiday', code: 'HOLIDAY', active: true }
  ];
  assert.deepEqual(employeeTimeOffTypes(types).map((type) => type.id), ['holiday']);
});

test('one slot, one action: the tab + regime decide the request kind, never the bucket', () => {
  // Time-off tab always requests an absence, regardless of regime.
  assert.equal(employeeSlotAction('time_off', 'weekly_availability'), 'request_time_off');
  assert.equal(employeeSlotAction('time_off', 'fixed_schedule'), 'request_time_off');
  assert.equal(employeeSlotAction('time_off', 'manager_only'), 'request_time_off');
  // Availability tab sets weekly availability, or a fixed-schedule change.
  assert.equal(employeeSlotAction('availability', 'weekly_availability'), 'set_availability');
  assert.equal(employeeSlotAction('availability', 'fixed_schedule'), 'request_change');
});

test('availability override forces one effective state per slot', () => {
  const slot = { date: '2026-06-22', serviceKey: 'lunch' };
  // Adding time off on an available slot clears availability to neutral.
  assert.deepEqual(
    setAvailabilityOverride([], slot, '', 'available'),
    [{ date: '2026-06-22', serviceKey: 'lunch', state: '' }]
  );
  // Marking a drafted slot available records the available override.
  assert.deepEqual(
    setAvailabilityOverride([], slot, 'available', ''),
    [{ date: '2026-06-22', serviceKey: 'lunch', state: 'available' }]
  );
  // Forcing the slot back to its saved truth drops the override entirely.
  assert.deepEqual(
    setAvailabilityOverride(
      [{ date: '2026-06-22', serviceKey: 'lunch', state: '' }],
      slot,
      'available',
      'available'
    ),
    []
  );
});
