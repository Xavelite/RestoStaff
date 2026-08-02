import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('badge roster ignores cancelled and non-badge closed entries', async () => {
  const migration = await readFile(
    'supabase/migrations/20260802021556_badge_roster_activity_truth.sql',
    'utf8'
  );

  assert.match(migration, /t\.status <> 'cancelled'/);
  assert.match(migration, /t\.status = 'open'[\s\S]*t\.source = 'badge_terminal'/);
  assert.match(migration, /order by[\s\S]*\(t\.status = 'open'\) desc/);
});

test('paired station badge writes publish an actuals Realtime event', async () => {
  const migration = await readFile(
    'supabase/migrations/20260802022438_badge_station_realtime.sql',
    'utf8'
  );

  assert.match(migration, /'actuals-updated', 'badge'/);
  assert.match(migration, /record_badge_entry_station_v2[\s\S]*_publish_badge_actuals_event/);
  assert.match(migration, /record_badge_entry_station_legacy[\s\S]*_publish_badge_actuals_event/);
  assert.match(migration, /revoke all on function public\._publish_badge_actuals_event/);
});

test('badge roster shows the latest resume time without changing shift start', async () => {
  const migration = await readFile(
    'supabase/migrations/20260802022739_badge_roster_resume_time.sql',
    'utf8'
  );

  assert.match(migration, /select max\(b\.break_ended_at\)/);
  assert.match(migration, /b\.active/);
  assert.match(migration, /b\.evidence_kind = 'exact'/);
  assert.match(migration, /b\.source = 'badge_terminal'/);
  assert.match(migration, /t\.clock_in_at/);
});

test('badge break summary floors the combined exact evidence', async () => {
  const migration = await readFile(
    'supabase/migrations/20260802023207_exact_badge_break_total.sql',
    'utf8'
  );

  assert.match(migration, /sum\(b\.duration_seconds\)/);
  assert.match(migration, /b\.active/);
  assert.match(migration, /v_existing_seconds \+ greatest\(v_new_seconds, 0\)/);
  assert.match(migration, /before update of break_minutes, clock_out_at, status/);
});
