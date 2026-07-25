import assert from 'node:assert/strict';
import test from 'node:test';

const { moduleForPath, subNavItemForPath } = await import('../src/lib/classic/classic-nav.ts');

test('Team root resolves to People while deeper routes resolve to their exact tab', () => {
  const team = moduleForPath('/team');
  assert.equal(team?.key, 'team');
  assert.equal(subNavItemForPath(team, '/team')?.href, '/team');
  assert.equal(subNavItemForPath(team, '/team/contracts')?.href, '/team/contracts');
  assert.equal(subNavItemForPath(team, '/team/access')?.href, '/team/access');
  assert.equal(subNavItemForPath(team, '/team/absences')?.href, '/team/absences');
});

test('Restaurant root and nested routes resolve deterministically', () => {
  const restaurant = moduleForPath('/restaurant');
  assert.equal(restaurant?.key, 'restaurant');
  assert.equal(subNavItemForPath(restaurant, '/restaurant')?.href, '/restaurant');
  assert.equal(subNavItemForPath(restaurant, '/restaurant/coverage')?.href, '/restaurant/coverage');
});
