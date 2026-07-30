import assert from 'node:assert/strict';
import test from 'node:test';

const { moduleForPath, modulesForRole, subNavItemForPath } = await import('../src/lib/workspace-ui/workspace-nav.ts');

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

test('manager navigation follows the product workflow and owner payroll stays focused', () => {
  const visible = (role) =>
    modulesForRole(role)
      .filter((module) => !module.homeOnly && !module.utility)
      .map((module) => module.key);

  assert.deepEqual(visible('manager'), [
    'home',
    'restaurant',
    'team',
    'schedule',
    'time',
    'reservations',
    'badge-terminal',
    'documents',
    'exports',
    'reports'
  ]);
  assert.deepEqual(visible('owner'), [
    'home',
    'restaurant',
    'team',
    'schedule',
    'time',
    'reservations',
    'badge-terminal',
    'payroll',
    'documents',
    'exports',
    'reports'
  ]);

  const payroll = moduleForPath('/payroll');
  assert.equal(payroll?.key, 'payroll');
  assert.equal(payroll?.href, '/payroll/employees');
  assert.equal(payroll?.subNav, undefined);
  assert.equal(moduleForPath('/payroll/employees')?.key, 'payroll');
  assert.equal(moduleForPath('/exports')?.key, 'exports');
});

test('server module entitlements remove disabled modules for every role surface', () => {
  const entitlements = {
    home: 'enabled',
    restaurant: 'enabled',
    team: 'enabled',
    documents: 'enabled',
    schedule: 'enabled',
    time: 'enabled',
    'badge-terminal': 'enabled',
    reservations: 'disabled',
    payroll: 'disabled',
    reports: 'disabled',
    exports: 'enabled',
    settings: 'enabled'
  };

  const visible = modulesForRole('owner', entitlements).map((module) => module.key);
  assert.equal(visible.includes('reservations'), false);
  assert.equal(visible.includes('payroll'), false);
  assert.equal(visible.includes('reports'), false);
  assert.equal(visible.includes('exports'), true);
});
