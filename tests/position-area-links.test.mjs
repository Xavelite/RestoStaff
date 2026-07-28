import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260727170604_floor_aware_area_labels_and_position_links.sql';
const preferenceMigrationPath =
  'supabase/migrations/20260727174708_reconcile_position_area_preferences.sql';

test('physical area labels use one shared floor-aware database contract', async () => {
  const migration = await readFile(migrationPath, 'utf8');

  assert.match(
    migration,
    /create or replace function public\.reservation_area_instance_label/
  );
  assert.match(
    migration,
    /row_number\(\) over \(\s*order by peer\.instance_number, peer\.id\s*\)/i
  );
  assert.match(migration, /peer\.floor_level = target\.floor_level/);
  assert.match(
    migration,
    /when coalesce\(current_peer\.floor_count, 1\) <= 1[\s\S]*'%s \(%s\)'/
  );
  assert.match(
    migration,
    /reservation_public_context\(text,text\)[\s\S]*reservation_area_instance_label/
  );
});

test('position linked areas delta-sync without transiently deleting preferences', async () => {
  const migration = await readFile(migrationPath, 'utf8');
  const replacement = migration.match(
    /v_new_relations text := \$new_relations\$([\s\S]*?)\$new_relations\$;/
  )?.[1];

  assert.ok(replacement, 'Expected the canonical relation replacement body');
  assert.doesNotMatch(replacement, /delete from public\.job_function_areas/i);
  assert.match(replacement, /position\.value->'area_ids'/);
  assert.match(
    replacement,
    /when jsonb_typeof\(position\.value->'metadata'->'area_ids'\) = 'array'/
  );
  assert.match(replacement, /on conflict \(restaurant_id, job_function_id, area_id\)/);
  assert.match(replacement, /set active = false,\s*is_primary = false/i);
  assert.match(
    migration,
    /create constraint trigger job_function_areas_clear_employee_defaults[\s\S]*deferrable initially deferred/i
  );
  assert.match(
    migration,
    /coalesce\(v_item->'metadata', '\{\}'\) - 'area_id' - 'area_ids'/
  );
});

test('final position links reconcile every preferred employee area', async () => {
  const migration = await readFile(preferenceMigrationPath, 'utf8');

  assert.match(
    migration,
    /create constraint trigger job_function_areas_clear_employee_defaults[\s\S]*after insert or update or delete[\s\S]*deferrable initially deferred/i
  );
  assert.match(
    migration,
    /assignment\.default_area_id is not null[\s\S]*exists \([\s\S]*relation\.active[\s\S]*not exists \([\s\S]*relation\.area_id = assignment\.default_area_id/i
  );
  assert.doesNotMatch(
    migration,
    /assignment\.default_area_id = (?:old\.area_id|v_area_id)/i
  );
});

test('Positions exposes linked areas and sends them as a top-level relation set', async () => {
  const [model, positions, field] = await Promise.all([
    readFile('src/lib/restaurant/restaurant-model.ts', 'utf8'),
    readFile('src/routes/(app)/restaurant/positions/+page.svelte', 'utf8'),
    readFile('src/lib/restaurant/PositionLinkedAreasField.svelte', 'utf8')
  ]);

  assert.match(model, /area_ids: areaIds/);
  assert.doesNotMatch(model, /area_id: nullable\(primaryAreaId\)/);
  assert.match(
    positions,
    /<ClassicColMenu[\s\S]*label=\{t\('Linked areas'\)\}/
  );
  assert.match(positions, /<PositionLinkedAreasField/);
  assert.doesNotMatch(positions, /Primary area/);
  assert.match(field, /aria-multiselectable="true"/);
  assert.match(field, /type="search"/);
  assert.match(field, /recommendedIds/);
  assert.doesNotMatch(field, /type="radio"/);
});

test('empty position links mean all active areas everywhere', async () => {
  const [positions, field, coverage, team, schedule] = await Promise.all([
    readFile('src/routes/(app)/restaurant/positions/+page.svelte', 'utf8'),
    readFile('src/lib/restaurant/PositionLinkedAreasField.svelte', 'utf8'),
    readFile('src/routes/(app)/restaurant/coverage/+page.svelte', 'utf8'),
    readFile('src/routes/(app)/team/+page.svelte', 'utf8'),
    readFile('src/routes/(app)/schedule/+page.svelte', 'utf8')
  ]);

  assert.match(positions, /if \(!areaIds\.length\) return t\('All areas'\)/);
  assert.match(
    positions,
    /const areaIds = match\.areaKeys\.length[\s\S]*:\s*\[\]/
  );
  assert.match(field, /selected\.length[\s\S]*t\('All areas'\)/);
  assert.match(field, /onclick=\{\(\) => onchange\(\[\]\)\}[\s\S]*t\('All areas'\)/);
  assert.match(
    coverage,
    /return linkedAreaIds\.length \? linkedAreaIds : \[\.\.\.activeAreaIds\]/
  );
  assert.match(coverage, /positionSupportsArea\(job, row\.areaId\)/);
  assert.match(
    team,
    /if \(positionId && !linkedAreas\.length\)[\s\S]*t\('All areas'\)/
  );
  assert.match(
    team,
    /preferredArea && \(!linkedAreas\.length \|\| linkedAreaIds\.has\(preferredArea\.id\)\)/
  );
  assert.match(
    schedule,
    /function preferredAreaIsEligible[\s\S]*!linkedAreas\.length \|\|[\s\S]*linkedAreas\.some/
  );
});

test('linked-area popup exposes one coherent keyboard and ARIA contract', async () => {
  const field = await readFile(
    'src/lib/restaurant/PositionLinkedAreasField.svelte',
    'utf8'
  );

  assert.match(field, /aria-haspopup="dialog"/);
  assert.doesNotMatch(field, /aria-haspopup="listbox"/);
  assert.match(field, /role="dialog"/);
  assert.match(field, /aria-label=\{t\('Search areas'\)\}/);
  assert.match(field, /onfocusout=\{handleFocusout\}/);
  assert.match(field, /disabled=\{interactionDisabled\}/);
});

test('Positions keeps every pending row and gives Linked areas the shared column menu', async () => {
  const positions = await readFile(
    'src/routes/(app)/restaurant/positions/+page.svelte',
    'utf8'
  );

  assert.doesNotMatch(positions, /let newPositionId = \$state/);
  assert.match(
    positions,
    /draft\.jobFunctions = \[position, \.\.\.draft\.jobFunctions\]/
  );
  assert.match(
    positions,
    /if \(!persistedPositionIds\.has\(position\.id\)\) return true/
  );
  assert.match(
    positions,
    /class:is-new=\{!persistedPositionIds\.has\(position\.id\)\}/
  );
  assert.match(
    positions,
    /canSave=\{context\.canSave && rows\.every\(\(position\) => position\.name\.trim\(\)\)\}/
  );
  // Adding a position focuses the new row's field without opening the
  // catalogue over it — the same welcome every grid gives a new row.
  assert.doesNotMatch(positions, /autoOpen/);
  assert.match(
    positions,
    /document\.getElementById\(`position-catalogue-\$\{id\}`\)\?\.focus\(\)/
  );
  assert.match(
    positions,
    /<ClassicColMenu[\s\S]*label=\{t\('Linked areas'\)\}[\s\S]*sortDir=\{view\.sortDir\('areas'\)\}[\s\S]*searchValue=\{view\.search\('areas'\)\}/
  );
  assert.match(
    positions,
    /case 'areas': return linkedAreaSetLabel\(linkedPositionAreaIds\(stable\)\)\.toLowerCase\(\)/
  );
});
