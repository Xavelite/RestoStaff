import assert from 'node:assert/strict';
import test from 'node:test';

import { setupItemCode } from '../src/lib/restaurant/setup-item-code.ts';

test('new restaurant items derive their code from the complete current name', () => {
  const id = '12345678-1234-1234-1234-123456789abc';

  assert.equal(setupItemCode('C', id, 'position'), 'c');
  assert.equal(setupItemCode('Chef de rang', id, 'position'), 'chef-de-rang');
  assert.equal(setupItemCode('Cuisine Chaud', id, 'area'), 'cuisine-chaud');
});

test('empty restaurant item names keep a deterministic technical fallback', () => {
  const id = '12345678-1234-1234-1234-123456789abc';

  assert.equal(setupItemCode('', id, 'area'), 'area-12345678');
  assert.equal(setupItemCode('', id, 'position'), 'position-12345678');
});
