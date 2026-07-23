import assert from 'node:assert/strict';
import test from 'node:test';

import {
  amountForMinutes,
  cents,
  formatCents,
  multiplyBasisPoints,
  parseEuroCents,
  parseHourlyRate
} from '../src/lib/payroll-engine/money.ts';

test('payroll money parsing is decimal-safe and rejects excess precision', () => {
  assert.equal(parseEuroCents('2418.37'), 241837n);
  assert.equal(parseEuroCents('0.5'), 50n);
  assert.equal(parseEuroCents('12.345'), null);
  assert.equal(parseHourlyRate('20'), '20.0000');
  assert.equal(parseHourlyRate('12,3456'), '12.3456');
  assert.equal(parseHourlyRate('12.34567'), null);
});

test('payroll percentage and minute calculations round deterministically', () => {
  assert.equal(amountForMinutes(225, 200000n), 7500n);
  assert.equal(multiplyBasisPoints(7500n, 1307), 980n);
  assert.equal(multiplyBasisPoints(7500n, 2492), 1869n);
  assert.equal(multiplyBasisPoints(1187n, 767), 91n);
});

test('payroll display formats integer cents without floating-point arithmetic', () => {
  assert.equal(cents('241837'), 241837n);
  assert.equal(formatCents(241837n, 'en-GB'), '€2,418.37');
  assert.equal(formatCents(241837n, 'fr-BE'), '€2.418,37');
  assert.equal(formatCents(-50n, 'nl-BE'), '-€0,50');
});
