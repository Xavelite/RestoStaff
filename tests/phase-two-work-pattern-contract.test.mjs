import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/202606210019_canonical_work_pattern_model.sql';

test('phase two separates availability from recurring schedule truth', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  assert.match(sql, /rename to recurring_schedule_slots/i);
  assert.match(sql, /drop column availability_state/i);
  assert.match(sql, /p_recurring_schedule_slots/i);
  assert.match(sql, /recurring_schedule_slots_regime_guard/i);
});

test('phase two gives fixed-schedule deviations one canonical owner', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  assert.match(sql, /rename to work_pattern_exceptions/i);
  assert.match(sql, /rename to work_pattern_exception_events/i);
  assert.match(sql, /save_work_pattern_exception_lifecycle/i);
  assert.match(sql, /drop function public\.save_schedule_exception_lifecycle/i);
  assert.doesNotMatch(sql, /create (?:or replace )?view/i);
});

test('phase two rewrites read, mutation and approval boundaries transactionally', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  assert.match(sql, /build_workspace_runtime_snapshot_v2/i);
  assert.match(sql, /guard_actuals_approval/i);
  assert.match(sql, /save_team_model/i);
  assert.match(sql, /begin;[\s\S]*commit;/i);
});
