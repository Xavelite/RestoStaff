<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import { personInitials } from '$lib/ui/person';
  import {
    buildAreaColorMap,
    buildEmployeeColorMap,
    buildPositionColorMap,
    positionAreaVisualIdentity
  } from '$lib/ui/position-color';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import type { EmployeeDraft } from '$lib/team/team-model';
  import { useClassicTeamContext } from '$lib/classic/classic-workspace-context';
  import ClassicCellBadge from '$lib/classic/ClassicCellBadge.svelte';
  import ClassicTablePanel from '$lib/classic/ClassicTablePanel.svelte';
  import ClassicColMenu from '$lib/classic/ClassicColMenu.svelte';
  import ClassicPrimaryColMenu from '$lib/classic/ClassicPrimaryColMenu.svelte';
  import ClassicGroupRow from '$lib/classic/ClassicGroupRow.svelte';
  import ClassicColChooser from '$lib/classic/ClassicColChooser.svelte';
  import ClassicRowMenu from '$lib/classic/ClassicRowMenu.svelte';
  import ClassicPicker from '$lib/classic/ClassicPicker.svelte';
  import EmployeeInlineEditor from '$lib/classic/EmployeeInlineEditor.svelte';
  import { teamDraft } from '$lib/classic/classic-team.svelte';
  import { createTableView, peopleCountLabel } from '$lib/classic/table-view.svelte';
  import WorkspaceAreaIcon from '$lib/restaurant/WorkspaceAreaIcon.svelte';

  type GroupBy = 'contract' | 'position' | 'status' | 'none';
  type Group = { key: string; label: string; employees: EmployeeDraft[] };
  type SortKey = 'employee' | 'position' | 'contract' | 'regime' | 'start' | 'end' | 'hours' | 'status';

  let detailId = $state('');

  const OPTIONAL_COLUMNS = [
    { key: 'position', label: 'Position' },
    { key: 'contract', label: 'Contract' },
    { key: 'regime', label: 'Availability mode' },
    { key: 'start', label: 'Start' },
    { key: 'end', label: 'End' },
    { key: 'hours', label: 'Weekly hours' },
    { key: 'status', label: 'Setup' }
  ] as const;

  const view = createTableView<SortKey, GroupBy>({
    storageKey: 'rst-team-contract-cols-v2',
    columns: OPTIONAL_COLUMNS,
    defaultGroupBy: 'contract'
  });
  onMount(view.restore);
  const shown = view.shown;
  const colCount = $derived(view.colCount);

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
  const positionColor = $derived(
    workspace.team
      ? buildPositionColorMap(
          workspace.team.job_functions,
          workspace.restaurant?.work_areas ?? [],
          workspace.restaurant?.job_function_areas ?? []
        )
      : new Map<string, string>()
  );
  const areaColor = $derived(buildAreaColorMap(workspace.restaurant?.work_areas ?? []));

  function positionArea(positionId: string): { icon: string; color: string } | null {
    const identity = positionAreaVisualIdentity(
      positionId,
      workspace.restaurant?.work_areas ?? [],
      workspace.restaurant?.job_function_areas ?? [],
      areaColor,
      positionColor.get(positionId)
    );
    return identity ? { icon: identity.icon, color: identity.color } : null;
  }

  const REGIME_LABEL: Record<string, string> = {
    weekly_availability: 'Weekly availability',
    fixed_schedule: 'Fixed schedule',
    manager_only: 'Manager planned'
  };

  async function savePage(save: () => Promise<void>) {
    await save();
  }

  function discardPage(discard: () => void) {
    discard();
    detailId = '';
  }

  function closeDetails() {
    detailId = '';
  }

  function updateContractType(employee: EmployeeDraft, id: string): void {
    const code = workspace.team?.contract_types.find((item) => item.id === id)?.code ?? '';
    teamDraft.update(employee.id, {
      contractTypeId: id,
      ...(code === 'CDI' ? { contractEnd: '' } : {})
    });
  }

  function updateHours(employeeId: string, value: string): void {
    teamDraft.update(employeeId, { weeklyContractHours: Math.max(0, Number(value) || 0) });
  }


  function gaps(employee: EmployeeDraft): string[] {
    const missing: string[] = [];
    if (!employee.contractTypeId) missing.push('Contract type');
    if (!employee.contractStart) missing.push('Start date');
    if (!Number(employee.weeklyContractHours)) missing.push('Weekly hours');
    return missing;
  }

  function matches(employee: EmployeeDraft, contractName: Map<string, string>, jobName: Map<string, string>): boolean {
    const placement = teamDraft.placement(employee);
    const positionValue = placement.jobFunctionIds[0] || '__none__';
    if (!placement.active) return false;
    if (view.isExcluded('contract', placement.contractTypeId || '__none__')) return false;
    if (view.isExcluded('position', positionValue)) return false;
    if (view.isExcluded('regime', placement.workRegime)) return false;
    if (view.isExcluded('status', gaps(placement).length ? 'incomplete' : 'complete')) return false;
    if (!view.matchesSearch('start', placement.contractStart)) return false;
    if (!view.matchesSearch('end', placement.contractEnd)) return false;
    if (!view.matchesSearch('hours', String(placement.weeklyContractHours))) return false;
    return view.matchesSearch(
      'employee',
      `${placement.displayName} ${contractName.get(placement.contractTypeId) ?? ''} ${jobName.get(positionValue) ?? ''}`
    );
  }

  function sortValue(employee: EmployeeDraft, key: SortKey, contractName: Map<string, string>, jobName: Map<string, string>): string {
    const placement = teamDraft.placement(employee);
    switch (key) {
      case 'employee': return placement.displayName.toLowerCase();
      case 'position': return (jobName.get(placement.jobFunctionIds[0] ?? '') ?? '~').toLowerCase();
      case 'contract': return (contractName.get(placement.contractTypeId) ?? '~').toLowerCase();
      case 'regime': return t(REGIME_LABEL[placement.workRegime] ?? '').toLowerCase();
      case 'start': return placement.contractStart || '9999-99-99';
      case 'end': return placement.contractEnd || '9999-99-99';
      case 'hours': return `${(Number(placement.weeklyContractHours) || 0).toString().padStart(6, '0')}`;
      case 'status': return gaps(placement).length ? '1' : '0';
      default: return jobName.get(placement.jobFunctionIds[0] ?? '') ?? '';
    }
  }
  function ordered(rows: EmployeeDraft[], contractName: Map<string, string>, jobName: Map<string, string>) {
    return view.ordered(rows, (row, key) => sortValue(row, key, contractName, jobName));
  }
  function grouped(rows: EmployeeDraft[], contractName: Map<string, string>, jobName: Map<string, string>): Group[] {
    if (!view.grouping) return [{ key: 'all', label: '', employees: rows }];
    const map = new Map<string, Group>();
    for (const employee of rows) {
      const placement = teamDraft.placement(employee);
      let key = '';
      let label = '';
      if (view.groupBy === 'contract') {
        key = placement.contractTypeId || '__undefined__';
        label = key === '__undefined__' ? t('No contract yet') : contractName.get(key) ?? t('Unknown');
      } else if (view.groupBy === 'position') {
        key = placement.jobFunctionIds[0] ?? '__undefined__';
        label = key === '__undefined__' ? t('No position yet') : jobName.get(key) ?? t('Unknown');
      } else {
        key = gaps(placement).length ? 'incomplete' : 'complete';
        label = t(key === 'complete' ? 'Complete' : 'Incomplete');
      }
      const group = map.get(key) ?? { key, label, employees: [] };
      group.employees.push(employee);
      map.set(key, group);
    }
    return [...map.values()].sort((l, r) => l.key.startsWith('__') ? -1 : r.key.startsWith('__') ? 1 : l.label.localeCompare(r.label));
  }

  const readTeamContext = useClassicTeamContext();
  const team = $derived(readTeamContext());
