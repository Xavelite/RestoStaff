import assert from 'node:assert/strict';
import test from 'node:test';
import {
  orderedMemberships,
  preferredMembership,
  roleHome
} from '../src/lib/workspace/workspace-selection.ts';

const memberships = [
  {
    restaurant_id: 'employee-restaurant',
    restaurant_name: 'Bistro',
    role: 'employee'
  },
  {
    restaurant_id: 'owner-restaurant',
    restaurant_name: 'Atelier',
    role: 'owner'
  },
  {
    restaurant_id: 'manager-restaurant',
    restaurant_name: 'Café',
    role: 'manager'
  }
];

test('workspace fallback is deterministic and favors the highest responsibility role', () => {
  assert.deepEqual(
    orderedMemberships(memberships).map((membership) => membership.role),
    ['owner', 'manager', 'employee']
  );
  assert.equal(preferredMembership(memberships, null)?.restaurant_id, 'owner-restaurant');
});

test('an explicit available workspace preference wins over role priority', () => {
  assert.equal(
    preferredMembership(memberships, 'employee-restaurant')?.restaurant_id,
    'employee-restaurant'
  );
  assert.equal(
    preferredMembership(memberships, 'missing')?.restaurant_id,
    'owner-restaurant'
  );
});

test('role homes separate employee and management workspaces', () => {
  assert.equal(roleHome('owner'), '/home');
  assert.equal(roleHome('manager'), '/home');
  assert.equal(roleHome('employee'), '/shifts');
});
