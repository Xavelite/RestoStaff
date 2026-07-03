import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/202606200015_phase0_security_contract.sql';
const verificationPath = 'supabase/tests/canonical_schema_security.sql';

test('phase zero restores the one-use badge challenge boundary', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  assert.match(sql, /create table public\.badge_verification_challenges/i);
  assert.match(sql, /token_hash text not null unique/i);
  assert.match(sql, /alter table public\.badge_verification_challenges enable row level security/i);
  assert.match(
    sql,
    /revoke all on table public\.badge_verification_challenges from public, anon, authenticated/i
  );
});

test('phase zero removes the legacy roster and uses an explicit RPC allowlist', async () => {
  const [migration, verification] = await Promise.all([
    readFile(migrationPath, 'utf8'),
    readFile(verificationPath, 'utf8')
  ]);
  assert.match(migration, /drop function if exists public\.list_badge_roster\(text\)/i);
  assert.match(
    migration,
    /grant execute on function public\.list_badge_roster\(uuid\) to authenticated/i
  );
  assert.match(
    migration,
    /grant execute on function public\.current_profile_id\(\) to authenticated/i
  );
  assert.match(migration, /p\.prosecdef/i);
  assert.match(migration, /revoke all on function %s from public, anon, authenticated/i);
  assert.match(verification, /v_allowed regprocedure\[\]/i);
  assert.match(verification, /Routine is outside authenticated allowlist/i);
});
