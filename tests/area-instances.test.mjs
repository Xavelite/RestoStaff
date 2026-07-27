import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  areaInstanceLabelMap,
  areaInstanceLabel,
  areaInstanceLetter,
  areaInstanceRowLabel,
  nextAreaInstanceNumber,
  uniqueAreaTechnicalCode
} from '../src/lib/restaurant/area-instance.ts';

const barA = {
  id: 'bar-a',
  name: 'Bar',
  active: true,
  catalogueKey: 'bar',
  instanceNumber: 1,
  floorLevel: 0
};
const barB = {
  id: 'bar-b',
  name: 'Bar',
  active: true,
  catalogueKey: 'bar',
  instanceNumber: 2,
  floorLevel: 2
};

test('area instance labels stay quiet until a type has several active locations', () => {
  assert.equal(areaInstanceLabel(barA, [barA]), 'Bar');
  assert.equal(areaInstanceLabel(barA, [barA, barB]), 'Bar (0)');
  assert.equal(areaInstanceLabel(barB, [barA, barB]), 'Bar (+2)');
  assert.equal(areaInstanceLetter(26), 'Z');
  assert.equal(areaInstanceLetter(27), 'AA');
});

test('letters are scoped to matching areas on the same floor', () => {
  const barC = {
    ...barB,
    id: 'bar-c',
    instanceNumber: 3,
    floorLevel: 0
  };
  const barD = {
    ...barB,
    id: 'bar-d',
    instanceNumber: 4,
    floorLevel: 2
  };
  const areas = [barA, barB, barC, barD];

  assert.equal(areaInstanceLabel(barA, areas), 'Bar (0.A)');
  assert.equal(areaInstanceLabel(barC, areas), 'Bar (0.B)');
  assert.equal(areaInstanceLabel(barB, areas), 'Bar (+2.A)');
  assert.equal(areaInstanceLabel(barD, areas), 'Bar (+2.B)');
});

test('a floor move immediately replaces the previous floor-local letter', () => {
  const previousBarB = { ...barB, floorLevel: 0 };
  const movedBarB = { ...barB, floorLevel: 1 };

  assert.equal(areaInstanceLabel(barA, [barA, previousBarB]), 'Bar (0.A)');
  assert.equal(
    areaInstanceLabel(movedBarB, [barA, previousBarB]),
    'Bar (+1)'
  );
});

test('same-floor letters use stable instance number and id ordering', () => {
  const laterInsertedFirst = {
    ...barA,
    id: 'bar-z',
    instanceNumber: 8
  };
  const earlierInsertedSecond = {
    ...barA,
    id: 'bar-a',
    instanceNumber: 3
  };
  const sameOrdinalTie = {
    ...barA,
    id: 'bar-b',
    instanceNumber: 3
  };
  const shuffled = [laterInsertedFirst, sameOrdinalTie, earlierInsertedSecond];

  assert.equal(areaInstanceLabel(earlierInsertedSecond, shuffled), 'Bar (0.A)');
  assert.equal(areaInstanceLabel(sameOrdinalTie, shuffled), 'Bar (0.B)');
  assert.equal(areaInstanceLabel(laterInsertedFirst, shuffled), 'Bar (0.C)');
});

test('custom area identity matches the database workspace slug contract', () => {
  const patioA = {
    id: 'patio-a',
    name: 'Patio',
    active: true,
    catalogueKey: '',
    instanceNumber: 1,
    floorLevel: 0
  };
  const patioB = {
    id: 'patio-b',
    name: 'P\u00e1tio',
    active: true,
    catalogueKey: '',
    instanceNumber: 2,
    floorLevel: -1
  };

  assert.equal(areaInstanceLabel(patioA, [patioA, patioB]), 'Patio');
  assert.equal(areaInstanceLabel(patioB, [patioA, patioB]), 'P\u00e1tio');
  assert.equal(nextAreaInstanceNumber('', [patioA], '', 'Patio'), 2);
  assert.equal(nextAreaInstanceNumber('', [patioA], '', 'P\u00e1tio'), 1);
});

