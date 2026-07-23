import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveCommunicationNotifications } from '../src/lib/communications/communication-notifications.ts';

function communications(overrides = {}) {
  return {
    employees: [{ id: 'employee-1', display_name: 'Amelie Laurent' }],
    messages: [],
    messageRecipients: [],
    ...overrides
  };
}

test('an operational message reaches its recipient as a notification', () => {
  const items = deriveCommunicationNotifications({
    restaurantId: 'restaurant-1',
    role: 'employee',
    employeeId: 'employee-1',
    communications: communications({
      messages: [
        {
          id: 'message-1', body: 'Please confirm.', priority: 'urgent',
          created_at: '2026-07-22T08:00:00Z'
        },
        {
          id: 'message-2', body: 'Menu changes tonight.', priority: 'normal',
          created_at: '2026-07-22T09:00:00Z'
        }
      ],
      messageRecipients: [
        { message_id: 'message-1', employee_id: 'employee-1', read_at: null },
        { message_id: 'message-2', employee_id: 'employee-1', read_at: '2026-07-22T09:30:00Z' }
      ]
    })
  });

  // Newest first, and urgency drives severity so phone delivery can prioritise.
  assert.deepEqual(items.map((item) => item.type), [
    'operational_message_received',
    'operational_message_received'
  ]);
  assert.equal(items[0].severity, 'info');
  assert.equal(items[0].readAt, '2026-07-22T09:30:00Z');
  assert.equal(items[1].severity, 'critical');
  assert.equal(items[1].readAt, null);
  assert.equal(items[1].targetUrl, '/my-service?communications=messages');
});

test('a message addressed to someone else never leaks into this feed', () => {
  const items = deriveCommunicationNotifications({
    restaurantId: 'restaurant-1',
    role: 'employee',
    employeeId: 'employee-1',
    communications: communications({
      messages: [{
        id: 'message-1', body: 'For the kitchen only.', priority: 'normal',
        created_at: '2026-07-22T08:00:00Z'
      }],
      messageRecipients: [{
        message_id: 'message-1', employee_id: 'employee-2', read_at: null
      }]
    })
  });

  assert.deepEqual(items, []);
});

test('managers author messages rather than receive them', () => {
  const items = deriveCommunicationNotifications({
    restaurantId: 'restaurant-1',
    role: 'manager',
    employeeId: null,
    communications: communications({
      messages: [{
        id: 'message-1', body: 'Please confirm.', priority: 'urgent',
        created_at: '2026-07-22T08:00:00Z'
      }],
      messageRecipients: [{
        message_id: 'message-1', employee_id: 'employee-1', read_at: null
      }]
    })
  });

  assert.deepEqual(items, []);
});
