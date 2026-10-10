import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildWeeklyRosterExport,
  weeklyRosterCellText,
  weeklyRosterFlatTable
} from '../src/lib/exports/weekly-roster.ts';

function fixture(overrides = {}) {
  return {
    restaurantName: 'Bouillon Test',
    employeeLabel: 'Employee',
    totalLabel: 'Week',
    staffLabel: 'Staff scheduled',
    hoursLabel: 'Planned hours',
    employees: [
      { id: 'employee-1', name: 'Amélie Laurent' },
      { id: 'employee-2', name: 'Glenn Van Essche' }
    ],
    days: [
      { date: '2026-08-10', label: 'Mon 10' },
      { date: '2026-08-11', label: 'Tue 11' }
    ],
    services: [
      { key: 'day', label: 'Day' },
      { key: 'night', label: 'Night' }
    ],
    shifts: [
      {
        employeeId: 'employee-1',
        date: '2026-08-10',
        serviceKey: 'day',
        startsAt: '12:00',
        endsAt: '15:00',
        position: 'Waiter'
      },
      {
        employeeId: 'employee-1',
        date: '2026-08-10',
        serviceKey: 'night',
        startsAt: '18:00',
        endsAt: '23:00',
        position: 'Waiter'
      },
      {
        employeeId: 'employee-2',
        date: '2026-08-10',
        serviceKey: 'day',
        startsAt: '11:30',
        endsAt: '16:00',
        position: 'Cook'
      }
    ],
    ...overrides
  };
}

test('weekly roster separates services and calculates employee, service, day and week totals', () => {
  const roster = buildWeeklyRosterExport(fixture());

  assert.equal(roster.rows.length, 2);
  assert.equal(roster.rows[0].cells.length, 4);
  assert.equal(roster.rows[0].totalHours, 8);
  assert.equal(roster.rows[1].totalHours, 4.5);
  assert.deepEqual(roster.staffCounts, [2, 1, 0, 0]);
  assert.deepEqual(roster.serviceHours, [7.5, 5, 0, 0]);
  assert.equal(roster.days[0].staffCount, 2);
  assert.equal(roster.days[0].totalHours, 12.5);
  assert.equal(roster.shiftCount, 3);
  assert.equal(roster.totalHours, 12.5);
});

test('weekly roster cells show only hours and position, not operational areas', () => {
  const roster = buildWeeklyRosterExport(fixture());

  assert.equal(weeklyRosterCellText(roster.rows[0].cells[0]), '12:00-15:00\nWaiter');
  assert.doesNotMatch(weeklyRosterCellText(roster.rows[0].cells[0]), /Dining room/);
});

test('weekly roster keeps configured service periods dynamic and ignores out-of-range evidence', () => {
  const input = fixture({
    services: [
      { key: 'breakfast', label: 'Breakfast' },
      { key: 'day', label: 'Day' },
      { key: 'night', label: 'Night' }
    ]
  });
  input.shifts.push({
    employeeId: 'employee-1',
    date: '2026-08-18',
    serviceKey: 'day',
    startsAt: '12:00',
    endsAt: '15:00',
    position: 'Waiter'
  });

  const roster = buildWeeklyRosterExport(input);
  const flat = weeklyRosterFlatTable(roster);

  assert.equal(roster.rows[0].cells.length, 6);
  assert.equal(roster.shiftCount, 3);
  assert.deepEqual(flat.headers.slice(0, 5), [
    'Employee',
    'Mon 10 · Breakfast',
    'Mon 10 · Day',
    'Mon 10 · Night',
    'Tue 11 · Breakfast'
  ]);
});
