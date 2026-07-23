import assert from 'node:assert/strict';
import test from 'node:test';
import { personInitials, shortPersonName } from '../src/lib/ui/person.ts';

test('person labels stay consistent across empty, single and multi-part names', () => {
  assert.equal(personInitials(''), '??');
  assert.equal(personInitials('Xavier'), 'XA');
  assert.equal(personInitials('Amelie Marie Laurent'), 'AL');
  assert.equal(shortPersonName('Xavier'), 'Xavier');
  assert.equal(shortPersonName('Amelie Marie Laurent'), 'Amelie L.');
});
