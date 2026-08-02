import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Timesheet persists worked time and exact payroll evidence in one RPC', async () => {
  const actions = await readFile('src/lib/timesheet/timesheet-actions.ts', 'utf8');
  const migration = await readFile(
    'supabase/migrations/20260802015019_atomic_timesheet_payroll_evidence.sql',
    'utf8'
  );

  assert.match(actions, /actual_job_function_id: values\.actualJobFunctionId/);
  assert.match(actions, /actual_area_id: values\.actualAreaId/);
  assert.match(actions, /break_intervals: values\.breakIntervals/);
  assert.doesNotMatch(actions, /saveTimeEntryPayrollEvidence/);
  assert.match(migration, /perform public\.save_time_entry_payroll_evidence/);
  assert.match(migration, /'entity_id',[\s\S]*coalesce\(v_after\.id, v_entry\.id\)/);
});

test('Timesheet does not turn missing badge coordinates into zero coordinates', async () => {
  const dialog = await readFile('src/lib/timesheet/TimesheetEntryDialog.svelte', 'utf8');
  assert.match(dialog, /if \(rawLatitude == null \|\| rawLongitude == null\) return null/);
});

test('Timesheet waits for exact evidence before claiming breaks are missing', async () => {
  const editor = await readFile('src/lib/timesheet/TimesheetEntryEditor.svelte', 'utf8');
  assert.match(editor, /\{#if !evidenceLoading && aggregateBreakNeedsPosition\}/);
});
