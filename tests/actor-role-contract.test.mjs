import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/202606200013_canonical_actor_role.sql';

test('manager mutation audit roles come from active memberships', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /create or replace function public\.active_membership_role/i);
  assert.match(sql, /m\.status = 'active'/i);
  assert.match(sql, /m\.role in \('owner', 'manager'\)/i);
  assert.match(sql, /save_actuals_lifecycle/i);
  assert.match(sql, /save_schedule_exception_lifecycle/i);
  assert.match(sql, /save_manager_planning/i);
  assert.match(sql, /pg_get_functiondef/i);
  assert.match(sql, /replace\([\s\S]*'v_actor\.role'/i);
  assert.match(sql, /revoke all on function public\.active_membership_role/i);
});
