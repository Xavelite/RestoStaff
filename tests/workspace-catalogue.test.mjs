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
import {
  buildPositionColorMap,
  positionAreaVisualIdentity
} from '../src/lib/ui/position-color.ts';

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
        areaIds: ['dining']
      }
    ],
    [{ id: 'dining', name: 'Dining room', color: '#f97316' }]
  );
  assert.equal(colors.get('waiter'), '#fa8f45');
  assert.notEqual(colors.get('waiter'), '#f97316');
});

test('position colours use canonical links without primary flags or legacy metadata', () => {
  const areas = [
    { id: 'bar', name: 'Bar', color: '#3b82f6', sort_order: 0 },
    { id: 'dining', name: 'Dining room', color: '#f97316', sort_order: 1 }
  ];
  const positions = [
    {
      id: 'floating-role',
      name: 'Floating role',
      metadata: { area_id: 'dining', area_ids: ['dining'] }
    }
  ];
  const colors = buildPositionColorMap(positions, areas, [
    {
      job_function_id: 'floating-role',
      area_id: 'dining',
      active: true,
      is_primary: true
    },
    {
      job_function_id: 'floating-role',
      area_id: 'bar',
      active: true,
      is_primary: false
    }
  ]);

  assert.equal(colors.get('floating-role'), '#629bf8');
  assert.equal(
    buildPositionColorMap(positions, areas).get('floating-role'),
    '#60a5fa'
  );
});

test('position area icons stay shared for duplicate locations and neutral for mixed areas', () => {
  const areas = [
    {
      id: 'bar-ground',
      name: 'Bar',
      catalogue_key: 'bar',
      color: '#3b82f6',
      sort_order: 0,
      active: true
    },
    {
      id: 'bar-upstairs',
      name: 'Bar',
      catalogue_key: 'bar',
      color: '#3b82f6',
      sort_order: 1,
      active: true
    },
    {
      id: 'dining',
      name: 'Dining room',
      catalogue_key: 'dining_room',
      color: '#f97316',
      sort_order: 2,
      active: true
    }
  ];
  const duplicateBars = [
    { job_function_id: 'bartender', area_id: 'bar-upstairs', active: true },
    { job_function_id: 'bartender', area_id: 'bar-ground', active: true }
  ];
  const mixedAreas = [
    ...duplicateBars,
    { job_function_id: 'bartender', area_id: 'dining', active: true }
  ];

  assert.deepEqual(
    positionAreaVisualIdentity('bartender', areas, duplicateBars),
    { areaId: 'bar-ground', icon: 'bar', color: '#3b82f6' }
  );
  // Mixed areas share no single look, so the position falls back to a neutral
  // glyph rather than nothing — no row is left showing a bare colour bar.
  assert.deepEqual(
    positionAreaVisualIdentity('bartender', areas, mixedAreas),
    { areaId: '', icon: '', color: 'var(--cl-muted)' }
  );
});

test('position catalogue creation uses the shared accessible picker without hiding system roles', async () => {
  const [picker, positions, linkedAreas] = await Promise.all([
    readFile('src/lib/restaurant/WorkspaceCataloguePicker.svelte', 'utf8'),
    readFile('src/routes/(app)/restaurant/positions/+page.svelte', 'utf8'),
    readFile('src/lib/restaurant/PositionLinkedAreasField.svelte', 'utf8')
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
  assert.match(linkedAreas, /role="listbox"/);
  assert.match(linkedAreas, /aria-multiselectable="true"/);
  assert.match(linkedAreas, /type="search"/);
  assert.match(linkedAreas, /event\.key === 'Escape'/);
  assert.match(linkedAreas, /recommendedIds/);
  assert.doesNotMatch(linkedAreas, /type="radio"/);
});
