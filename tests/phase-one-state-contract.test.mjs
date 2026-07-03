import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/202606200016_stable_operational_states.sql';
const boundaryMigrationPath =
  'supabase/migrations/202606200017_canonical_enum_mutation_boundaries.sql';
const serviceMigrationPath =
  'supabase/migrations/202606200018_fixed_restaurant_services.sql';

test('phase one types stable operational state without redesigning later domains', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  for (const type of [
    'service_availability_state',
    'planning_status',
    'actuals_status',
    'operational_request_status',
    'time_entry_status',
    'time_entry_source',
    'planned_shift_source',
    'availability_submission_status'
  ]) {
    assert.match(sql, new RegExp(`create type public\\.${type} as enum`, 'i'));
  }
  assert.doesNotMatch(sql, /create type public\.(access|invitation|payroll)/i);
});

test('phase one fixes Lunch and Evening at the service metadata owner', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  assert.match(
    sql,
    /constraint services_service_key_check\s+check \(service_key in \('lunch', 'evening'\)\)/i
  );
  assert.match(sql, /Every restaurant must own Lunch and Evening service metadata/i);
});

test('phase one recompiles normalized text mutation boundaries explicitly', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  assert.match(sql, /v_status public\.planning_status/i);
  assert.match(sql, /v_new_status public\.time_entry_status/i);
  assert.match(sql, /v_to_status\s+public\.operational_request_status/i);
  assert.match(sql, /availability_state public\.service_availability_state/i);
  assert.match(sql, /drop trigger work_weeks_actuals_approval_guard/i);
  assert.match(sql, /create trigger work_weeks_actuals_approval_guard/i);
  assert.match(sql, /drop index public\.absences_active_overlap_lookup_idx/i);
  assert.match(sql, /create unique index time_entries_one_open_per_employee/i);
  assert.match(sql, /schema drift[\s\S]+aborts the migration/i);
});

test('phase one removes the temporary availability table and closes enum writes', async () => {
  const sql = await readFile(boundaryMigrationPath, 'utf8');
  assert.doesNotMatch(sql, /create temporary table/i);
  assert.match(sql, /v_slots jsonb := '\{\}'::jsonb/i);
  assert.match(sql, /jsonb_each\(v_slots\)/i);
  assert.match(sql, /::public\.service_availability_state/i);
  assert.match(sql, /::public\.operational_request_status/i);
});

test('phase one preserves exactly two fixed service metadata rows per restaurant', async () => {
  const sql = await readFile(serviceMigrationPath, 'utf8');
  assert.match(sql, /create constraint trigger restaurants_fixed_services_guard/i);
  assert.match(sql, /create constraint trigger services_fixed_contract_guard/i);
  assert.match(sql, /deferrable initially deferred/i);
  assert.match(sql, /Disable a service instead of deleting it/i);
});

test('fixed service trigger keeps RPC-only table privilege boundaries', async () => {
  const sql = await readFile(
    'supabase/migrations/202607030007_fix_fixed_service_trigger_privileges.sql',
    'utf8'
  );
  assert.match(sql, /alter function public\.enforce_fixed_restaurant_services\(\) security definer/i);
  assert.match(sql, /alter function public\.enforce_fixed_restaurant_services\(\) owner to postgres/i);
  assert.doesNotMatch(sql, /grant select on public\.(restaurants|services) to authenticated/i);
});
