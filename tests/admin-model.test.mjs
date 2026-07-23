import assert from 'node:assert/strict';
import test from 'node:test';

import { parseAdminDashboard } from '../src/lib/admin/admin-model.ts';

test('admin dashboard parser preserves tenant scope and account health', () => {
  const dashboard = parseAdminDashboard({
    restaurants: [{
      id: 'restaurant-1',
      name: 'North Room',
      city: 'Brussels',
      active: true,
      created_at: '2026-07-01T10:00:00Z',
      employee_count: 4,
      member_count: '2',
      shift_count: 19,
      time_entry_count: 12,
      absence_count: 1,
      payroll_export_count: 3,
      last_activity: '2026-07-20T10:00:00Z'
    }],
    users: [{
      id: 'profile-1',
      email: 'owner@example.com',
      suspended: false,
      is_admin: true,
      memberships: [{
        restaurant_id: 'restaurant-1',
        restaurant: 'North Room',
        restaurant_active: false,
        role: 'owner',
        status: 'active'
      }]
    }],
    events: [{
      id: 'event-1',
      action: 'restaurant_suspended',
      target_type: 'restaurant',
      target_id: 'restaurant-1',
      detail: { name: 'North Room' },
      created_at: '2026-07-21T10:00:00Z',
      admin_email: 'owner@example.com'
    }],
    stats: {
      restaurant_count: 1,
      active_restaurant_count: 0,
      user_count: 1,
      active_7d: 1,
      suspended_user_count: 0,
      unassigned_user_count: 0
    }
  });

  assert.equal(dashboard.restaurants[0].memberCount, 2);
  assert.equal(dashboard.restaurants[0].payrollExportCount, 3);
  assert.equal(dashboard.users[0].memberships[0].restaurantId, 'restaurant-1');
  assert.equal(dashboard.users[0].memberships[0].restaurantActive, false);
  assert.deepEqual(dashboard.events[0].detail, { name: 'North Room' });
  assert.equal(dashboard.stats.restaurantCount, 1);
});

test('admin dashboard parser safely normalizes malformed counts and optional collections', () => {
  const dashboard = parseAdminDashboard({
    restaurants: [{ id: 'restaurant-1', name: 'Test', employee_count: -2, shift_count: 'invalid' }],
    users: [{ id: 'profile-1', email: 'person@example.com', memberships: null }],
    events: [{ id: 'event-1', detail: ['invalid'] }],
    stats: { restaurant_count: 'invalid', user_count: -1 }
  });

  assert.equal(dashboard.restaurants[0].employeeCount, 0);
  assert.equal(dashboard.restaurants[0].shiftCount, 0);
  assert.deepEqual(dashboard.users[0].memberships, []);
  assert.deepEqual(dashboard.events[0].detail, {});
  assert.equal(dashboard.stats.restaurantCount, 0);
  assert.equal(dashboard.stats.userCount, 0);
});
