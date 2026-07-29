import assert from 'node:assert/strict';
import test from 'node:test';

import { projectExportColumns } from '../src/lib/exports/export-download.ts';

test('export column selection preserves the chosen order for every row', () => {
  const projected = projectExportColumns(
    {
      filename: 'schedule.csv',
      headers: ['Employee', 'Date', 'Hours', 'Area'],
      rows: [
        ['Ada', '2026-07-29', '7.50', 'Dining room'],
        ['Sam', '2026-07-30', '5.00', 'Bar']
      ]
    },
    [1, 0, 3]
  );

  assert.deepEqual(projected.headers, ['Date', 'Employee', 'Area']);
  assert.deepEqual(projected.rows, [
    ['2026-07-29', 'Ada', 'Dining room'],
    ['2026-07-30', 'Sam', 'Bar']
  ]);
});

test('export column selection discards duplicate and invalid indexes', () => {
  const projected = projectExportColumns(
    {
      filename: 'worked-time.csv',
      headers: ['Employee', 'Hours'],
      rows: [['Ada', 7.5]]
    },
    [1, 1, -1, 8, 0]
  );

  assert.deepEqual(projected.headers, ['Hours', 'Employee']);
  assert.deepEqual(projected.rows, [[7.5, 'Ada']]);
});
