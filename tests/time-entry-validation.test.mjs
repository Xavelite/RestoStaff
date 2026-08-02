import assert from 'node:assert/strict';
import test from 'node:test';

import { validateExactBreakIntervals } from '../src/lib/timesheet/time-entry-validation.ts';

const shiftStart = '2026-08-02T08:00:00.000Z';
const shiftEnd = '2026-08-02T16:00:00.000Z';

test('exact breaks accept ordered, adjacent intervals inside worked time', () => {
  assert.equal(
    validateExactBreakIntervals(shiftStart, shiftEnd, [
      { startedAt: '2026-08-02T10:00:00.000Z', endedAt: '2026-08-02T10:15:00.000Z' },
      { startedAt: '2026-08-02T10:15:00.000Z', endedAt: '2026-08-02T10:30:00.000Z' }
    ]),
    null
  );
});

test('exact breaks reject reversed, outside and overlapping intervals', () => {
  assert.equal(
    validateExactBreakIntervals(shiftStart, shiftEnd, [
      { startedAt: '2026-08-02T10:30:00.000Z', endedAt: '2026-08-02T10:00:00.000Z' }
    ]),
    'end_not_after_start'
  );
  assert.equal(
    validateExactBreakIntervals(shiftStart, shiftEnd, [
      { startedAt: '2026-08-02T07:45:00.000Z', endedAt: '2026-08-02T08:15:00.000Z' }
    ]),
    'outside_work_interval'
  );
  assert.equal(
    validateExactBreakIntervals(shiftStart, shiftEnd, [
      { startedAt: '2026-08-02T10:00:00.000Z', endedAt: '2026-08-02T10:30:00.000Z' },
      { startedAt: '2026-08-02T10:20:00.000Z', endedAt: '2026-08-02T10:45:00.000Z' }
    ]),
    'overlap'
  );
});