test('row labels support database and editable draft shapes without changing base names', () => {
  const databaseRows = [
    {
      id: 'bar-a',
      name: 'Bar',
      active: true,
      catalogue_key: 'bar',
      instance_number: 1,
      floor_level: 0
    },
    {
      id: 'bar-b',
      name: 'Bar',
      active: true,
      catalogue_key: 'bar',
      instance_number: 2,
      floor_level: 2
    }
  ];
  const draftRows = databaseRows.map((area) => ({
    id: area.id,
    name: area.name,
    active: area.active,
    catalogueKey: area.catalogue_key,
    instanceNumber: area.instance_number,
    floorLevel: area.floor_level
  }));

  assert.equal(areaInstanceRowLabel(databaseRows[0], databaseRows), 'Bar (0)');
  assert.equal(areaInstanceRowLabel(draftRows[1], draftRows), 'Bar (+2)');
  assert.deepEqual(
    [...areaInstanceLabelMap(databaseRows)],
    [
      ['bar-a', 'Bar (0)'],
      ['bar-b', 'Bar (+2)']
    ]
  );
  assert.deepEqual(
    databaseRows.map((area) => area.name),
    ['Bar', 'Bar']
  );
});

test('area instance numbers never reuse an archived ordinal', () => {
  assert.equal(
    nextAreaInstanceNumber('bar', [
      barA,
      { ...barB, active: false }
    ]),
    3
  );
});

test('duplicate area names receive stable unique technical codes', () => {
  assert.equal(
    uniqueAreaTechnicalCode('Bar', '12345678-1234-1234-1234-123456789abc'),
    'bar-12345678'
  );
  assert.equal(
    uniqueAreaTechnicalCode('Bar', '87654321-1234-1234-1234-123456789abc'),
    'bar-87654321'
  );
});

test('area instance schema and restaurant save model preserve canonical types', async () => {
  const [migration, operatorLabelsMigration, model, positions] = await Promise.all([
    readFile('supabase/migrations/20260727150000_area_instances.sql', 'utf8'),
    readFile(
      'supabase/migrations/20260727153612_reservation_operator_area_instance_labels.sql',
      'utf8'
    ),
    readFile('src/lib/restaurant/restaurant-model.ts', 'utf8'),
    readFile('src/routes/(app)/restaurant/positions/+page.svelte', 'utf8')
  ]);

  assert.match(migration, /add column instance_number integer/i);
  assert.match(
    migration,
    /unique index work_areas_restaurant_type_instance_idx/i
  );
  assert.match(migration, /assign_work_area_instance_number/);
  assert.match(migration, /'custom:' \|\| public\.slugify_workspace\(name\)/);
  assert.match(
    operatorLabelsMigration,
    /create or replace function public\.reservation_area_instance_label/
  );
  assert.match(
    operatorLabelsMigration,
    /'public\.get_reservation_workspace\(uuid,date\)'::regprocedure/
  );
  assert.match(
    operatorLabelsMigration,
    /'public\.get_reservation_setup\(uuid\)'::regprocedure/
  );
  assert.match(
    operatorLabelsMigration,
    /when coalesce\(floor\.level, area\.floor_level, 0\) > 0[\s\S]*then '\+' \|\|/
  );
  assert.match(
    operatorLabelsMigration,
    /revoke all on function public\.reservation_area_instance_label\(uuid,uuid,uuid\)[\s\S]*from public, anon, authenticated, service_role/
  );
  assert.match(model, /instance_number:/);
  assert.match(model, /uniqueAreaTechnicalCode\(item\.name, item\.id\)/);
  assert.match(model, /const areaIds = \[\.\.\.new Set\(item\.areaIds\)\]/);
  assert.match(model, /area_ids: areaIds/);
  assert.doesNotMatch(model, /primaryAreaId/);
  assert.doesNotMatch(model, /compatibleAreaIds/);
  assert.match(positions, /function typePositionName\(/);
});
