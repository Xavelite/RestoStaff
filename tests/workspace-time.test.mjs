import assert from 'node:assert/strict';
import test from 'node:test';

import {
  needsAttention,
  slotLabel,
  slotTone
} from '../src/lib/workspace-ui/workspace-time.ts';

test('a planned slot without badge activity reads as scheduled, not completed', () => {
  const slot = { status: 'empty' };

  assert.equal(slotLabel(slot.status), 'Scheduled');
  assert.equal(slotTone(slot.status), 'info');
  assert.equal(needsAttention(slot), false);
});

test('only actionable timesheet states raise attention', () => {
  assert.equal(needsAttention({ status: 'adjusted' }), true);
  assert.equal(needsAttention({ status: 'missing' }), true);
  assert.equal(needsAttention({ status: 'recorded' }), false);
  assert.equal(needsAttention({ status: 'absence' }), false);
});
