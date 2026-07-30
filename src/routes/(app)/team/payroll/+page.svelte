<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import { personInitials } from '$lib/ui/person';
  import { buildEmployeeColorMap } from '$lib/ui/position-color';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import type { EmployeeDraft } from '$lib/team/team-model';
  import { useWorkspaceTeamContext } from '$lib/workspace-ui/workspace-context';
  import { teamDraft } from '$lib/workspace-ui/workspace-team.svelte';
  import { createTableView, peopleCountLabel } from '$lib/workspace-ui/table-view.svelte';
  import EmployeeInlineEditor from '$lib/workspace-ui/EmployeeInlineEditor.svelte';
  import WorkspaceCellBadge from '$lib/workspace-ui/WorkspaceCellBadge.svelte';
  import WorkspaceColChooser from '$lib/workspace-ui/WorkspaceColChooser.svelte';
  import WorkspaceColMenu from '$lib/workspace-ui/WorkspaceColMenu.svelte';
  import WorkspaceGroupRow from '$lib/workspace-ui/WorkspaceGroupRow.svelte';
  import WorkspacePrimaryColMenu from '$lib/workspace-ui/WorkspacePrimaryColMenu.svelte';
  import WorkspaceRowMenu from '$lib/workspace-ui/WorkspaceRowMenu.svelte';
  import WorkspaceTablePanel from '$lib/workspace-ui/WorkspaceTablePanel.svelte';

  type GroupBy = 'readiness' | 'worker' | 'basis' | 'none';
  type SortKey =
    | 'employee'
    | 'position'
    | 'payrollId'
    | 'worker'
    | 'function'
    | 'salary'
    | 'bank'
    | 'readiness';
  type PayrollGroup = {
    key: string;
    label: string;
    employees: EmployeeDraft[];
  };

  const OPTIONAL_COLUMNS = [
    { key: 'position', label: 'Position' },
    { key: 'payrollId', label: 'Payroll ID' },
    { key: 'worker', label: 'Worker status' },
    { key: 'function', label: 'CP 302 function' },
    { key: 'salary', label: 'Salary terms' },
    { key: 'bank', label: 'Bank details' },
    { key: 'readiness', label: 'Setup' }
  ] as const;

  const view = createTableView<SortKey, GroupBy>({
    storageKey: 'rst-team-payroll-cols-v1',
    columns: OPTIONAL_COLUMNS,
    defaultGroupBy: 'readiness'
  });

  onMount(view.restore);

  const shown = (key: string) => view.shown(key);
  const colCount = $derived(
    2 + OPTIONAL_COLUMNS.filter((column) => shown(column.key)).length
  );
  const readTeamContext = useWorkspaceTeamContext();
  const team = $derived(readTeamContext());
  let detailId = $state('');

  const employeeColor = $derived(
    workspace.team
      ? buildEmployeeColorMap(
          workspace.team.job_functions,
          workspace.team.employee_job_functions,
          workspace.restaurant?.work_areas ?? [],
          workspace.restaurant?.job_function_areas ?? []
        )
      : new Map<string, string>()
  );

  function gaps(employee: EmployeeDraft): string[] {
    const missing: string[] = [];
    if (!employee.payrollEmployeeId) missing.push('Payroll ID');
    if (!employee.nationalRegistryNumber) missing.push('National registry number');
    if (!employee.iban) missing.push('IBAN');
    if (!employee.cp302ReferenceFunctionCode) missing.push('CP 302 function');
    if (!employee.workerStatus) missing.push('Worker status');
    if (!employee.salaryBasis) missing.push('Salary basis');
    return missing;
  }

  function workerLabel(employee: EmployeeDraft): string {
    if (employee.workerStatus === 'blue_collar') return t('Blue-collar worker');
    if (employee.workerStatus === 'white_collar') return t('White-collar employee');
    return t('Not set');
  }

  function salaryLabel(employee: EmployeeDraft): string {
    if (employee.salaryBasis === 'hourly') {
      return employee.contractualHourlyRate
        ? `€${employee.contractualHourlyRate} / ${t('hour')}`
        : t('Hourly · rate missing');
    }
    if (employee.salaryBasis === 'monthly') {
      return employee.contractualMonthlySalary
        ? `€${employee.contractualMonthlySalary} / ${t('month')}`
        : t('Monthly · salary missing');
    }
    return t('Not set');
  }

  function bankLabel(employee: EmployeeDraft): string {
    const normalized = employee.iban.replace(/\s+/g, '');
    return normalized ? `•••• ${normalized.slice(-4)}` : t('Not set');
  }

  function functionLabel(employee: EmployeeDraft): string {
    const code = employee.cp302ReferenceFunctionCode;
    if (!code) return t('Not set');
    const reference = teamDraft.payrollCatalogue?.referenceFunctions.find(
      (item) => item.code === code
    );
    const name = reference?.name_en || reference?.name_fr || reference?.name_nl || '';
    return name ? `${code} · ${name}` : code;
  }

  function matches(employee: EmployeeDraft): boolean {
    const placement = teamDraft.placement(employee);
    if (!placement.active) return false;
    const ready = gaps(placement).length === 0;
    if (view.isExcluded('readiness', ready ? 'ready' : 'incomplete')) return false;
    if (view.isExcluded('worker', placement.workerStatus || '__none__')) return false;
    if (view.isExcluded('salary', placement.salaryBasis || '__none__')) return false;
    if (!view.matchesSearch('position', team?.jobName.get(placement.jobFunctionIds[0] ?? '') ?? '')) return false;
    if (!view.matchesSearch('payrollId', placement.payrollEmployeeId)) return false;
    if (!view.matchesSearch('function', functionLabel(placement))) return false;
    if (!view.matchesSearch('bank', bankLabel(placement))) return false;
    return view.matchesSearch(
      'employee',
      `${placement.displayName} ${placement.payrollEmployeeId} ${functionLabel(placement)}`
    );
  }

  function sortValue(employee: EmployeeDraft, key: SortKey): string {
    const placement = teamDraft.placement(employee);
    if (key === 'employee') return placement.displayName.toLocaleLowerCase();
    if (key === 'position') {
      return (team?.jobName.get(placement.jobFunctionIds[0] ?? '') ?? '~').toLocaleLowerCase();
    }
    if (key === 'payrollId') return placement.payrollEmployeeId.toLocaleLowerCase() || '~';
    if (key === 'worker') return workerLabel(placement).toLocaleLowerCase();
    if (key === 'function') return functionLabel(placement).toLocaleLowerCase();
    if (key === 'salary') return salaryLabel(placement).toLocaleLowerCase();
    if (key === 'bank') return placement.iban || '~';
    return gaps(placement).length ? '1' : '0';
  }

  function grouped(rows: EmployeeDraft[]): PayrollGroup[] {
    if (!view.grouping) return [{ key: 'all', label: '', employees: rows }];
    const groups = new Map<string, PayrollGroup>();
    for (const employee of rows) {
      const placement = teamDraft.placement(employee);
      let key = '';
      let label = '';
      if (view.groupBy === 'worker') {
        key = placement.workerStatus || '__none__';
        label = workerLabel(placement);
      } else if (view.groupBy === 'basis') {
        key = placement.salaryBasis || '__none__';
        label =
          placement.salaryBasis === 'hourly'
            ? t('Hourly')
            : placement.salaryBasis === 'monthly'
              ? t('Monthly')
              : t('Not set');
      } else {
        key = gaps(placement).length ? 'incomplete' : 'ready';
        label = t(key === 'ready' ? 'Ready' : 'Incomplete');
      }
      const group = groups.get(key) ?? { key, label, employees: [] };
      group.employees.push(employee);
      groups.set(key, group);
    }
    return [...groups.values()].sort((left, right) =>
      left.key.startsWith('__')
        ? -1
        : right.key.startsWith('__')
          ? 1
          : left.label.localeCompare(right.label)
    );
  }

  const workerValues = [
    { value: '__none__', label: t('Not set') },
    { value: 'blue_collar', label: t('Blue-collar worker') },
    { value: 'white_collar', label: t('White-collar employee') }
  ];
  const salaryValues = [
    { value: '__none__', label: t('Not set') },
    { value: 'hourly', label: t('Hourly') },
    { value: 'monthly', label: t('Monthly') }
  ];
  const readinessValues = [
    { value: 'ready', label: t('Ready') },
    { value: 'incomplete', label: t('Incomplete') }
  ];
