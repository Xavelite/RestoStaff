import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  WORKSPACE_AREA_CATALOGUE,
  WORKSPACE_POSITION_CATALOGUE,
  starterWorkspaceAreas,
  starterWorkspacePositions,
  workspaceAreaByKey,
  workspacePositionByKey
} from '../src/lib/restaurant/workspace-catalogue.ts';
import { buildPositionColorMap } from '../src/lib/ui/position-color.ts';

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

test('areas are modern colour anchors and positions inherit a lighter tint', () => {
  assert.equal(workspaceAreaByKey.get('dining_room')?.color, '#f97316');
  assert.equal(workspaceAreaByKey.get('bar')?.color, '#3b82f6');
  assert.equal(workspaceAreaByKey.get('kitchen')?.color, '#f43f5e');
  assert.equal(workspaceAreaByKey.get('dishwashing')?.color, '#14b8a6');

  const colors = buildPositionColorMap(
    [
      {
        id: 'waiter',
        name: 'Waiter',
        primaryAreaId: 'dining',
        areaIds: ['dining']
      }
    ],
    [{ id: 'dining', name: 'Dining room', color: '#f97316' }]
  );
  assert.equal(colors.get('waiter'), '#fa8f45');
  assert.notEqual(colors.get('waiter'), '#f97316');
});

test('position catalogue creation uses the shared accessible picker without hiding system roles', async () => {
  const [picker, positions] = await Promise.all([
    readFile('src/lib/restaurant/WorkspaceCataloguePicker.svelte', 'utf8'),
    readFile('src/routes/(app)/restaurant/positions/+page.svelte', 'utf8')
  ]);

  assert.match(picker, /role="combobox"/);
  assert.match(picker, /role="listbox"/);
  assert.match(picker, /aria-activedescendant=/);
  assert.match(picker, /event\.key === 'ArrowDown'/);
  assert.match(picker, /event\.key === 'Escape'/);
  assert.match(picker, /oncustom:/);
  assert.match(positions, /<WorkspaceCataloguePicker/);
  assert.match(positions, /WORKSPACE_POSITION_CATALOGUE\.map/);
  assert.match(positions, /candidate\.id !== position\.id && candidate\.catalogueKey/);
  assert.match(positions, /disabledReason:/);
  assert.match(positions, /position\.catalogueKey = match\.key/);
  assert.match(positions, /position\.catalogueKey = ''/);
  assert.doesNotMatch(positions, /<datalist/);
  assert.doesNotMatch(positions, /availableCataloguePositions/);
});
