import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { StableDraftPlacement } from '../src/lib/workspace-ui/stable-draft-placement.ts';

const clone = (value) => structuredClone(value);

test('a Position linked-area edit stays in its committed group until save resets placement', () => {
  const placement = new StableDraftPlacement(clone);
  const saved = {
    id: 'cook',
    name: 'Cook',
    active: true,
    areaIds: ['kitchen'],
    estimatedHourlyCost: 24
  };
  placement.reset([saved]);

  const edited = {
    ...saved,
    areaIds: ['bar'],
    estimatedHourlyCost: 26
  };
  assert.deepEqual(placement.snapshotFor(edited).areaIds, ['kitchen']);
  assert.equal(placement.snapshotFor(edited).estimatedHourlyCost, 24);
  assert.deepEqual(edited.areaIds, ['bar']);

  placement.reset([edited]);
  assert.deepEqual(placement.snapshotFor(edited).areaIds, ['bar']);
  assert.equal(placement.snapshotFor(edited).estimatedHourlyCost, 26);
});

test('an Area floor edit keeps its committed list order until save resets placement', () => {
  const placement = new StableDraftPlacement(clone);
  const saved = {
    id: 'dining-room',
    floorOrder: 1,
    positionX: 20,
    positionY: 20,
    name: 'Dining room'
  };
  placement.reset([saved]);

  const edited = {
    ...saved,
    floorOrder: 3,
    positionY: 260
  };
  assert.deepEqual(placement.snapshotFor(edited), saved);

  placement.reset([edited]);
  assert.deepEqual(placement.snapshotFor(edited), edited);
});

test('Restaurant grids consume stable placement for filters, sorting and grouping', async () => {
  const [config, positions, coverage, areas] = await Promise.all([
    readFile('src/lib/workspace-ui/workspace-restaurant.svelte.ts', 'utf8'),
    readFile('src/routes/(app)/restaurant/positions/+page.svelte', 'utf8'),
    readFile('src/routes/(app)/restaurant/coverage/+page.svelte', 'utf8'),
    readFile('src/lib/reservations/ReservationFloorPlansWorkspace.svelte', 'utf8')
  ]);

  assert.match(config, /#areaPlacement = new StableDraftPlacement<AreaDraft>/);
  assert.match(config, /#positionPlacement = new StableDraftPlacement<JobFunctionDraft>/);
  assert.match(config, /StableDraftPlacement<AreaDraft>\(cloneAreaPlacement\)/);
  assert.match(config, /StableDraftPlacement<JobFunctionDraft>\(clonePositionPlacement\)/);
  assert.doesNotMatch(config, /StableDraftPlacement<(?:AreaDraft|JobFunctionDraft)>\(structuredClone\)/);
  assert.match(config, /this\.#positionPlacement\.reset\(next\.jobFunctions\)/);
  assert.match(config, /await workspace\.loadRestaurant\(true\);[\s\S]*this\.sync\(workspace\.restaurant, true\)/);

  assert.match(positions, /const stable = placementForPosition\(position\)/);
  assert.match(positions, /linkedPositionAreaIds\(stable\)/);
  assert.match(positions, /stable\.estimatedHourlyCost/);
  assert.match(positions, /left\.placementLabel\.localeCompare\(right\.placementLabel\)/);

  assert.match(coverage, /placementAreaName\(row\.areaId\)/);
  assert.match(coverage, /placementPositionName\(row\.jobFunctionId\)/);
  assert.match(coverage, /a\.placementLabel\.localeCompare\(b\.placementLabel\)/);

  assert.match(areas, /areaDirectoryPlacement\.snapshotFor/);
  assert.match(areas, /resetAreaDirectoryPlacement\(\)/);
  assert.match(areas, /leftPlacement\.floorOrder - rightPlacement\.floorOrder/);
});
