import assert from 'node:assert/strict';
import test from 'node:test';

const {
  combinationCapacityBounds,
  combinationName,
  isValidTableCombination,
  reconcileTableCombinations
} = await import(
  '../src/lib/reservations/reservation-table-combinations.ts'
);

const tables = [
  {
    id: 'table-a',
    room_id: 'room-main',
    label: '1',
    minimum_capacity: 1,
    maximum_capacity: 4,
    active: true,
    sort_order: 0
  },
  {
    id: 'table-b',
    room_id: 'room-main',
    label: '2',
    minimum_capacity: 2,
    maximum_capacity: 6,
    active: true,
    sort_order: 1
  },
  {
    id: 'table-upstairs',
    room_id: 'room-upstairs',
    label: '1',
    minimum_capacity: 1,
    maximum_capacity: 2,
    active: true,
    sort_order: 0
  }
];

test('joinable table sets derive a useful range from physical seats', () => {
  assert.deepEqual(
    combinationCapacityBounds(
      ['table-b', 'table-a'],
      'room-main',
      tables
    ),
    {
      minimum: 2,
      maximum: 10,
      recommendedMinimum: 7
    }
  );
  assert.equal(
    combinationName(['table-b', 'table-a'], 'room-main', tables),
    '1 + 2'
  );
});

test('joinable table sets require two unique active tables in one area', () => {
  assert.equal(
    combinationCapacityBounds(
      ['table-a', 'table-upstairs'],
      'room-main',
      tables
    ),
    null
  );
  assert.equal(
    combinationCapacityBounds(
      ['table-a', 'table-a'],
      'room-main',
      tables
    ),
    null
  );
  assert.equal(
    isValidTableCombination(
      {
        id: 'combo',
        room_id: 'room-main',
        name: '1 + 2',
        minimum_capacity: 7,
        maximum_capacity: 11,
        active: true,
        sort_order: 0,
        table_ids: ['table-a', 'table-b']
      },
      tables
    ),
    false,
    'the configured maximum cannot exceed the physical seats'
  );
});

test('archiving a member deactivates a table set that can no longer be joined', () => {
  const reconciled = reconcileTableCombinations(
    [
      {
        id: 'combo',
        room_id: 'room-main',
        name: '1 + 2',
        minimum_capacity: 7,
        maximum_capacity: 10,
        active: true,
        sort_order: 0,
        table_ids: ['table-a', 'table-b']
      }
    ],
    tables.map((table) =>
      table.id === 'table-b' ? { ...table, active: false } : table
    )
  );

  assert.equal(reconciled[0].active, false);
  assert.deepEqual(reconciled[0].table_ids, ['table-a']);
});
