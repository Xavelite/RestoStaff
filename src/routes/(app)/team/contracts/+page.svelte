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
  import EmployeeInlineEditor from '$lib/classic/EmployeeInlineEditor.svelte';
  import { teamDraft } from '$lib/classic/classic-team.svelte';
  import WorkspaceAreaIcon from '$lib/restaurant/WorkspaceAreaIcon.svelte';

  type GroupBy = 'contract' | 'position' | 'status' | 'none';
  type Group = { key: string; label: string; employees: EmployeeDraft[] };
  type SortKey = 'employee' | 'position' | 'contract' | 'regime' | 'start' | 'end' | 'hours' | 'status';

  let search = $state('');
  let groupBy = $state<GroupBy>('contract');
  let sort = $state<{ key: SortKey; dir: 'asc' | 'desc' } | null>(null);
  let detailId = $state('');
  let excludedContract = $state(new Set<string>());
  let excludedPosition = $state(new Set<string>());
  let excludedStatus = $state(new Set<string>());
  let excludedRegime = $state(new Set<string>());
  let startSearch = $state('');
  let endSearch = $state('');
  let hoursSearch = $state('');
  let collapsedGroups = $state<string[]>([]);

  const OPTIONAL_COLUMNS = [
    { key: 'position', label: 'Position' },
    { key: 'contract', label: 'Contract' },
    { key: 'regime', label: 'Planning mode' },
    { key: 'start', label: 'Start' },
    { key: 'end', label: 'End' },
    { key: 'hours', label: 'Weekly hours' },
    { key: 'status', label: 'Setup' }
  ] as const;
  const COLS_KEY = 'rst-team-contract-cols-v2';
  let hidden = $state(new Set<string>());

  onMount(() => {
    try {
      const raw = localStorage.getItem(COLS_KEY);
      if (raw) hidden = new Set(JSON.parse(raw) as string[]);
    } catch {
      hidden = new Set();
    }
  });
  function persistHidden(next: Set<string>) {
    hidden = next;
    try { localStorage.setItem(COLS_KEY, JSON.stringify([...next])); } catch {}
  }
  function toggleColumn(key: string) {
    const next = new Set(hidden);
    next.has(key) ? next.delete(key) : next.add(key);
    const hiding = next.has(key);
    if (hiding && sort?.key === key) sort = null;
    if (key === 'contract' && hiding) {
      if (groupBy === 'contract') groupBy = 'none';
      excludedContract = new Set();
    }
    if (key === 'position' && hiding) {
      if (groupBy === 'position') groupBy = 'none';
      excludedPosition = new Set();
    }
    if (key === 'regime' && hiding) excludedRegime = new Set();
    if (key === 'start' && hiding) startSearch = '';
    if (key === 'end' && hiding) endSearch = '';
    if (key === 'hours' && hiding) hoursSearch = '';
    if (key === 'status' && hiding) excludedStatus = new Set();
    persistHidden(next);
  }
  const shown = (key: string) => !hidden.has(key);
  const colCount = $derived(1 + OPTIONAL_COLUMNS.filter((column) => shown(column.key)).length);

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
      areaColor
    );
    return identity ? { icon: identity.icon, color: identity.color } : null;
  }

  const REGIME_LABEL: Record<string, string> = {
    weekly_availability: 'Weekly availability',
    fixed_schedule: 'Fixed schedule',
    manager_only: 'Manager planned'
  };

  function setGroupBy(next: GroupBy): void {
    groupBy = next;
    collapsedGroups = [];
  }

  function toggleGroup(key: string): void {
    collapsedGroups = collapsedGroups.includes(key)
      ? collapsedGroups.filter((item) => item !== key)
      : [...collapsedGroups, key];
  }

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


  function toggleExcluded(set: Set<string>, value: string): Set<string> {
    const next = new Set(set);
    next.has(value) ? next.delete(value) : next.add(value);
    return next;
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
    if (excludedContract.has(placement.contractTypeId || '__none__')) return false;
    if (excludedPosition.has(positionValue)) return false;
    if (excludedRegime.has(placement.workRegime)) return false;
    if (excludedStatus.has(gaps(placement).length ? 'incomplete' : 'complete')) return false;
    if (startSearch.trim() && !placement.contractStart.includes(startSearch.trim())) return false;
    if (endSearch.trim() && !placement.contractEnd.includes(endSearch.trim())) return false;
    if (hoursSearch.trim() && !String(placement.weeklyContractHours).includes(hoursSearch.trim())) return false;
    const term = search.trim().toLowerCase();
    if (!placement.active) return false;
    return !term || `${placement.displayName} ${contractName.get(placement.contractTypeId) ?? ''} ${jobName.get(positionValue) ?? ''}`.toLowerCase().includes(term);
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
    if (!sort) return rows;
    const factor = sort.dir === 'desc' ? -1 : 1;
    return [...rows].sort((a, b) => factor * sortValue(a, sort!.key, contractName, jobName).localeCompare(sortValue(b, sort!.key, contractName, jobName)));
  }
  function grouped(rows: EmployeeDraft[], contractName: Map<string, string>, jobName: Map<string, string>): Group[] {
    if (groupBy === 'none') return [{ key: 'all', label: '', employees: rows }];
    const map = new Map<string, Group>();
    for (const employee of rows) {
      const placement = teamDraft.placement(employee);
      let key = '';
      let label = '';
      if (groupBy === 'contract') {
        key = placement.contractTypeId || '__undefined__';
        label = key === '__undefined__' ? t('No contract yet') : contractName.get(key) ?? t('Unknown');
      } else if (groupBy === 'position') {
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
  function peopleCountLabel(count: number): string {
    return count === 1 ? t('1 person') : t('{count} people', { count });
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

    <ClassicTablePanel dirty={team.dirty} saving={team.saving} canSave={team.canSave} onsave={() => void savePage(team.save).catch(() => undefined)} ondiscard={() => discardPage(team.discard)}>
      {#snippet meta()}
        <span><i class="dot"></i>{t('{count} employees', { count: filtered.length })}</span>
        <span><i class="dot is-orange"></i>{t('{count} incomplete', { count: incomplete })}</span>
      {/snippet}
      {#snippet children()}
      <div class="cl-tablewrap">
        <table class="cl-table contract-table">
          <thead>
            <tr>
              <th class="has-menu"><ClassicPrimaryColMenu label={t('Employee')} sortable sortDir={sort?.key === 'employee' ? sort.dir : null} onsort={(dir) => (sort = { key: 'employee', dir })} filterKind="text" searchValue={search} onsearch={(value) => (search = value)} groupValue={groupBy} groupOptions={[{ value: 'none', label: t('No grouping') }, { value: 'contract', label: t('Contract type') }, { value: 'position', label: t('Position') }, { value: 'status', label: t('Setup') }]} ongroupchange={(value) => setGroupBy(value as GroupBy)} /></th>
              {#if shown('position')}<th class="has-menu"><ClassicColMenu label={t('Position')} sortable sortDir={sort?.key === 'position' ? sort.dir : null} onsort={(dir) => (sort = { key: 'position', dir })} filterKind="values" filterValues={positionValues} selected={excludedPosition} ontoggle={(value) => (excludedPosition = toggleExcluded(excludedPosition, value))} onselectall={(on) => (excludedPosition = on ? new Set() : new Set(positionValues.map((item) => item.value)))} /></th>{/if}
              {#if shown('contract')}<th class="has-menu"><ClassicColMenu label={t('Contract')} sortable sortDir={sort?.key === 'contract' ? sort.dir : null} onsort={(dir) => (sort = { key: 'contract', dir })} filterKind="values" filterValues={contractValues} selected={excludedContract} ontoggle={(value) => (excludedContract = toggleExcluded(excludedContract, value))} onselectall={(on) => (excludedContract = on ? new Set() : new Set(contractValues.map((item) => item.value)))} /></th>{/if}
              {#if shown('regime')}<th class="has-menu"><ClassicColMenu label={t('Planning mode')} sortable sortDir={sort?.key === 'regime' ? sort.dir : null} onsort={(dir) => (sort = { key: 'regime', dir })} filterKind="values" filterValues={regimeValues} selected={excludedRegime} ontoggle={(value) => (excludedRegime = toggleExcluded(excludedRegime, value))} onselectall={(on) => (excludedRegime = on ? new Set() : new Set(regimeValues.map((item) => item.value)))} /></th>{/if}
              {#if shown('start')}<th class="has-menu"><ClassicColMenu label={t('Start')} sortable sortDir={sort?.key === 'start' ? sort.dir : null} onsort={(dir) => (sort = { key: 'start', dir })} filterKind="text" searchValue={startSearch} onsearch={(value) => (startSearch = value)} /></th>{/if}
              {#if shown('end')}<th class="has-menu"><ClassicColMenu label={t('End')} sortable sortDir={sort?.key === 'end' ? sort.dir : null} onsort={(dir) => (sort = { key: 'end', dir })} filterKind="text" searchValue={endSearch} onsearch={(value) => (endSearch = value)} /></th>{/if}
              {#if shown('hours')}<th class="has-menu"><ClassicColMenu label={t('Weekly hours')} align="right" sortable sortDir={sort?.key === 'hours' ? sort.dir : null} onsort={(dir) => (sort = { key: 'hours', dir })} filterKind="text" searchValue={hoursSearch} onsearch={(value) => (hoursSearch = value)} /></th>{/if}
              {#if shown('status')}<th class="has-menu"><ClassicColMenu label={t('Setup')} sortable sortDir={sort?.key === 'status' ? sort.dir : null} onsort={(dir) => (sort = { key: 'status', dir })} filterKind="values" filterValues={[{ value: 'complete', label: t('Complete') }, { value: 'incomplete', label: t('Incomplete') }]} selected={excludedStatus} ontoggle={(value) => (excludedStatus = toggleExcluded(excludedStatus, value))} onselectall={(on) => (excludedStatus = on ? new Set() : new Set(['complete', 'incomplete']))} /></th>{/if}
              <th class="chooser-col"><ClassicColChooser columns={OPTIONAL_COLUMNS.map((column) => ({ key: column.key, label: t(column.label) }))} {hidden} ontoggle={toggleColumn} /></th>
            </tr>
          </thead>
          {#if !filtered.length}
            <tbody><tr><td colspan={colCount + 1}><div class="cl-empty"><strong>{t('No active employees')}</strong><span>{t('Add someone to define their contract and payroll setup.')}</span></div></td></tr></tbody>
          {:else}
            {#each groups as group (group.key)}
              <tbody>
                {#if groupBy !== 'none'}
                  {@const groupArea = groupBy === 'position' ? positionArea(group.key) : null}
                  {#snippet groupIcon()}
                    {#if groupArea}<WorkspaceAreaIcon icon={groupArea.icon} color={groupArea.color} size={15} compact />{/if}
                  {/snippet}
                  <ClassicGroupRow colspan={colCount + 1} label={group.label} meta={peopleCountLabel(group.employees.length)} icon={groupArea ? groupIcon : undefined} collapsed={collapsedGroups.includes(group.key)} ontoggle={() => toggleGroup(group.key)} />
                {/if}
                {#if !collapsedGroups.includes(group.key)}
                {#each group.employees as employee (employee.id)}
                  {@const missing = gaps(employee)}
                  {@const linkedArea = positionArea(employee.jobFunctionIds[0] ?? '')}
                  {@const contractCode = workspace.team?.contract_types.find((item) => item.id === employee.contractTypeId)?.code ?? ''}
                  <tr data-employee-id={employee.id} class:is-attention={missing.length > 0}>
                    <td>
                      <span class="cl-table__name is-employee">
                        <span class="cl-avatar" style="--avatar-color:{employeeColor.get(employee.id) ?? 'var(--cl-muted)'}">{personInitials(employee.displayName || '?')}</span>
                        <button class="cell-value employee-name" type="button" disabled={!team.canManageOperations || !team.editable} onclick={() => (detailId = employee.id)}>{employee.displayName || t('New employee')}</button>
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
                      <select class="grid-field contract-field" aria-label={`${t('Contract')} · ${employee.displayName}`} value={employee.contractTypeId} disabled={!team.editable} onchange={(event) => updateContractType(employee, event.currentTarget.value)}>
                        <option value="">{t('Not set')}</option>
                        {#each [...team.contractName] as [id, name] (id)}<option value={id}>{name}</option>{/each}
                      </select>
                    </td>{/if}
                    {#if shown('regime')}<td>
                      <select class="grid-field regime-field" aria-label={`${t('Planning mode')} · ${employee.displayName}`} value={employee.workRegime} disabled={!team.editable} onchange={(event) => teamDraft.update(employee.id, { workRegime: event.currentTarget.value as EmployeeDraft['workRegime'] })}>
                        {#each Object.entries(REGIME_LABEL) as [value, label] (value)}<option {value}>{t(label)}</option>{/each}
                      </select>
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
  select.grid-field { cursor: pointer; }
  .contract-field { min-width: 130px; }
  .regime-field { min-width: 150px; }
  .date-field { min-width: 126px; }
  .hours-field { min-width: 74px; display: inline-grid; grid-template-columns: minmax(0, 1fr) 14px; align-items: center; }
  .hours-field .grid-field { text-align: right; }
  .hours-field > span { color: var(--cl-muted); font-size: 11px; }
</style>
