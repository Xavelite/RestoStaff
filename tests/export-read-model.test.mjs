import assert from 'node:assert/strict';
import test from 'node:test';

import { addDays } from '../src/lib/calendar/date.ts';
import {
  exportOperationalReadRanges,
  getExportOperationsReadModel,
  MAX_EXPORT_DAYS
} from '../src/lib/exports/export-read-model.ts';

function inclusiveDays(from, to) {
  return (
    Math.round(
      (new Date(`${to}T00:00:00Z`).getTime() -
        new Date(`${from}T00:00:00Z`).getTime()) /
        86_400_000
    ) + 1
  );
}

test('export reads split the full 53-week allowance into RPC-safe chunks', () => {
  const from = '2026-01-05';
  const to = addDays(from, MAX_EXPORT_DAYS - 1);
  const ranges = exportOperationalReadRanges(from, to);

  assert.equal(ranges.length, 6);
  assert.equal(ranges[0].from, from);
  assert.equal(ranges.at(-1).to, to);
  assert.ok(ranges.every((range) => inclusiveDays(range.from, range.to) <= 63));
  for (let index = 1; index < ranges.length; index += 1) {
    assert.equal(ranges[index].from, addDays(ranges[index - 1].to, 1));
  }
});

test('export periods stop at the payroll contract maximum', () => {
  const from = '2026-01-05';
  assert.doesNotThrow(() =>
    exportOperationalReadRanges(from, addDays(from, MAX_EXPORT_DAYS - 1))
  );
  assert.throws(
    () => exportOperationalReadRanges(from, addDays(from, MAX_EXPORT_DAYS)),
    /cannot exceed 53 weeks/
  );
});

test('chunked export reads merge dated evidence before building a file', async () => {
  const calls = [];
  const reader = async (restaurantId, from, to) => {
    calls.push({ restaurantId, from, to });
    return {
      restaurant: { id: restaurantId },
      restaurant_settings: {},
      employees: [{ id: 'employee-1', display_name: 'Amélie Laurent' }],
      employee_contracts: [],
      employee_job_functions: [],
      job_functions: [],
      planned_shifts: [{ id: `shift-${from}` }],
      published_planned_shifts: [{ id: `published-${from}` }],
      time_entries: [{ id: `entry-${from}` }],
      absences: [],
      work_pattern_exceptions: []
    };
  };

  const model = await getExportOperationsReadModel(
    'restaurant-1',
    '2026-01-01',
    '2026-05-31',
    reader
  );

  assert.equal(calls.length, 3);
  assert.ok(calls.every((range) => inclusiveDays(range.from, range.to) <= 63));
  assert.equal(model.planned_shifts.length, 3);
  assert.equal(model.published_planned_shifts.length, 3);
  assert.equal(model.time_entries.length, 3);
});
