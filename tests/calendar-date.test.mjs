import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addDays,
  addMonths,
  greetingForMinutes,
  hoursBetweenClocks,
  mondayFor,
  monthDates,
  todayInTimezone
} from '../src/lib/calendar/date.ts';

test('calendar dates stay Monday-first across month and year boundaries', () => {
  assert.equal(mondayFor('2026-01-01'), '2025-12-29');
  assert.equal(addDays('2025-12-31', 1), '2026-01-01');
  assert.equal(addMonths('2026-01-31', 1), '2026-02-01');
  assert.equal(monthDates('2026-06-18')[0], '2026-06-01');
  assert.equal(monthDates('2026-06-18').length, 35);
});

test('overnight ranges and restaurant timezone dates are deterministic', () => {
  assert.equal(hoursBetweenClocks('22:00', '02:00'), 4);
  assert.equal(
    todayInTimezone('Europe/Brussels', new Date('2026-06-17T22:30:00Z')),
    '2026-06-18'
  );
});

test('greetings follow the restaurant-local time of day', () => {
  assert.equal(greetingForMinutes(11 * 60 + 59), 'Good morning');
  assert.equal(greetingForMinutes(12 * 60), 'Good afternoon');
  assert.equal(greetingForMinutes(17 * 60 + 59), 'Good afternoon');
  assert.equal(greetingForMinutes(18 * 60), 'Good evening');
});
