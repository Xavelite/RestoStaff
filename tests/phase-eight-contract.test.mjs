import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/202606190003_onboarding_invitation_account_hardening.sql';
const functionPath = 'supabase/functions/send-employee-invitation/index.ts';
const proofFunctionPath = 'supabase/functions/upload-badge-proof/index.ts';
const proofViewFunctionPath = 'supabase/functions/get-badge-proof/index.ts';

test('phase-eight migration enforces expiring one-use invitations', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  assert.match(sql, /create table public\.employee_invitations/i);
  assert.match(sql, /status = 'accepted'/i);
  assert.match(sql, /expires_at > now\(\)/i);
  assert.match(sql, /digest\(p_invitation_token, 'sha256'\)/i);
  assert.match(sql, /revoke all on function public\.accept_employee_invite\(uuid,text\)/i);
  assert.match(sql, /grant execute on function public\.accept_employee_invite_v2/i);
  assert.match(
    sql,
    /when restaurant_memberships\.role = 'owner' then 'owner'/i,
    'accepting an employee invitation must never demote an existing owner'
  );
});

test('membership integrity migration repairs only ownerless email-matched workspaces', async () => {
  const sql = await readFile(
    'supabase/migrations/202606190004_membership_integrity.sql',
    'utf8'
  );
  assert.match(sql, /not exists[\s\S]*role = 'owner'[\s\S]*status = 'active'/i);
  assert.match(sql, /lower\(p\.email::text\) = lower\(r\.email::text\)/i);
  assert.match(sql, /having count\(distinct p\.id\) = 1/i);
  assert.match(sql, /when restaurant_memberships\.role = 'owner' then 'owner'/i);
});

test('obsolete mutation surfaces and unused payroll snapshots are removed explicitly', async () => {
  const sql = await readFile(
    'supabase/migrations/202606190005_remove_obsolete_surfaces.sql',
    'utf8'
  );
  assert.match(sql, /drop function if exists public\.save_restaurant_setup/i);
  assert.match(sql, /drop function if exists public\.save_team_setup/i);
  assert.match(sql, /drop function if exists public\.save_manager_planning/i);
  assert.match(sql, /drop function if exists public\.setup_owner_workspace/i);
  assert.match(sql, /drop table if exists public\.payroll_period_lines/i);
  assert.match(sql, /drop table if exists public\.payroll_periods/i);
});

