import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/202606210021_operational_lifecycle_integrity.sql';
const followUpPath =
  'supabase/migrations/202606210022_routine_lint_integrity.sql';

test('Phase 4 introduces explicit Planning, Actuals and entry revisions', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /add column planning_revision bigint not null default 0/i);
  assert.match(sql, /add column actuals_revision bigint not null default 0/i);
  assert.match(sql, /add column revision bigint not null default 1/i);
  assert.match(sql, /advance_time_entry_revision/i);
  assert.match(sql, /actuals_revision = public\.work_weeks\.actuals_revision \+ 1/i);
  assert.match(sql, /p_expected_revision bigint/i);
  assert.match(sql, /v_entry\.revision <> v_expected_revision/i);
});

test('Phase 4 makes published Planning immutable and server-authoritative', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /Revert the published plan to draft before changing it/i);
  assert.match(sql, /planning_publish_issues/i);
  assert.match(sql, /status in \('pending', 'approved'\)/i);
  assert.match(sql, /availability_state = 'unavailable'/i);
  assert.match(sql, /coverage_gap/i);
  assert.match(sql, /Resolve planning conflicts and coverage gaps before publishing/i);
  assert.match(sql, /on conflict \(\s*restaurant_id, week_start, employee_id, weekday, service_key\s*\) do update/i);
});

test('Phase 4 snapshots lifecycle truth into append-only audit evidence', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /planning_snapshot_for_week/i);
  assert.match(sql, /actuals_snapshot_for_week/i);
  assert.match(sql, /planning_revision.*planning.*v_new_snapshot/is);
  assert.match(sql, /actuals_revision.*actuals.*v_actuals_snapshot/is);
  assert.match(sql, /work_week_events_append_only/i);
  assert.match(sql, /time_entry_adjustments_append_only/i);
  assert.match(sql, /is append-only operational evidence/i);
});

test('Phase 4 prevents deletion from erasing operational history', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /Time entries are historical evidence and cannot be deleted/i);
  assert.match(sql, /planned_shifts_week_fk[\s\S]*on delete restrict/i);
  assert.match(sql, /work_week_events_week_fk[\s\S]*on delete restrict/i);
  assert.match(sql, /time_entries_employee_fk[\s\S]*on delete restrict/i);
  assert.match(sql, /time_entry_adjustments_employee_fk[\s\S]*on delete restrict/i);
});

test('Phase 4 Actuals approval closes incomplete and unaudited periods', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /Actuals can be approved only after the week has ended/i);
  assert.match(sql, /Publish or remove the draft plan before approving Actuals/i);
  assert.match(sql, /Resolve live badges before approving Actuals/i);
  assert.match(sql, /Resolve missing badges before approving Actuals/i);
  assert.match(sql, /Resolve worked-time conflicts before approving Actuals/i);
  assert.match(sql, /Resolve missing time-entry audit evidence before approving Actuals/i);
});

test('Phase 4 leaves canonical routines type-safe and lint-clean', async () => {
  const migration = await readFile(migrationPath, 'utf8');
  const followUp = await readFile(followUpPath, 'utf8');

  assert.match(migration, /'open'::public\.time_entry_status/i);
  assert.match(migration, /'adjusted'::public\.time_entry_status/i);
  assert.match(followUp, /Actuals status assignment contract drifted/i);
  assert.match(followUp, /Availability range lint contract drifted/i);
  assert.match(followUp, /Team authorization lint contract drifted/i);
});
