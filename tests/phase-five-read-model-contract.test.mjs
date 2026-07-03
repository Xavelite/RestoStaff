import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/202606210023_focused_workspace_read_models.sql';
const apiPath = 'src/lib/api/workspace.ts';
const storePath = 'src/lib/workspace/workspace.svelte.ts';
const mutationsPath = 'src/lib/api/mutations.ts';

test('Phase 5 replaces the broad runtime snapshot with five focused reads', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /get_workspace_bootstrap\(p_restaurant_id uuid\)/i);
  assert.match(sql, /get_manager_operations_read_model/i);
  assert.match(sql, /get_employee_operations_read_model/i);
  assert.match(sql, /get_team_read_model/i);
  assert.match(sql, /get_restaurant_read_model/i);
  assert.match(sql, /drop function public\.get_workspace_runtime_snapshot/i);
  assert.match(sql, /drop function public\.build_workspace_runtime_snapshot_v2/i);
});

test('Phase 5 keeps builders private and date-bounds operational reads', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /limited to 63 days/i);
  assert.match(
    sql,
    /revoke all on function public\.build_manager_operations_read_model/i
  );
  assert.match(sql, /grant execute on function public\.get_team_read_model/i);
});

test('Phase 5 mutations return acknowledgements instead of workspace payloads', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  const mutations = await readFile(mutationsPath, 'utf8');

  assert.match(sql, /compact_mutation_results/i);
  assert.match(mutations, /export type MutationAck/i);
  assert.doesNotMatch(mutations, /parseWorkspaceSnapshot|snapshotFromResult/);
});

test('Phase 5 gives the shell and routes distinct data owners', async () => {
  const api = await readFile(apiPath, 'utf8');
  const store = await readFile(storePath, 'utf8');

  assert.match(api, /getWorkspaceBootstrap/i);
  assert.match(api, /getManagerOperationsReadModel/i);
  assert.match(api, /getEmployeeOperationsReadModel/i);
  assert.match(store, /bootstrap = \$state<WorkspaceBootstrap/i);
  assert.match(store, /operations = \$state<ManagerOperationsReadModel/i);
  assert.match(store, /employeeOperations = \$state<EmployeeOperationsReadModel/i);
  assert.match(store, /team = \$state<TeamReadModel/i);
  assert.match(store, /restaurant = \$state<RestaurantReadModel/i);
  assert.doesNotMatch(store, /snapshot = \$state|applySnapshot|reloadSnapshot/);
});