</script>

<svelte:head><title>{t('Contracts')} &middot; restogogo</title></svelte:head>

{#if team}
{@const filtered = team.employees.filter((employee) => matches(employee, team.contractName, team.jobName))}
    {@const incomplete = filtered.filter((employee) => gaps(employee).length).length}
    {@const groups = grouped(ordered(filtered, team.contractName, team.jobName), team.contractName, team.jobName)}
    {@const contractValues = [{ value: '__none__', label: t('No contract') }, ...[...team.contractName].map(([id, name]) => ({ value: id, label: name }))]}
    {@const positionValues = [{ value: '__none__', label: t('No position') }, ...[...team.jobName].map(([id, name]) => ({ value: id, label: name }))]}
    {@const regimeValues = Object.entries(REGIME_LABEL).map(([value, label]) => ({ value, label: t(label) }))}
    {@const statusValues = [{ value: 'complete', label: t('Complete') }, { value: 'incomplete', label: t('Incomplete') }]}
    {@const contractOptions = [{ value: '', label: t('Not set') }, ...[...team.contractName].map(([id, name]) => ({ value: id, label: name, icon: 'contract' }))]}
    {@const regimeOptions = Object.entries(REGIME_LABEL).map(([value, label]) => ({ value, label: t(label) }))}

    <ClassicTablePanel dirty={team.dirty} saving={team.saving} canSave={team.canSave} onsave={() => void savePage(team.save).catch(() => undefined)} ondiscard={() => discardPage(team.discard)}>
      {#snippet meta()}
        <span><i class="dot"></i>{t('{count} employees', { count: filtered.length })}</span>
        <span><i class="dot is-orange"></i>{t('{count} incomplete', { count: incomplete })}</span>
      {/snippet}
      {#snippet children()}
      <div class="cl-tablewrap">
        <table class="cl-table cl-mobile-rows contract-table">
          <thead>
            <tr>
              <th class="has-menu"><ClassicPrimaryColMenu label={t('Employee')} sortable sortDir={view.sortDir('employee')} onsort={(dir) => view.setSort('employee', dir)} filterKind="text" searchValue={view.search('employee')} onsearch={(value) => view.setSearch('employee', value)} groupValue={view.groupBy} groupOptions={[{ value: 'none', label: t('No grouping') }, { value: 'contract', label: t('Contract type') }, { value: 'position', label: t('Position') }, { value: 'status', label: t('Setup') }]} ongroupchange={(value) => view.setGroupBy(value as GroupBy)} /></th>
              {#if shown('position')}<th class="has-menu"><ClassicColMenu label={t('Position')} sortable sortDir={view.sortDir('position')} onsort={(dir) => view.setSort('position', dir)} filterKind="values" filterValues={positionValues} selected={view.excluded('position')} ontoggle={(value) => view.toggleValue('position', value)} onselectall={(on) => view.selectAll('position', on, positionValues)} /></th>{/if}
              {#if shown('contract')}<th class="has-menu"><ClassicColMenu label={t('Contract')} sortable sortDir={view.sortDir('contract')} onsort={(dir) => view.setSort('contract', dir)} filterKind="values" filterValues={contractValues} selected={view.excluded('contract')} ontoggle={(value) => view.toggleValue('contract', value)} onselectall={(on) => view.selectAll('contract', on, contractValues)} /></th>{/if}
              {#if shown('regime')}<th class="has-menu"><ClassicColMenu label={t('Availability mode')} sortable sortDir={view.sortDir('regime')} onsort={(dir) => view.setSort('regime', dir)} filterKind="values" filterValues={regimeValues} selected={view.excluded('regime')} ontoggle={(value) => view.toggleValue('regime', value)} onselectall={(on) => view.selectAll('regime', on, regimeValues)} /></th>{/if}
              {#if shown('start')}<th class="has-menu"><ClassicColMenu label={t('Start')} sortable sortDir={view.sortDir('start')} onsort={(dir) => view.setSort('start', dir)} filterKind="text" searchValue={view.search('start')} onsearch={(value) => view.setSearch('start', value)} /></th>{/if}
              {#if shown('end')}<th class="has-menu"><ClassicColMenu label={t('End')} sortable sortDir={view.sortDir('end')} onsort={(dir) => view.setSort('end', dir)} filterKind="text" searchValue={view.search('end')} onsearch={(value) => view.setSearch('end', value)} /></th>{/if}
              {#if shown('hours')}<th class="has-menu"><ClassicColMenu label={t('Weekly hours')} align="right" sortable sortDir={view.sortDir('hours')} onsort={(dir) => view.setSort('hours', dir)} filterKind="text" searchValue={view.search('hours')} onsearch={(value) => view.setSearch('hours', value)} /></th>{/if}
              {#if shown('status')}<th class="has-menu"><ClassicColMenu label={t('Setup')} sortable sortDir={view.sortDir('status')} onsort={(dir) => view.setSort('status', dir)} filterKind="values" filterValues={statusValues} selected={view.excluded('status')} ontoggle={(value) => view.toggleValue('status', value)} onselectall={(on) => view.selectAll('status', on, statusValues)} /></th>{/if}
              <th class="chooser-col"><ClassicColChooser columns={view.columns} hidden={view.hidden} ontoggle={view.toggleColumn} /></th>
            </tr>
          </thead>
          {#if !filtered.length}
            <tbody><tr class="cl-mobile-empty"><td colspan={colCount + 1}><div class="cl-empty"><strong>{t('No active employees')}</strong><span>{t('Add someone to define their contract and payroll setup.')}</span></div></td></tr></tbody>
          {:else}
            {#each groups as group (group.key)}
              <tbody>
                {#if view.grouping}
                  {@const groupArea = view.groupBy === 'position' ? positionArea(group.key) : null}
                  {#snippet groupIcon()}
                    {#if groupArea}<WorkspaceAreaIcon icon={groupArea.icon} color={groupArea.color} size={15} compact />{/if}
                  {/snippet}
                  <ClassicGroupRow colspan={colCount + 1} label={group.label} meta={peopleCountLabel(group.employees.length)} icon={groupArea ? groupIcon : undefined} collapsed={view.isCollapsed(group.key)} ontoggle={() => view.toggleGroup(group.key)} />
                {/if}
                {#if !view.isCollapsed(group.key)}
                {#each group.employees as employee (employee.id)}
                  {@const missing = gaps(employee)}
                  {@const linkedArea = positionArea(employee.jobFunctionIds[0] ?? '')}
                  {@const contractCode = workspace.team?.contract_types.find((item) => item.id === employee.contractTypeId)?.code ?? ''}
                  <tr data-employee-id={employee.id} class:is-attention={missing.length > 0}>
                    <td class="cl-mobile-primary">
                      <span class="cl-table__name is-employee">
                        <span class="cl-avatar" style="--avatar-color:{employeeColor.get(employee.id) ?? 'var(--cl-muted)'}">{personInitials(employee.displayName || '?')}</span>
                        <button class="cell-value employee-name" type="button" disabled={!team.canManageOperations || !team.editable} onclick={() => (detailId = employee.id)}>{employee.displayName || t('New employee')}</button>
                      </span>
                      <span class="cl-mobile-summary">
                        <span>{team.contractName.get(employee.contractTypeId) || t('No contract')}</span>
                        <span>{t(REGIME_LABEL[employee.workRegime] ?? employee.workRegime)}</span>
                        {#if missing.length}<span>{t('{count} details missing', { count: missing.length })}</span>{/if}
                      </span>
                    </td>
                    {#if shown('position')}<td>
                      <span class="position-identity" style={`--position-color:${positionColor.get(employee.jobFunctionIds[0] ?? '') ?? 'var(--cl-line-strong)'}`}>
                        {#if linkedArea}
                          <WorkspaceAreaIcon icon={linkedArea.icon} color={linkedArea.color} size={16} compact />
                        {:else}
                          <i aria-hidden="true"></i>
                        {/if}
                        <span>{team.jobName.get(employee.jobFunctionIds[0] ?? '') || t('No position yet')}</span>
                      </span>
                    </td>{/if}
                    {#if shown('contract')}<td>
                      <ClassicPicker
                        value={employee.contractTypeId}
                        options={contractOptions}
                        disabled={!team.editable}
                        ariaLabel={`${t('Contract')} · ${employee.displayName}`}
                        onchange={(next) => updateContractType(employee, next)}
                      />
                    </td>{/if}
                    {#if shown('regime')}<td>
                      <ClassicPicker
                        value={employee.workRegime}
                        options={regimeOptions}
                        disabled={!team.editable}
                        ariaLabel={`${t('Availability mode')} · ${employee.displayName}`}
                        onchange={(next) => teamDraft.update(employee.id, { workRegime: next as EmployeeDraft['workRegime'] })}
                      />
                    </td>{/if}
                    {#if shown('start')}<td><input class="grid-field date-field" aria-label={`${t('Start')} · ${employee.displayName}`} type="date" value={employee.contractStart} disabled={!team.editable} oninput={(event) => teamDraft.update(employee.id, { contractStart: event.currentTarget.value })} /></td>{/if}
                    {#if shown('end')}<td>
                      {#if contractCode === 'CDI'}
                        <ClassicCellBadge label="Open ended" icon="contract" />
                      {:else}
                        <input class="grid-field date-field" aria-label={`${t('End')} · ${employee.displayName}`} type="date" value={employee.contractEnd} disabled={!team.editable} oninput={(event) => teamDraft.update(employee.id, { contractEnd: event.currentTarget.value })} />
                      {/if}
                    </td>{/if}
                    {#if shown('hours')}<td class="is-num"><span class="hours-field"><input class="grid-field" aria-label={`${t('Weekly hours')} · ${employee.displayName}`} type="number" min="0" step="0.25" value={employee.weeklyContractHours || ''} disabled={!team.editable} oninput={(event) => updateHours(employee.id, event.currentTarget.value)} /><span>h</span></span></td>{/if}
                    {#if shown('status')}<td>{#if missing.length}<ClassicCellBadge label={missing.length === 1 ? '1 detail missing' : '{count} details missing'} params={{ count: missing.length }} tone="warning" icon="warning" />{:else}<ClassicCellBadge label="Complete" tone="success" icon="check" />{/if}</td>{/if}
                    <td class="menu-cell"><ClassicRowMenu disabled={!team.editable} items={[{ label: t('Open employee'), onselect: () => (detailId = employee.id) }]} /></td>
                  </tr>
                {/each}
                {/if}
              </tbody>
            {/each}
          {/if}
        </table>
      </div>
      {/snippet}
    </ClassicTablePanel>

    {#if detailId}
      <EmployeeInlineEditor employeeId={detailId} mode="contract" saving={team.saving} onclose={closeDetails} onsave={team.saveEmployee} />
    {/if}

{/if}

<style>
  .contract-table { min-width: 1080px; }
  .employee-name { font-weight: var(--rst-fw-medium); }
  .cell-value { max-width: 230px; display: block; overflow: hidden; padding: 3px 0; border: 0; background: transparent; color: var(--cl-ink); font: inherit; font-size: 13px; line-height: 1.35; text-align: left; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
  .cell-value:hover:not(:disabled) { color: var(--cl-accent); text-decoration: underline; text-underline-offset: 2px; }
  .cell-value:disabled { cursor: default; }
  .position-identity { min-width: 112px; max-width: 190px; display: inline-grid; grid-template-columns: 16px minmax(0, 1fr); align-items: center; gap: 7px; color: var(--cl-ink); font-size: 13px; }
  .position-identity > i { width: 6px; height: 20px; border-radius: 2px; background: var(--position-color); }
  .position-identity > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .grid-field { min-width: 0; width: 100%; min-height: 31px; padding: 4px 7px; border: 1px solid transparent; border-radius: 6px; outline: 0; color: var(--cl-ink); background: transparent; font: inherit; font-size: 12px; font-variant-numeric: tabular-nums; transition: border-color var(--cl-dur) var(--cl-ease), background var(--cl-dur) var(--cl-ease), box-shadow var(--cl-dur) var(--cl-ease); }
  .grid-field:hover:not(:disabled) { border-color: var(--cl-line); background: var(--cl-surface-muted); }
  .grid-field:focus { border-color: var(--cl-accent); background: var(--cl-surface); box-shadow: 0 0 0 2px var(--cl-accent-wash); }
  .grid-field:disabled { color: var(--cl-muted); opacity: 1; }
  .date-field { min-width: 126px; }
  .hours-field { min-width: 74px; display: inline-grid; grid-template-columns: minmax(0, 1fr) 14px; align-items: center; }
  .hours-field .grid-field { text-align: right; }
  .hours-field > span { color: var(--cl-muted); font-size: 11px; }
</style>
