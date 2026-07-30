import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addDays,
  addMonths,
  activeServicePeriods,
  configuredServicePeriods,
  greetingForMinutes,
  hoursBetweenClocks,
  mondayFor,
  monthDates,
  serviceWindowProgress,
  serviceKeysWithEvidence,
  todayInTimezone,
  weekdayDateLabel,
  weekdayLabel
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

test('weekday labels respect the active account locale', () => {
  assert.equal(weekdayLabel('2026-07-20', 'en-GB'), 'Mon');
  assert.match(weekdayLabel('2026-07-20', 'fr-BE'), /^lun/i);
  assert.match(weekdayLabel('2026-07-20', 'nl-BE'), /^ma/i);
  assert.match(weekdayDateLabel('2026-07-20', 'fr-BE'), /^lun\.?.*20/i);
  assert.match(weekdayDateLabel('2026-07-20', 'nl-BE'), /^ma\.?.*20/i);
});

test('archived services return only when the viewed period contains evidence', () => {
  const services = [
    { service_key: 'lunch', name: 'Lunch', active: false, sort_order: 10 },
    { service_key: 'evening', name: 'Evening', active: true, sort_order: 20 }
  ];

  assert.deepEqual(serviceKeysWithEvidence(services, []), ['evening']);
  assert.deepEqual(serviceKeysWithEvidence(services, ['lunch']), ['lunch', 'evening']);
  assert.deepEqual(
    serviceKeysWithEvidence(services, ['late-night']),
    ['evening', 'late-night']
  );
});

test('configured service periods keep inactive setup rows while active grids follow the real count', () => {
  const services = [
    { service_key: 'day', name: 'Day', active: true, sort_order: 10 },
    { service_key: 'night', name: 'Night', active: false, sort_order: 20 },
    { service_key: 'late', name: 'Late', active: true, sort_order: 30 }
  ];

  assert.deepEqual(
    configuredServicePeriods(services).map((service) => service.service_key),
    ['day', 'night', 'late']
  );
  assert.deepEqual(
    activeServicePeriods(services).map((service) => service.service_key),
    ['day', 'late']
  );
  assert.deepEqual(
    activeServicePeriods(undefined).map((service) => service.name),
    ['Day', 'Night']
  );
});

test('the live roster marker follows the configured service window', () => {
  const services = [
    {
      service_key: 'day',
      name: 'Day',
      active: true,
      sort_order: 10,
      metadata: { default_start: '10:00', default_end: '14:00' }
    },
    {
      service_key: 'night',
      name: 'Night',
      active: true,
      sort_order: 20,
      metadata: { default_start: '18:00', default_end: '22:00' }
    }
  ];

  assert.equal(
    serviceWindowProgress(services, 'UTC', new Date('2026-07-30T16:00:00Z')),
    0.5
  );
  assert.equal(
    serviceWindowProgress(services, 'UTC', new Date('2026-07-30T08:00:00Z')),
    0.02
  );
  assert.equal(
    serviceWindowProgress(services, 'UTC', new Date('2026-07-30T23:00:00Z')),
    0.98
  );

  const overnight = [
    {
      service_key: 'night',
      name: 'Night',
      active: true,
      sort_order: 10,
      metadata: { default_start: '18:00', default_end: '02:00' }
    }
  ];
  assert.equal(
    serviceWindowProgress(overnight, 'UTC', new Date('2026-07-31T01:00:00Z')),
    0.875
  );
  assert.equal(
    serviceWindowProgress(overnight, 'UTC', new Date('2026-07-31T08:00:00Z')),
    0.02
  );
});
