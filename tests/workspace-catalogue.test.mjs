import assert from 'node:assert/strict';
import test from 'node:test';

import {
  WORKSPACE_AREA_CATALOGUE,
  WORKSPACE_POSITION_CATALOGUE,
  starterWorkspaceAreas,
  starterWorkspacePositions,
  workspaceAreaByKey,
  workspacePositionByKey
} from '../src/lib/restaurant/workspace-catalogue.ts';

test('workspace area catalogue has stable unique identities and valid visual metadata', () => {
  assert.ok(WORKSPACE_AREA_CATALOGUE.length >= 20);
  assert.equal(
    new Set(WORKSPACE_AREA_CATALOGUE.map((item) => item.key)).size,
    WORKSPACE_AREA_CATALOGUE.length
  );
  assert.equal(
    new Set(WORKSPACE_AREA_CATALOGUE.map((item) => item.label.toLowerCase())).size,
    WORKSPACE_AREA_CATALOGUE.length
  );
  for (const item of WORKSPACE_AREA_CATALOGUE) {
    assert.match(item.key, /^[a-z][a-z0-9_]*$/);
    assert.match(item.color, /^#[0-9a-f]{6}$/i);
    assert.ok(item.icon);
    assert.equal(workspaceAreaByKey.get(item.key), item);
  }
});

test('workspace position catalogue only links to known areas', () => {
  assert.ok(WORKSPACE_POSITION_CATALOGUE.length >= 30);
  assert.equal(
    new Set(WORKSPACE_POSITION_CATALOGUE.map((item) => item.key)).size,
    WORKSPACE_POSITION_CATALOGUE.length
  );
  for (const item of WORKSPACE_POSITION_CATALOGUE) {
    assert.match(item.key, /^[a-z][a-z0-9_]*$/);
    assert.equal(workspacePositionByKey.get(item.key), item);
    for (const areaKey of item.areaKeys) {
      assert.ok(workspaceAreaByKey.has(areaKey), `${item.key} references ${areaKey}`);
    }
  }
});

test('starter workspace is useful without becoming the whole catalogue', () => {
  const areas = starterWorkspaceAreas();
  const positions = starterWorkspacePositions(areas.map((area) => area.key));
  assert.deepEqual(
    areas.map((area) => area.key),
    ['dining_room', 'bar', 'kitchen', 'dishwashing']
  );
  assert.deepEqual(
    positions.map((position) => position.key),
    ['restaurant_manager', 'waiter', 'bartender', 'cook', 'dishwasher']
  );
  assert.ok(areas.length < WORKSPACE_AREA_CATALOGUE.length);
  assert.ok(positions.length < WORKSPACE_POSITION_CATALOGUE.length);
});
