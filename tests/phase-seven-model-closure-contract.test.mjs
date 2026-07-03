import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const defaultsMigration =
  'supabase/migrations/202606210028_default_constraint_alignment.sql';
const closureMigration =
  'supabase/migrations/202606210029_model_closure_integrity.sql';
const canonicalSecurity = 'supabase/tests/canonical_schema_security.sql';

test('Phase 7 aligns durable access defaults with their constraints', async () => {
  const sql = await readFile(defaultsMigration, 'utf8');

  assert.match(
    sql,
    /employee_access[\s\S]*access_status set default 'disabled'/i
  );
  assert.match(
    sql,
    /restaurant_memberships[\s\S]*status set default 'disabled'/i
  );
  assert.match(sql, /default_constraint_preconditions/i);
});

test('Phase 7 prevents important employee history from cascading away', async () => {
  const sql = await readFile(closureMigration, 'utf8');

  for (const constraint of [
    'employee_contracts_employee_fk',
    'absences_employee_fk',
    'absence_events_absence_fk',
    'work_pattern_exceptions_employee_fk',
    'work_pattern_exception_events_exception_fk',
    'work_pattern_exception_events_employee_fk'
  ]) {
    assert.match(
      sql,
      new RegExp(`${constraint}[\\s\\S]*?on delete restrict`, 'i')
    );
  }
});

test('Phase 7 makes lifecycle events and historical contracts immutable', async () => {
  const sql = await readFile(closureMigration, 'utf8');

  assert.match(sql, /absence_events_append_only/i);
  assert.match(sql, /work_pattern_exception_events_append_only/i);
  assert.match(sql, /employee_contracts_history_guard/i);
  assert.match(sql, /Historical employment contracts are immutable/i);
});

test('Canonical security covers all app-owned routines and trigger helpers', async () => {
  const sql = await readFile(canonicalSecurity, 'utf8');

  assert.match(sql, /v_service_allowed regprocedure\[\]/i);
  assert.match(sql, /p2\.prorettype = 'pg_catalog\.trigger'::regtype/i);
  assert.match(sql, /Routine has no explicit search_path/i);
});
