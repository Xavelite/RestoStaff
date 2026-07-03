import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/202606210027_payroll_export_lineage.sql';
const payrollColumnsPath =
  'supabase/migrations/202606240033_payroll_export_columns.sql';
const payrollPreviewPath =
  'supabase/migrations/202606250034_preview_payroll_export.sql';
const payrollExportModelPath = 'src/lib/payroll/payroll-export.ts';
const approvalFinalizePath =
  'supabase/migrations/202606250035_actuals_approval_auto_finalize.sql';
const approvalMissingBadgeGuardPath =
  'supabase/migrations/202606270038_actuals_auto_finalize_missing_badge_guard.sql';
const finalizedEventTypePath =
  'supabase/migrations/202606270039_work_week_finalized_event_type.sql';
const goPilotClosureContractPath =
  'supabase/tests/phase8_go_pilot_closure_contract.sql';
const mutationsPath = 'src/lib/api/mutations.ts';
const actualsPath = 'src/routes/(app)/actuals/+page.svelte';

test('Phase 6 creates immutable generic payroll export evidence', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /create table public\.payroll_export_runs/i);
  assert.match(sql, /payroll_export_runs_append_only/i);
  assert.match(sql, /Payroll export runs are immutable operational evidence/i);
  assert.match(sql, /payload_sha256/i);
  assert.match(sql, /extensions\.digest/i);
});

test('Phase 6 exports only owner-approved complete-week Actuals', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /Only an owner can create a payroll export/i);
  assert.match(sql, /complete Monday-to-Sunday weeks/i);
  assert.match(sql, /Every included Actuals week must be approved/i);
  assert.match(sql, /Complete payroll ID, legal name and national number/i);
});

test('Phase 6 preserves entry and week revision lineage', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /time_entry_revision/i);
  assert.match(sql, /actuals_revision/i);
  assert.match(sql, /source_revisions/i);
  assert.match(sql, /entry_sources/i);
});

test('Actuals creates and re-downloads server-recorded payroll exports', async () => {
  const mutations = await readFile(mutationsPath, 'utf8');
  const actuals = await readFile(actualsPath, 'utf8');
  const payrollExportModel = await readFile(payrollExportModelPath, 'utf8');

  assert.match(mutations, /createPayrollExportRun/i);
  assert.match(mutations, /getPayrollExportRun/i);
  // Recorded runs are surfaced in the audited timeline and re-downloadable.
  assert.match(actuals, /payrollRunHistoryItems/i);
  assert.match(payrollExportModel, /Payroll export created/i);
  assert.match(actuals, /downloadPayrollRun/i);
  // The Export CSV wizard records an official run when the period is approved.
  assert.match(actuals, /createPayrollExportRun/i);
  assert.doesNotMatch(actuals, /function exportPayrollPrep/i);
});

test('Phase 6 column configuration keeps payroll exports server-allowlisted', async () => {
  const [sql, mutations] = await Promise.all([
    readFile(payrollColumnsPath, 'utf8'),
    readFile(mutationsPath, 'utf8')
  ]);

  assert.match(sql, /payroll_export_field_label/i);
  assert.match(sql, /set_payroll_export_columns/i);
  assert.match(sql, /create function public\.create_payroll_export_run\(\s*p_restaurant_id uuid,\s*p_period_start date,\s*p_period_end date,\s*p_columns jsonb default null/i);
  assert.match(sql, /Unknown payroll export column requested/i);
  assert.match(sql, /schema_version in \(1, 2\)/i);
  assert.match(sql, /'columns', v_columns/i);
  assert.doesNotMatch(sql, /department_id|team_id|payroll_provider/i);
  assert.match(mutations, /rpc\('set_payroll_export_columns'/i);
  assert.match(mutations, /rpc\('create_payroll_export_run'/i);
  assert.match(mutations, /p_columns: input\.columns \?\? null/i);
});

test('Phase 6 draft preview is read-only and distinct from official lineage', async () => {
  const [sql, mutations] = await Promise.all([
    readFile(payrollPreviewPath, 'utf8'),
    readFile(mutationsPath, 'utf8')
  ]);

  assert.match(sql, /create or replace function public\.preview_payroll_export/i);
  assert.match(sql, /Only an owner can export payroll/i);
  assert.match(sql, /No approval gate/i);
  assert.match(sql, /writes nothing/i);
  assert.match(sql, /No identity gate/i);
  assert.doesNotMatch(sql, /insert into public\.payroll_export_runs/i);
  assert.match(mutations, /rpc\('preview_payroll_export'/i);
});

test('Phase 6 approval finalizes only the missing planning baseline with audit evidence', async () => {
  const sql = await readFile(approvalFinalizePath, 'utf8');

  assert.match(sql, /create or replace function public\.guard_actuals_approval/i);
  assert.match(sql, /old\.planning_status = 'draft'/i);
  assert.match(sql, /new\.planning_status := 'published'/i);
  assert.match(sql, /'planning_finalized'/i);
  assert.match(sql, /Resolve live badges before approving Actuals/i);
  assert.match(sql, /Resolve worked-time conflicts before approving Actuals/i);
  assert.match(sql, /Resolve missing time-entry audit evidence before approving Actuals/i);
  assert.doesNotMatch(sql, /'planning_published'/i);
});

test('Phase 6 approval auto-finalize still enforces missing badges as database truth', async () => {
  const [guardSql, eventSql, contractSql] = await Promise.all([
    readFile(approvalMissingBadgeGuardPath, 'utf8'),
    readFile(finalizedEventTypePath, 'utf8'),
    readFile(goPilotClosureContractPath, 'utf8')
  ]);

  assert.match(guardSql, /new\.planning_status = 'published'/i);
  assert.match(guardSql, /Resolve missing badges before approving Actuals/i);
  assert.match(eventSql, /'planning_finalized'/i);
  assert.match(contractSql, /Actuals approval skipped missing badges on an auto-finalized draft plan/i);
  assert.match(contractSql, /Phase 8 auto-finalize approval fixture/i);
});
