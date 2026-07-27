import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260727163538_harden_logo_and_reservation_room_identity.sql';

test('operator security corrections are forward-only and fail closed', async () => {
  const migration = await readFile(migrationPath, 'utf8');

  assert.match(
    migration,
    /perform 1\s+from public\.require_owner_or_manager_context\(p_restaurant_id\)/i
  );
  assert.match(
    migration,
    /v_logo_path is not null[\s\S]*v_logo_path not like p_restaurant_id::text \|\| '\/%'/i
  );
  assert.match(
    migration,
    /revoke all on function public\.set_restaurant_logo\(uuid, text\)[\s\S]*from public, anon, service_role/i
  );
  assert.match(
    migration,
    /v_next := replace\(\s*v_definition,\s*v_duplicate_identity,\s*v_canonical_identity\s*\)/i
  );
  assert.match(migration, /v_area_icon_count <> 1/i);
  assert.match(
    migration,
    /if v_next <> v_definition then\s+execute v_next;\s+end if;/i
  );
});
