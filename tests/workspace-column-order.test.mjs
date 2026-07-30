import assert from 'node:assert/strict';
import test from 'node:test';
import { reorderedColumns } from '../src/lib/workspace-ui/workspace-column-order-model.ts';

test('column reordering inserts before or after the hovered column', () => {
  const columns = ['position', 'email', 'phone', 'contract'];

  assert.deepEqual(
    reorderedColumns(columns, 'phone', 'position', false),
    ['phone', 'position', 'email', 'contract']
  );
  assert.deepEqual(
    reorderedColumns(columns, 'position', 'phone', true),
    ['email', 'phone', 'position', 'contract']
  );
});

test('column reordering ignores fixed, missing and self targets', () => {
  const columns = ['position', 'email', 'phone'];

  assert.strictEqual(reorderedColumns(columns, 'email', 'email', false), columns);
  assert.strictEqual(reorderedColumns(columns, 'employee', 'phone', false), columns);
  assert.strictEqual(reorderedColumns(columns, 'email', 'chooser', false), columns);
});