test('restaurant-native migration preserves existing RPC input parameter names', async () => {
  const sql = await readFile(
    'supabase/migrations/202606190002_restaurant_native_model.sql',
    'utf8'
  );
  assert.match(
    sql,
    /build_workspace_runtime_snapshot_for_role\(\s*p_restaurant_id uuid,\s*p_actor_role text default 'employee'/i
  );
  assert.doesNotMatch(
    sql,
    /build_workspace_runtime_snapshot_for_role\(\s*p_restaurant_id uuid,\s*p_role text/i
  );
});

test('zone-to-area conversion uses an explicit procedural source row', async () => {
  const sql = await readFile(
    'supabase/migrations/202606190002_restaurant_native_model.sql',
    'utf8'
  );
  assert.match(sql, /v_zone public\.zones%rowtype/i);
  assert.match(sql, /for v_zone in select \* from public\.zones loop/i);
  assert.match(sql, /values \(\s*v_zone\.id,\s*v_zone\.restaurant_id/i);
  assert.doesNotMatch(sql, /select\s+z\.id,[\s\S]*from public\.zones z/i);
});

test('invitation function is email-first and never exposes service credentials', async () => {
  const source = await readFile(functionPath, 'utf8');
  assert.match(source, /crypto\.randomUUID\(\)/);
  assert.match(source, /register_employee_invitation/);
  assert.match(source, /7 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(source, /signInWithOtp/);
  assert.match(source, /shouldCreateUser:\s*true/);
  assert.match(source, /revoke_employee_invitation_delivery/);
  assert.doesNotMatch(source, /listUsers/);
  assert.doesNotMatch(source, /link_invited_employee/);
  assert.doesNotMatch(source, /\.from\('profiles'\)/);
  assert.doesNotMatch(source, /response\(origin,\s*\{[^}]*service(?:Key|Role)/s);
});

test('owner onboarding has both server persistence and explicit cleanup', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  assert.match(sql, /create table public\.owner_onboarding_drafts/i);
  assert.match(sql, /save_owner_onboarding_draft/i);
  assert.match(sql, /clear_owner_onboarding_draft/i);
  assert.match(sql, /references auth\.users\(id\) on delete cascade/i);
});

test('owner workspace setup writes the mandatory owner of record', async () => {
  const sql = await readFile(
    'supabase/migrations/202607030001_fix_owner_workspace_owner_profile_id.sql',
    'utf8'
  );
  assert.match(sql, /create or replace function public\.setup_owner_workspace/i);
  assert.match(
    sql,
    /workspace_slug,\s*name,\s*legal_name,\s*city,\s*email,\s*country_code,\s*owner_profile_id/i
  );
  assert.match(sql, /p_owner_email,\s*'BE',\s*v_profile_id/i);
  assert.match(
    sql,
    /grant execute on function public\.setup_owner_workspace\(\s*text,text,citext,text,text,jsonb,jsonb,jsonb,jsonb,jsonb\s*\) to authenticated/i
  );
});

test('owner workspace starter employees use the canonical disabled access state', async () => {
  const sql = await readFile(
    'supabase/migrations/202607030002_fix_owner_workspace_employee_access_default.sql',
    'utf8'
  );
  assert.match(sql, /setup_owner_workspace\(text,text,citext,text,text,jsonb,jsonb,jsonb,jsonb,jsonb\)/i);
  assert.match(sql, /replace\(v_definition,\s*'''not_invited''',\s*'''disabled'''\)/i);
  assert.doesNotMatch(sql, /access_status in \('active', 'disabled', 'not_invited'\)/i);
});

test('owner workspace setup does not read restaurants to allocate a slug', async () => {
  const sql = await readFile(
    'supabase/migrations/202607030005_remove_owner_setup_slug_table_read.sql',
    'utf8'
  );
  assert.match(sql, /Owner setup slug contract drifted/i);
  assert.match(sql, /gen_random_uuid\(\)::text/i);
  assert.match(sql, /replace\(\s*v_definition,\s*'public\.unique_workspace_slug\(p_restaurant_name\),'/i);
});

test('owner workspace setup gives the owner an owner position', async () => {
  const sql = await readFile(
    'supabase/migrations/202607030008_owner_setup_owner_position.sql',
    'utf8'
  );
  assert.match(sql, /v_owner_job_id/i);
  assert.match(sql, /values \(v_restaurant_id, ''owner'', ''Owner'', 0\)/i);
  assert.match(sql, /v_job_id := v_owner_job_id/i);
});

test('badge proof capture is private and requires a live verified challenge', async () => {
  const [sql, source] = await Promise.all([
    readFile(migrationPath, 'utf8'),
    readFile(proofFunctionPath, 'utf8')
  ]);
  assert.match(sql, /'badge-proofs',\s*'badge-proofs',\s*false/i);
  assert.match(source, /badge_verification_challenges/);
  assert.match(source, /\.is\('used_at', null\)/);
  assert.match(source, /\.gt\('expires_at'/);
  assert.match(source, /file\.size > 5_242_880/);
});

test('badge proof viewing is role-gated and uses a short-lived signed URL', async () => {
  const source = await readFile(proofViewFunctionPath, 'utf8');
  assert.match(source, /get_current_memberships/);
  assert.match(source, /\['owner', 'manager'\]/);
  assert.match(source, /\.eq\('restaurant_id', restaurantId\)/);
  assert.match(source, /\.from\('badge-proofs'\)/);
  assert.match(source, /\.createSignedUrl\(path, 60\)/);
  assert.doesNotMatch(source, /getPublicUrl/);
});
