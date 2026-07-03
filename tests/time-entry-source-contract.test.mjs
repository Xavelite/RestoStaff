import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/202606200014_canonical_time_entry_source.sql';

test('time-entry origins are canonical without rewriting history', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /badge_terminal/i);
  assert.match(sql, /manager_manual/i);
  assert.match(sql, /select distinct t\.source/i);
  assert.match(sql, /drop constraint if exists time_entries_source_check/i);
  assert.match(sql, /add constraint time_entries_source_check/i);
  assert.match(sql, /pg_get_functiondef/i);
  assert.match(sql, /'manager_manual'', v_new_status/i);
  assert.doesNotMatch(
    sql,
    /update public\.time_entries[\s\S]*set source/i,
    'historical origin values must remain immutable'
  );
});
