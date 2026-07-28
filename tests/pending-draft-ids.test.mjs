import test from 'node:test';
import assert from 'node:assert/strict';
import { PendingDraftIds } from '../src/lib/classic/pending-draft-ids.ts';

test('pending draft identity survives view remounts until save or discard resets it', () => {
  const pending = new PendingDraftIds();

  pending.add('employee-a');
  pending.add('employee-b');

  assert.equal(pending.has('employee-a'), true);
  assert.equal(pending.has('employee-b'), true);

  pending.remove('employee-a');
  assert.equal(pending.has('employee-a'), false);
  assert.equal(pending.has('employee-b'), true);

  pending.reset();
  assert.equal(pending.has('employee-b'), false);
});
