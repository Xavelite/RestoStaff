import assert from 'node:assert/strict';
import test from 'node:test';

import { floorPlanDraftWithoutBlankAreas } from '../src/lib/reservations/floor-plan-draft.ts';

test('blank area rows and their generated floor-plan records are omitted together', () => {
  const floorPlans = {
    floors: [{ id: 'floor-1' }],
    rooms: [
      { id: 'room-kept', work_area_id: 'area-kept' },
      { id: 'room-blank', work_area_id: 'area-blank' }
    ],
    tables: [
      { id: 'table-kept', room_id: 'room-kept' },
      { id: 'table-blank', room_id: 'room-blank' }
    ],
    combinations: [
      {
        id: 'combination-kept',
        room_id: 'room-kept',
        table_ids: ['table-kept']
      },
      {
        id: 'combination-blank',
        room_id: 'room-blank',
        table_ids: ['table-blank']
      }
    ]
  };
  const areas = [
    { id: 'area-kept', name: 'Dining room', active: true },
    { id: 'area-blank', name: '   ', active: true }
  ];

  const result = floorPlanDraftWithoutBlankAreas(floorPlans, areas);

  assert.deepEqual(result.rooms.map((room) => room.id), ['room-kept']);
  assert.deepEqual(result.tables.map((table) => table.id), ['table-kept']);
  assert.deepEqual(
    result.combinations.map((combination) => combination.id),
    ['combination-kept']
  );
  assert.equal(result.floors, floorPlans.floors);
});
