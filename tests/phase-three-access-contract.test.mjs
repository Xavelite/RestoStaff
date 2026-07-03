import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/202606210020_email_first_access_lifecycle.sql';

test('Phase 3 makes invitations email-first and preserves lifecycle history', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /drop column profile_id/i);
  assert.match(sql, /accepted_by_profile_id/i);
  assert.match(sql, /revoked_by_profile_id/i);
  assert.match(sql, /revoked_reason/i);
  assert.match(sql, /on delete restrict/i);
  assert.match(sql, /employee_invitations_one_pending_employee_idx/i);
  assert.match(sql, /employee_invitations_one_pending_email_idx/i);
  assert.match(sql, /token_hash ~ '\^\[0-9a-f\]\{64\}\$'/i);
});

test('Phase 3 removes copied invitation state from durable access tables', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /drop column if exists temporary_access_expires_at/i);
  assert.match(sql, /drop column if exists must_change_password/i);
  assert.match(sql, /drop column if exists last_login_at/i);
  assert.match(sql, /access_status in \('active', 'disabled'\)/i);
  assert.match(sql, /status in \('active', 'disabled'\)/i);
  assert.match(sql, /employee_access_active_profile_check/i);
  assert.match(sql, /employee_access_one_profile_per_restaurant_idx/i);
});

test('Phase 3 acceptance proves email ownership before linking identity', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /auth\.jwt\(\)->>'email'/i);
  assert.match(
    sql,
    /lower\(v_invitation\.email::text\) <> lower\(v_auth_email::text\)/i
  );
  assert.match(sql, /insert into public\.profiles/i);
  assert.match(sql, /insert into public\.restaurant_memberships/i);
  assert.match(sql, /insert into public\.employee_access/i);
  assert.match(sql, /status = 'accepted'/i);
  assert.match(sql, /accepted_by_profile_id = v_profile\.id/i);
  assert.match(
    sql,
    /when restaurant_memberships\.role = 'owner' then 'owner'[\s\S]*when restaurant_memberships\.role = 'manager' then 'manager'/i
  );
});

test('Phase 3 removes profile-first compatibility routines', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(
    sql,
    /drop function if exists public\.link_invited_employee\(uuid,uuid,uuid,text,text\)/i
  );
  assert.match(
    sql,
    /drop function if exists public\.register_employee_invitation\(\s*uuid,uuid,uuid,citext,text,text,timestamptz\s*\)/i
  );
  assert.match(sql, /get_employee_invitation_context/i);
  assert.match(sql, /revoke_employee_invitation/i);
  assert.match(sql, /set_employee_access_state/i);
});

test('Team no longer bulk-writes profile linkage or access lifecycle state', async () => {
  const source = await readFile('src/lib/team/team-model.ts', 'utf8');
  const accessPayload = source.match(
    /const access = asJsonArray\(\s*drafts\.map\(\(employee\) => \(\{([\s\S]*?)\}\)\)\s*\);/
  );

  assert.ok(accessPayload, 'Team access payload must remain explicit');
  assert.doesNotMatch(accessPayload[1], /profile_id/);
  assert.doesNotMatch(accessPayload[1], /access_status/);
  assert.match(accessPayload[1], /badge_enabled/);
});
