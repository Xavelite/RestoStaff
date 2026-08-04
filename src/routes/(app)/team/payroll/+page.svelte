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
  import WorkspacePicker from '$lib/workspace-ui/WorkspacePicker.svelte';
  import WorkspaceRowMenu from '$lib/workspace-ui/WorkspaceRowMenu.svelte';
  import WorkspaceTablePanel from '$lib/workspace-ui/WorkspaceTablePanel.svelte';
  import WorkspaceVisualCanvas from '$lib/workspace-ui/WorkspaceVisualCanvas.svelte';
  import WorkspaceVisualSection from '$lib/workspace-ui/WorkspaceVisualSection.svelte';
  import WorkspaceTag from '$lib/workspace-ui/WorkspaceTag.svelte';
  import { workspaceLayout } from '$lib/workspace-ui/workspace-layout.svelte';

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

  /** Kept beside gaps() so the progress denominator cannot drift from it. */
  const payrollFieldCount = 6;

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

  function readinessFields(employee: EmployeeDraft) {
    return [
      {
        key: 'payroll',
        label: t('Payroll ID'),
        value: employee.payrollEmployeeId || t('Missing'),
        ready: Boolean(employee.payrollEmployeeId)
      },
      {
        key: 'registry',
        label: t('Registry'),
        value: employee.nationalRegistryNumber ? t('Captured') : t('Missing'),
        ready: Boolean(employee.nationalRegistryNumber)
      },
      {
        key: 'bank',
        label: t('Bank'),
        value: bankLabel(employee),
        ready: Boolean(employee.iban)
      },
      {
        key: 'function',
        label: t('CP 302'),
        value: employee.cp302ReferenceFunctionCode || t('Missing'),
        ready: Boolean(employee.cp302ReferenceFunctionCode)
      },
      {
        key: 'worker',
        label: t('Worker'),
        value: workerLabel(employee),
        ready: Boolean(employee.workerStatus)
      },
      {
        key: 'salary',
        label: t('Salary'),
        value: salaryLabel(employee),
        ready: Boolean(employee.salaryBasis)
      }
    ];
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
  const workerOptions = [
    { value: '', label: t('Not set') },
    { value: 'blue_collar', label: t('Blue-collar worker') },
    { value: 'white_collar', label: t('White-collar employee') }
  ];
  const salaryOptions = [
    { value: '', label: t('Not set') },
    { value: 'hourly', label: t('Hourly') },
    { value: 'monthly', label: t('Monthly') }
  ];
  const functionOptions = $derived([
    { value: '', label: t('Not set') },
    ...(teamDraft.payrollCatalogue?.referenceFunctions ?? []).map((item) => ({
      value: item.code,
      label: `${item.code} · ${item.name_en || item.name_fr || item.name_nl || item.code}`
    }))
  ]);
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
      {#if workspaceLayout.visual}
        <WorkspaceVisualCanvas label={t('Payroll')} variant="board">
          {#if !filtered.length}
            <div class="cl-empty visual-empty"><strong>{t('No active employees')}</strong><span>{t('Add someone before completing their payroll setup.')}</span></div>
          {:else}
          {#each groups as group (group.key)}
            <WorkspaceVisualSection
              label={view.grouping && group.label ? group.label : t('Payroll readiness')}
              meta={peopleCountLabel(group.employees.length)}
            >
              <div class="payroll-readiness">
                <div class="payroll-readiness__head" aria-hidden="true">
                  <span>{t('Employee')}</span>
                  <span>{t('Payroll ID')}</span>
                  <span>{t('Registry')}</span>
                  <span>{t('Bank')}</span>
                  <span>{t('CP 302')}</span>
                  <span>{t('Worker')}</span>
                  <span>{t('Salary')}</span>
                  <span>{t('Setup')}</span>
                </div>
                {#each group.employees as employee (employee.id)}
                  {@const missing = gaps(employee)}
                  {@const captured = payrollFieldCount - missing.length}
                  <button
                    class:ready={!missing.length}
                    class="payroll-readiness__row"
                    style={`--employee-tone:${employeeColor.get(employee.id) ?? 'var(--rst-ui-action)'}`}
                    type="button"
                    onclick={() => (detailId = employee.id)}
                  >
                    <span class="payroll-person">
                      <span>{personInitials(employee.displayName || '?')}</span>
                      <span>
                        <strong>{employee.displayName}</strong>
                        <small>{team.jobName.get(employee.jobFunctionIds[0] ?? '') || t('No position')}</small>
                      </span>
                    </span>
                    {#each readinessFields(employee) as field (field.key)}
                      <span class:complete={field.ready} class="readiness-cell">
                        <i aria-hidden="true"></i>
                        <span>
                          <small>{field.label}</small>
                          <strong>{field.value}</strong>
                        </span>
                      </span>
                    {/each}
                    <span class="readiness-score">
                      <WorkspaceTag label={missing.length ? `${captured}/${payrollFieldCount}` : t('Ready')} tone={missing.length ? 'warn' : 'ok'} />
                      <i><i style={`width:${(captured / payrollFieldCount) * 100}%`}></i></i>
                    </span>
                  </button>
                {/each}
              </div>
            </WorkspaceVisualSection>
          {/each}
          {/if}
        </WorkspaceVisualCanvas>
      {:else}
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
                      {#if shown('position')}<td class="readonly-cell">{team.jobName.get(employee.jobFunctionIds[0] ?? '') || t('No position')}</td>{/if}
                      {#if shown('payrollId')}<td class="editable-cell"><input class="grid-field" type="text" value={employee.payrollEmployeeId} placeholder={t('Add payroll ID')} disabled={!team.editable} aria-label={`${t('Payroll ID')} · ${employee.displayName}`} oninput={(event) => teamDraft.update(employee.id, { payrollEmployeeId: event.currentTarget.value })} /></td>{/if}
                      {#if shown('worker')}<td><WorkspacePicker value={employee.workerStatus} options={workerOptions} disabled={!team.editable} ariaLabel={`${t('Worker status')} · ${employee.displayName}`} onchange={(value) => teamDraft.update(employee.id, { workerStatus: value as EmployeeDraft['workerStatus'] })} /></td>{/if}
                      {#if shown('function')}<td><WorkspacePicker value={employee.cp302ReferenceFunctionCode} options={functionOptions} disabled={!team.editable} ariaLabel={`${t('CP 302 function')} · ${employee.displayName}`} onchange={(value) => teamDraft.update(employee.id, { cp302ReferenceFunctionCode: value })} /></td>{/if}
                      {#if shown('salary')}<td class="salary-cell"><div class="salary-inline"><WorkspacePicker value={employee.salaryBasis} options={salaryOptions} disabled={!team.editable} ariaLabel={`${t('Salary basis')} · ${employee.displayName}`} onchange={(value) => teamDraft.update(employee.id, { salaryBasis: value as EmployeeDraft['salaryBasis'] })} />{#if employee.salaryBasis}<span class="money-input"><span>€</span><input class="grid-field" type="text" inputmode="decimal" value={employee.salaryBasis === 'monthly' ? employee.contractualMonthlySalary : employee.contractualHourlyRate} placeholder="0.00" disabled={!team.editable} aria-label={`${t(employee.salaryBasis === 'monthly' ? 'Monthly salary' : 'Hourly rate')} · ${employee.displayName}`} oninput={(event) => teamDraft.update(employee.id, employee.salaryBasis === 'monthly' ? { contractualMonthlySalary: event.currentTarget.value } : { contractualHourlyRate: event.currentTarget.value })} /></span>{/if}</div></td>{/if}
                      {#if shown('bank')}<td class="editable-cell"><input class="grid-field bank-field" type="text" value={employee.iban} placeholder={t('Add IBAN')} disabled={!team.editable} autocomplete="off" aria-label={`${t('IBAN')} · ${employee.displayName}`} oninput={(event) => teamDraft.update(employee.id, { iban: event.currentTarget.value.toUpperCase() })} /></td>{/if}
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
      {/if}
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
  .payroll-readiness {
    min-width: 1020px;
    overflow: hidden;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    background: var(--rst-ui-surface);
  }
  .visual-empty { min-width: min(680px, 100%); min-height: 220px; }

  .payroll-readiness__head,
  .payroll-readiness__row {
    display: grid;
    grid-template-columns: minmax(200px, 1.35fr) repeat(6, minmax(92px, .72fr)) minmax(90px, .65fr);
    align-items: stretch;
  }

  .payroll-readiness__head {
    min-height: 34px;
    border-bottom: 1px solid var(--rst-ui-line);
    color: var(--rst-ui-muted);
    background: var(--rst-ui-surface-field);
  }

  .payroll-readiness__head > span {
    display: flex;
    align-items: center;
    padding: 7px 10px;
    border-right: 1px solid var(--rst-ui-line);
    font-size: var(--rst-fs-micro);
    font-weight: var(--rst-fw-bold);
  }

  .payroll-readiness__row {
    width: 100%;
    min-height: 66px;
    padding: 0;
    border: 0;
    border-bottom: 1px solid var(--rst-ui-line);
    color: var(--rst-ui-text);
    background: var(--rst-ui-surface);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: background var(--cl-dur) var(--cl-ease);
  }

  .payroll-readiness__row:last-child { border-bottom: 0; }
  .payroll-readiness__row:hover { background: color-mix(in srgb, var(--employee-tone) 4%, var(--rst-ui-surface)); }
  .payroll-readiness__row:focus-visible { position: relative; z-index: 1; outline: 2px solid var(--rst-ui-action); outline-offset: -2px; }

  .payroll-person,
  .readiness-cell,
  .readiness-score {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 10px;
    border-right: 1px solid var(--rst-ui-line);
  }

  .payroll-person > span:first-child {
    width: 34px;
    height: 34px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--employee-tone) 34%, var(--rst-ui-line));
    border-radius: 50%;
    color: var(--employee-tone);
    background: color-mix(in srgb, var(--employee-tone) 8%, var(--rst-ui-surface));
    font-size: var(--rst-fs-micro);
    font-weight: var(--rst-fw-bold);
  }

  .payroll-person > span:last-child,
  .readiness-cell > span { min-width: 0; display: grid; gap: 2px; }
  .payroll-person strong,
  .payroll-person small,
  .readiness-cell strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .payroll-person strong { font-size: var(--rst-fs-body); }
  .payroll-person small,
  .readiness-cell small { color: var(--rst-ui-muted); font-size: var(--rst-fs-micro); }
  .readiness-cell strong { color: var(--rst-state-warning-text); font-size: var(--rst-fs-micro); font-weight: var(--rst-fw-medium); }
  .readiness-cell > i { width: 9px; height: 9px; flex: 0 0 auto; border: 2px solid color-mix(in srgb, var(--rst-state-warning) 42%, var(--rst-ui-line)); border-radius: 50%; background: color-mix(in srgb, var(--rst-state-warning) 10%, var(--rst-ui-surface)); }
  .readiness-cell.complete > i { border-color: color-mix(in srgb, var(--cl-ok) 45%, var(--rst-ui-line)); background: var(--cl-ok); box-shadow: inset 0 0 0 2px var(--rst-ui-surface); }
  .readiness-cell.complete strong { color: var(--rst-ui-text); }

  .readiness-score { display: grid; align-content: center; gap: 7px; border-right: 0; }
  .readiness-score > i { height: 4px; overflow: hidden; border-radius: 999px; background: var(--rst-ui-surface-field-strong); }
  .readiness-score > i > i { height: 100%; display: block; border-radius: inherit; background: var(--rst-state-warning); }
  .payroll-readiness__row.ready .readiness-score > i > i { background: var(--cl-ok); }

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
    font-size: var(--rst-fs-body);
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

  .readonly-cell {
    color: var(--cl-muted) !important;
    background: color-mix(in srgb, var(--cl-surface-muted) 58%, var(--cl-surface)) !important;
  }

  .editable-cell,
  .salary-cell { padding: 0 !important; }

  .grid-field {
    width: 100%;
    min-height: var(--cl-row);
    padding: 9px 14px;
    border: 1px solid transparent;
    border-radius: 0;
    outline: 0;
    color: var(--cl-ink);
    background: transparent;
    font: inherit;
    font-size: var(--rst-fs-body);
    transition: border-color var(--cl-dur) var(--cl-ease), background var(--cl-dur) var(--cl-ease);
  }
  .grid-field:hover:not(:disabled) { background: var(--cl-surface-muted); }
  .grid-field:focus { border-color: var(--cl-accent); background: var(--cl-surface); box-shadow: inset 0 0 0 1px var(--cl-accent); }
  .grid-field::placeholder { color: var(--cl-accent); }
  .salary-inline { min-width: 225px; display: grid; grid-template-columns: minmax(105px, .9fr) minmax(100px, 1fr); align-items: center; }
  .salary-inline > :global(.cl-picker) { border-right: 1px solid var(--cl-line); }
  .money-input { position: relative; min-width: 0; display: block; }
  .money-input > span { position: absolute; z-index: 1; left: 10px; top: 50%; color: var(--cl-muted); font-size: var(--rst-fs-control); transform: translateY(-50%); pointer-events: none; }
  .money-input .grid-field { padding-left: 25px; }
  .bank-field { min-width: 170px; font-variant-numeric: tabular-nums; }

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
    font-size: var(--rst-fs-body);
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