</script>

<svelte:head><title>{t('Payroll')} &middot; {t('Team')} &middot; restogogo</title></svelte:head>

{#if team && workspace.canViewFinancials}
  {@const filtered = team.employees.filter(matches)}
  {@const ordered = view.ordered(filtered, sortValue)}
  {@const groups = grouped(ordered)}
  {@const readyCount = filtered.filter((employee) => gaps(employee).length === 0).length}

  <WorkspaceTablePanel
    dirty={team.dirty}
    saving={team.saving}
    canSave={team.canSave}
    onsave={() => void team.save().catch(() => undefined)}
    ondiscard={team.discard}
  >
    {#snippet meta()}
      <span><i class="dot"></i>{t('{count} employees', { count: filtered.length })}</span>
      <span><i class="dot is-green"></i>{t('{ready} of {total} ready', { ready: readyCount, total: filtered.length })}</span>
    {/snippet}
    {#snippet children()}
      <div class="cl-tablewrap">
        <table class="cl-table cl-mobile-rows payroll-table">
          <thead>
            <tr>
              <th class="has-menu">
                <WorkspacePrimaryColMenu
                  label={t('Employee')}
                  sortable
                  sortDir={view.sortDir('employee')}
                  onsort={(direction) => view.setSort('employee', direction)}
                  filterKind="text"
                  searchValue={view.search('employee')}
                  onsearch={(value) => view.setSearch('employee', value)}
                  groupValue={view.groupBy}
                  groupOptions={[
                    { value: 'none', label: t('No grouping') },
                    { value: 'readiness', label: t('Setup') },
                    { value: 'worker', label: t('Worker status') },
                    { value: 'basis', label: t('Salary basis') }
                  ]}
                  ongroupchange={(value) => view.setGroupBy(value as GroupBy)}
                />
              </th>
              {#if shown('position')}<th class="has-menu"><WorkspaceColMenu label={t('Position')} sortable sortDir={view.sortDir('position')} onsort={(direction) => view.setSort('position', direction)} filterKind="text" searchValue={view.search('position')} onsearch={(value) => view.setSearch('position', value)} /></th>{/if}
              {#if shown('payrollId')}<th class="has-menu"><WorkspaceColMenu label={t('Payroll ID')} sortable sortDir={view.sortDir('payrollId')} onsort={(direction) => view.setSort('payrollId', direction)} filterKind="text" searchValue={view.search('payrollId')} onsearch={(value) => view.setSearch('payrollId', value)} /></th>{/if}
              {#if shown('worker')}<th class="has-menu"><WorkspaceColMenu label={t('Worker status')} sortable sortDir={view.sortDir('worker')} onsort={(direction) => view.setSort('worker', direction)} filterKind="values" filterValues={workerValues} selected={view.excluded('worker')} ontoggle={(value) => view.toggleValue('worker', value)} onselectall={(on) => view.selectAll('worker', on, workerValues)} /></th>{/if}
              {#if shown('function')}<th class="has-menu"><WorkspaceColMenu label={t('CP 302 function')} sortable sortDir={view.sortDir('function')} onsort={(direction) => view.setSort('function', direction)} filterKind="text" searchValue={view.search('function')} onsearch={(value) => view.setSearch('function', value)} /></th>{/if}
              {#if shown('salary')}<th class="has-menu"><WorkspaceColMenu label={t('Salary terms')} sortable sortDir={view.sortDir('salary')} onsort={(direction) => view.setSort('salary', direction)} filterKind="values" filterValues={salaryValues} selected={view.excluded('salary')} ontoggle={(value) => view.toggleValue('salary', value)} onselectall={(on) => view.selectAll('salary', on, salaryValues)} /></th>{/if}
              {#if shown('bank')}<th class="has-menu"><WorkspaceColMenu label={t('Bank details')} sortable sortDir={view.sortDir('bank')} onsort={(direction) => view.setSort('bank', direction)} filterKind="text" searchValue={view.search('bank')} onsearch={(value) => view.setSearch('bank', value)} /></th>{/if}
              {#if shown('readiness')}<th class="has-menu"><WorkspaceColMenu label={t('Setup')} sortable sortDir={view.sortDir('readiness')} onsort={(direction) => view.setSort('readiness', direction)} filterKind="values" filterValues={readinessValues} selected={view.excluded('readiness')} ontoggle={(value) => view.toggleValue('readiness', value)} onselectall={(on) => view.selectAll('readiness', on, readinessValues)} /></th>{/if}
              <th class="chooser-col"><WorkspaceColChooser columns={view.columns} hidden={view.hidden} ontoggle={view.toggleColumn} /></th>
            </tr>
          </thead>
          {#if !filtered.length}
            <tbody>
              <tr class="cl-mobile-empty">
                <td colspan={colCount}>
                  <div class="cl-empty">
                    <strong>{t('No active employees')}</strong>
                    <span>{t('Add someone before completing their payroll setup.')}</span>
                  </div>
                </td>
              </tr>
            </tbody>
          {:else}
            {#each groups as group (group.key)}
              <tbody>
                {#if view.grouping}
                  <WorkspaceGroupRow
                    colspan={colCount}
                    label={group.label}
                    meta={peopleCountLabel(group.employees.length)}
                    collapsed={view.isCollapsed(group.key)}
                    ontoggle={() => view.toggleGroup(group.key)}
                  />
                {/if}
                {#if !view.isCollapsed(group.key)}
                  {#each group.employees as employee (employee.id)}
                    {@const missing = gaps(employee)}
                    <tr class:is-attention={missing.length > 0}>
                      <td class="cl-mobile-primary">
                        <span class="cl-table__name is-employee">
                          <span class="cl-avatar" style="--avatar-color:{employeeColor.get(employee.id) ?? 'var(--cl-muted)'}">{personInitials(employee.displayName || '?')}</span>
                          <button class="employee-name" type="button" onclick={() => (detailId = employee.id)}>{employee.displayName}</button>
                        </span>
                        <span class="cl-mobile-summary">
                          <span>{team.jobName.get(employee.jobFunctionIds[0] ?? '') || t('No position')}</span>
                          <span>{workerLabel(employee)}</span>
                          <span>{missing.length ? t('{count} details missing', { count: missing.length }) : t('Ready')}</span>
                        </span>
                      </td>
                      {#if shown('position')}<td>{team.jobName.get(employee.jobFunctionIds[0] ?? '') || t('No position')}</td>{/if}
                      {#if shown('payrollId')}<td class="action-cell"><button type="button" onclick={() => (detailId = employee.id)}>{employee.payrollEmployeeId || t('Add payroll ID')}</button></td>{/if}
                      {#if shown('worker')}<td class="action-cell"><button type="button" onclick={() => (detailId = employee.id)}>{workerLabel(employee)}</button></td>{/if}
                      {#if shown('function')}<td class="action-cell"><button type="button" onclick={() => (detailId = employee.id)}>{functionLabel(employee)}</button></td>{/if}
                      {#if shown('salary')}<td class="action-cell"><button type="button" onclick={() => (detailId = employee.id)}>{salaryLabel(employee)}</button></td>{/if}
                      {#if shown('bank')}<td class="action-cell"><button type="button" onclick={() => (detailId = employee.id)}>{bankLabel(employee)}</button></td>{/if}
                      {#if shown('readiness')}<td class="action-cell"><button type="button" onclick={() => (detailId = employee.id)}>{#if missing.length}<WorkspaceCellBadge label={'{count} missing'} params={{ count: missing.length }} tone="warning" icon="warning" />{:else}<WorkspaceCellBadge label="Ready" tone="success" icon="check" />{/if}</button></td>{/if}
                      <td class="menu-cell"><WorkspaceRowMenu items={[{ label: t('Open payroll setup'), onselect: () => (detailId = employee.id) }]} /></td>
                    </tr>
                  {/each}
                {/if}
              </tbody>
            {/each}
          {/if}
        </table>
      </div>
    {/snippet}
  </WorkspaceTablePanel>

  {#if detailId}
    <EmployeeInlineEditor
      employeeId={detailId}
      mode="payroll"
      saving={team.saving}
      onclose={() => (detailId = '')}
      onsave={team.saveEmployee}
    />
  {/if}
{:else if team}
  <div class="cl-card">
    <div class="cl-empty">
      <strong>{t('Payroll access is restricted')}</strong>
      <span>{t('Only the restaurant owner can view employee payroll information.')}</span>
    </div>
  </div>
{/if}

<style>
  .payroll-table {
    min-width: 1080px;
  }

  .employee-name {
    max-width: 220px;
    overflow: hidden;
    padding: 3px 0;
    border: 0;
    background: transparent;
    color: var(--cl-ink);
    font: inherit;
    font-size: 13px;
    font-weight: var(--rst-fw-medium);
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }

  .employee-name:hover {
    color: var(--cl-accent);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .action-cell {
    padding: 0 !important;
  }

  .action-cell > button {
    width: 100%;
    min-height: var(--cl-row);
    display: flex;
    align-items: center;
    overflow: hidden;
    padding: 9px 14px;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 12.5px;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }

  .action-cell > button:hover {
    background: var(--cl-accent-wash);
    color: var(--cl-ink);
  }

  .action-cell > button:focus-visible {
    outline: 2px solid var(--cl-accent);
    outline-offset: -2px;
  }

  @media (max-width: 760px) {
    .payroll-table {
      min-width: 0;
    }
  }
</style>
