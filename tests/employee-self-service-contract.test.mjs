import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultEmployeeTimeOffType,
  employeeSlotAction,
  employeeTimeOffTypes,
  groupTimeOffRanges,
  removeEmployeeSlotSelection,
  setAvailabilityOverride,
  toggleEmployeeSlotSelection
} from '../src/lib/employee/employee-self-service.ts';
import {
  SELECTABLE_AVAILABILITY,
  availabilityUpdateHint,
  nextEmployeeService
} from '../src/lib/employee/employee-model.ts';

function serviceSlot(date, startsAt) {
  return {
    key: `employee|${date}|lunch`,
    date,
    serviceKey: 'lunch',
    shift: { startsAt },
    entry: null
  };
}

test('employees answer availability both ways while leave stays a separate action', () => {
  // Saying "I cannot work this" is a real answer, distinct from saying nothing,
  // and distinct again from formally requesting time off.
  assert.deepEqual(
    SELECTABLE_AVAILABILITY.map((option) => option.value),
    ['available', 'unavailable']
  );
  assert.equal(
    availabilityUpdateHint('available'),
    'Your manager can schedule you for this service. Clear availability before requesting time off.'
  );
  assert.equal(
    availabilityUpdateHint('unavailable'),
    'Your manager sees you cannot work this service. Being scheduled anyway shows as a clash.'
  );
  // No answer at all is its own state, and prompts for one.
  assert.equal(
    availabilityUpdateHint(''),
    'Tell your manager whether you can work this service.'
  );
  // 'partial' is retired: still rendered for old rows, never offered again.
  assert.ok(!SELECTABLE_AVAILABILITY.some((option) => option.value === 'partial'));
  assert.equal(
    availabilityUpdateHint('partial'),
    'This old response needs updating. Say whether you are available or not.'
  );
});

test('next service excludes shifts that have already started today', () => {
  const pastToday = serviceSlot('2026-07-13', '12:00');
  const futureToday = serviceSlot('2026-07-13', '19:00');
  const tomorrow = serviceSlot('2026-07-14', '11:00');

  assert.equal(
    nextEmployeeService([tomorrow, pastToday, futureToday], {
      date: '2026-07-13',
      minutes: 18 * 60
    })?.shift?.startsAt,
    '19:00'
  );
  assert.equal(
    nextEmployeeService([pastToday, tomorrow], {
      date: '2026-07-13',
      minutes: 18 * 60
    })?.date,
    '2026-07-14'
  );
});

test('slot selection toggles without duplicate state', () => {
  const slot = { key: 'e1|2026-06-22|lunch', date: '2026-06-22', serviceKey: 'lunch' };
  assert.deepEqual(toggleEmployeeSlotSelection([], slot), [slot]);
  assert.deepEqual(toggleEmployeeSlotSelection([slot], slot), []);
  assert.deepEqual(removeEmployeeSlotSelection([slot], slot.key), []);
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
  // Availability tab only belongs to weekly-availability employees.
  assert.equal(employeeSlotAction('availability', 'weekly_availability'), 'set_availability');
  assert.equal(employeeSlotAction('availability', 'fixed_schedule'), 'none');
  assert.equal(employeeSlotAction('availability', 'manager_only'), 'none');
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
