import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/202606200012_canonical_actuals_lifecycle.sql';

test('Actuals lifecycle is reproducible, transactional and audit preserving', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /create or replace function public\.save_actuals_lifecycle/i);
  assert.match(sql, /from public\.require_owner_or_manager_context/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /expected_updated_at/i);
  assert.match(sql, /CONFLICT: This time entry changed/i);
  assert.match(sql, /break_minutes/i);
  assert.match(sql, /Break must be shorter than the worked interval/i);
  assert.match(sql, /insert into public\.time_entry_adjustments/i);
  assert.match(sql, /insert into public\.work_week_events/i);
  assert.match(sql, /actuals_approved/i);
  assert.match(sql, /actuals_reopened/i);
  assert.match(
    sql,
    /grant execute on function public\.save_actuals_lifecycle\(uuid, text, jsonb\)[\s\S]*to authenticated/i
  );
  assert.doesNotMatch(
    sql,
    /delete from public\.time_entries/i,
    'worked-time history must never be deleted by the lifecycle'
  );
  assert.doesNotMatch(
    sql,
    /to_jsonb\(v_(entry|after)\)/i,
    'audit JSON must not duplicate private proof-storage fields'
  );

  const delimiters = [...sql.matchAll(/as \$([a-z0-9_]+)\$/gi)];
  assert.equal(delimiters.length, 1);
  assert.match(sql, new RegExp(`\\$${delimiters[0][1]}\\$;`, 'i'));
});
