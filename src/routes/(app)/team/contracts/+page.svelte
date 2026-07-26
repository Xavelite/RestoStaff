<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import { personInitials } from '$lib/ui/person';
  import { buildEmployeeColorMap } from '$lib/ui/position-color';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { newEmployeeDraft, type EmployeeDraft } from '$lib/team/team-model';
  import { useClassicTeamContext } from '$lib/classic/classic-workspace-context';
  import ClassicStatus from '$lib/classic/ClassicStatus.svelte';
  import ClassicTablePanel from '$lib/classic/ClassicTablePanel.svelte';
  import ClassicColMenu from '$lib/classic/ClassicColMenu.svelte';
  import ClassicPrimaryColMenu from '$lib/classic/ClassicPrimaryColMenu.svelte';
  import ClassicGroupRow from '$lib/classic/ClassicGroupRow.svelte';
  import ClassicColChooser from '$lib/classic/ClassicColChooser.svelte';
  import EmployeeInlineEditor from '$lib/classic/EmployeeInlineEditor.svelte';
  import { teamDraft } from '$lib/classic/classic-team.svelte';

  type GroupBy = 'contract' | 'position' | 'status' | 'none';
  type Group = { key: string; label: string; employees: EmployeeDraft[] };
  type SortKey = 'employee' | 'position' | 'contract' | 'regime' | 'start' | 'end' | 'hours' | 'status';

  let search = $state('');
  let groupBy = $state<GroupBy>('contract');
  let sort = $state<{ key: SortKey; dir: 'asc' | 'desc' } | null>(null);
  let detailId = $state('');
  let freshId = $state('');
  let excludedContract = $state(new Set<string>());
  let excludedPosition = $state(new Set<string>());
  let excludedStatus = $state(new Set<string>());
  let excludedRegime = $state(new Set<string>());
  let startSearch = $state('');
  let endSearch = $state('');
  let hoursSearch = $state('');
  let collapsedGroups = $state<string[]>([]);
  const contractTypes = $derived(workspace.team?.contract_types.filter((item) => item.active) ?? []);

  const OPTIONAL_COLUMNS = [
    { key: 'position', label: 'Position' },
    { key: 'contract', label: 'Contract' },
    { key: 'regime', label: 'Planning mode' },
    { key: 'start', label: 'Start' },
    { key: 'end', label: 'End' },
    { key: 'hours', label: 'Weekly hours' },
    { key: 'status', label: 'Status' }
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
  const colCount = $derived(2 + OPTIONAL_COLUMNS.filter((column) => shown(column.key)).length);

  const employeeColor = $derived(
    workspace.team
      ? buildEmployeeColorMap(workspace.team.job_functions, workspace.team.employee_job_functions)
      : new Map<string, string>()
  );

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

  async function addEmployee() {
    if (workspace.isPreview || !workspace.team || workspace.effectiveRole !== 'owner') return;
    const draft = newEmployeeDraft(crypto.randomUUID());
    draft.displayName = '';
    teamDraft.employees = [draft, ...teamDraft.employees];
    freshId = draft.id;
    search = '';
    excludedContract = new Set();
    excludedPosition = new Set();
    excludedStatus = new Set();
    excludedRegime = new Set();
    startSearch = '';
    endSearch = '';
    hoursSearch = '';
    await tick();
    document.querySelector<HTMLInputElement>(`[data-employee-id="${draft.id}"] .namefield`)?.focus();
  }

  function setName(employee: EmployeeDraft, value: string) {
    const parts = value.trim().split(/\s+/);
    teamDraft.update(employee.id, {
      displayName: value,
      firstName: employee.firstName || parts[0] || '',
      lastName: employee.lastName || parts.slice(1).join(' ')
    });
  }

  async function savePage(save: () => Promise<void>) {
    await save();
    freshId = '';
  }

  function discardPage(discard: () => void) {
    discard();
    freshId = '';
    detailId = '';
  }

  function closeDetails() {
    detailId = '';
    freshId = '';
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
    const positionValue = employee.jobFunctionIds[0] || '__none__';
    if (excludedContract.has(employee.contractTypeId || '__none__')) return false;
    if (excludedPosition.has(positionValue)) return false;
    if (excludedRegime.has(employee.workRegime)) return false;
    if (excludedStatus.has(gaps(employee).length ? 'incomplete' : 'complete')) return false;
    if (startSearch.trim() && !employee.contractStart.includes(startSearch.trim())) return false;
    if (endSearch.trim() && !employee.contractEnd.includes(endSearch.trim())) return false;
    if (hoursSearch.trim() && !String(employee.weeklyContractHours).includes(hoursSearch.trim())) return false;
    const term = search.trim().toLowerCase();
    if (!employee.active && employee.id !== freshId) return false;
    return !term || `${employee.displayName} ${contractName.get(employee.contractTypeId) ?? ''} ${jobName.get(positionValue) ?? ''}`.toLowerCase().includes(term);
  }

  function sortValue(employee: EmployeeDraft, key: SortKey, contractName: Map<string, string>, jobName: Map<string, string>): string {
    switch (key) {
      case 'employee': return employee.displayName.toLowerCase();
      case 'position': return (jobName.get(employee.jobFunctionIds[0] ?? '') ?? '~').toLowerCase();
      case 'contract': return (contractName.get(employee.contractTypeId) ?? '~').toLowerCase();
      case 'regime': return t(REGIME_LABEL[employee.workRegime] ?? '').toLowerCase();
      case 'start': return employee.contractStart || '9999-99-99';
      case 'end': return employee.contractEnd || '9999-99-99';
      case 'hours': return `${(Number(employee.weeklyContractHours) || 0).toString().padStart(6, '0')}`;
      case 'status': return gaps(employee).length ? '1' : '0';
      default: return jobName.get(employee.jobFunctionIds[0] ?? '') ?? '';
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
      let key = '';
      let label = '';
      if (groupBy === 'contract') {
        key = employee.contractTypeId || '__undefined__';
        label = key === '__undefined__' ? t('No contract yet') : contractName.get(key) ?? t('Unknown');
      } else if (groupBy === 'position') {
        key = employee.jobFunctionIds[0] ?? '__undefined__';
        label = key === '__undefined__' ? t('No position yet') : jobName.get(key) ?? t('Unknown');
      } else {
        key = gaps(employee).length ? 'incomplete' : 'complete';
        label = t(key === 'complete' ? 'Complete' : 'Incomplete');
      }
      const group = map.get(key) ?? { key, label, employees: [] };
      group.employees.push(employee);
      map.set(key, group);
    }
    return [...map.values()].sort((l, r) => l.key.startsWith('__') ? -1 : r.key.startsWith('__') ? 1 : l.label.localeCompare(r.label));
  }
  function setContractType(employee: EmployeeDraft, contractTypeId: string) {
    const code = contractTypes.find((item) => item.id === contractTypeId)?.code;
    teamDraft.update(employee.id, {
      contractTypeId,
      contractEnd: code === 'CDI' ? '' : employee.contractEnd,
      employmentValidTo: code === 'CDI' ? '' : employee.employmentValidTo
    });
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
      {#snippet actions()}
        <button class="cl-btn is-primary" type="button" disabled={workspace.isPreview || workspace.effectiveRole !== 'owner' || !workspace.team} onclick={addEmployee}>
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          <span>{t('Add employee')}</span>
        </button>
      {/snippet}
      {#snippet children()}
      <div class="cl-tablewrap">
        <table class="cl-table contract-table">
          <thead>
            <tr>
              <th class="has-menu"><ClassicPrimaryColMenu label={t('Employee')} sortable sortDir={sort?.key === 'employee' ? sort.dir : null} onsort={(dir) => (sort = { key: 'employee', dir })} filterKind="text" searchValue={search} onsearch={(value) => (search = value)} groupValue={groupBy} groupOptions={[{ value: 'none', label: t('No grouping') }, { value: 'contract', label: t('Contract type') }, { value: 'position', label: t('Position') }, { value: 'status', label: t('Status') }]} ongroupchange={(value) => setGroupBy(value as GroupBy)} /></th>
              {#if shown('position')}<th class="has-menu"><ClassicColMenu label={t('Position')} sortable sortDir={sort?.key === 'position' ? sort.dir : null} onsort={(dir) => (sort = { key: 'position', dir })} filterKind="values" filterValues={positionValues} selected={excludedPosition} ontoggle={(value) => (excludedPosition = toggleExcluded(excludedPosition, value))} onselectall={(on) => (excludedPosition = on ? new Set() : new Set(positionValues.map((item) => item.value)))} /></th>{/if}
              {#if shown('contract')}<th class="has-menu"><ClassicColMenu label={t('Contract')} sortable sortDir={sort?.key === 'contract' ? sort.dir : null} onsort={(dir) => (sort = { key: 'contract', dir })} filterKind="values" filterValues={contractValues} selected={excludedContract} ontoggle={(value) => (excludedContract = toggleExcluded(excludedContract, value))} onselectall={(on) => (excludedContract = on ? new Set() : new Set(contractValues.map((item) => item.value)))} /></th>{/if}
              {#if shown('regime')}<th class="has-menu"><ClassicColMenu label={t('Planning mode')} sortable sortDir={sort?.key === 'regime' ? sort.dir : null} onsort={(dir) => (sort = { key: 'regime', dir })} filterKind="values" filterValues={regimeValues} selected={excludedRegime} ontoggle={(value) => (excludedRegime = toggleExcluded(excludedRegime, value))} onselectall={(on) => (excludedRegime = on ? new Set() : new Set(regimeValues.map((item) => item.value)))} /></th>{/if}
              {#if shown('start')}<th class="has-menu"><ClassicColMenu label={t('Start')} sortable sortDir={sort?.key === 'start' ? sort.dir : null} onsort={(dir) => (sort = { key: 'start', dir })} filterKind="text" searchValue={startSearch} onsearch={(value) => (startSearch = value)} /></th>{/if}
              {#if shown('end')}<th class="has-menu"><ClassicColMenu label={t('End')} sortable sortDir={sort?.key === 'end' ? sort.dir : null} onsort={(dir) => (sort = { key: 'end', dir })} filterKind="text" searchValue={endSearch} onsearch={(value) => (endSearch = value)} /></th>{/if}
              {#if shown('hours')}<th class="has-menu"><ClassicColMenu label={t('Weekly hours')} align="right" sortable sortDir={sort?.key === 'hours' ? sort.dir : null} onsort={(dir) => (sort = { key: 'hours', dir })} filterKind="text" searchValue={hoursSearch} onsearch={(value) => (hoursSearch = value)} /></th>{/if}
              {#if shown('status')}<th class="has-menu"><ClassicColMenu label={t('Status')} sortable sortDir={sort?.key === 'status' ? sort.dir : null} onsort={(dir) => (sort = { key: 'status', dir })} filterKind="values" filterValues={[{ value: 'complete', label: t('Complete') }, { value: 'incomplete', label: t('Incomplete') }]} selected={excludedStatus} ontoggle={(value) => (excludedStatus = toggleExcluded(excludedStatus, value))} onselectall={(on) => (excludedStatus = on ? new Set() : new Set(['complete', 'incomplete']))} /></th>{/if}
              <th class="actions-col">{t('Actions')}</th>
              <th class="chooser-col"><ClassicColChooser columns={OPTIONAL_COLUMNS.map((column) => ({ key: column.key, label: t(column.label) }))} {hidden} ontoggle={toggleColumn} /></th>
            </tr>
          </thead>
          {#if !filtered.length}
            <tbody><tr><td colspan={colCount + 1}><div class="cl-empty"><strong>{t('No active employees')}</strong><span>{t('Add someone to define their contract and payroll setup.')}</span></div></td></tr></tbody>
          {:else}
            {#each groups as group (group.key)}
              <tbody>
                {#if groupBy !== 'none'}<ClassicGroupRow colspan={colCount + 1} label={group.label} meta={t('{count} people', { count: group.employees.length })} collapsed={collapsedGroups.includes(group.key)} ontoggle={() => toggleGroup(group.key)} />{/if}
                {#if !collapsedGroups.includes(group.key)}
                {#each group.employees as employee (employee.id)}
                  {@const missing = gaps(employee)}
                  <tr data-employee-id={employee.id} class:is-attention={missing.length > 0 || employee.id === freshId}>
                    <td>
                      <span class="cl-table__name is-employee">
                        <span class="cl-avatar" style="--avatar-color:{employeeColor.get(employee.id) ?? 'var(--cl-muted)'}">{personInitials(employee.displayName || '?')}</span>
                        {#if employee.id === freshId}
                          <input class="cl-field namefield" placeholder={t('Full name')} value={employee.displayName} disabled={!team.owner || !team.editable} oninput={(event) => setName(employee, event.currentTarget.value)} />
                        {:else}
                          <span class="employee-name">{employee.displayName || t('New employee')}</span>
                        {/if}
                      </span>
                    </td>
                    {#if shown('position')}<td>{team.jobName.get(employee.jobFunctionIds[0] ?? '') || t('No position yet')}</td>{/if}
                    {#if shown('contract')}<td><select class="cl-field cellfield" value={employee.contractTypeId} disabled={!team.owner || !team.editable} onchange={(event) => setContractType(employee, event.currentTarget.value)}><option value="">{t('Not set')}</option>{#each contractTypes as item (item.id)}<option value={item.id}>{item.name}</option>{/each}</select></td>{/if}
                    {#if shown('regime')}<td><select class="cl-field cellfield regime" value={employee.workRegime} disabled={!team.owner || !team.editable} onchange={(event) => teamDraft.update(employee.id, { workRegime: event.currentTarget.value as EmployeeDraft['workRegime'] })}>{#each Object.entries(REGIME_LABEL) as [value, label] (value)}<option value={value}>{t(label)}</option>{/each}</select></td>{/if}
                    {#if shown('start')}<td><input class="cl-field datefield" type="date" value={employee.contractStart} disabled={!team.owner || !team.editable} oninput={(event) => teamDraft.update(employee.id, { contractStart: event.currentTarget.value, employmentValidFrom: employee.employmentValidFrom || event.currentTarget.value })} /></td>{/if}
                    {#if shown('end')}<td><input class="cl-field datefield" type="date" value={employee.contractEnd} disabled={!team.owner || !team.editable || contractTypes.find((item) => item.id === employee.contractTypeId)?.code === 'CDI'} oninput={(event) => teamDraft.update(employee.id, { contractEnd: event.currentTarget.value })} /></td>{/if}
                    {#if shown('hours')}<td class="is-num"><input class="cl-field hoursfield" type="number" min="0" step="0.25" value={employee.weeklyContractHours} disabled={!team.owner || !team.editable} oninput={(event) => teamDraft.update(employee.id, { weeklyContractHours: event.currentTarget.valueAsNumber || 0 })} /></td>{/if}
                    {#if shown('status')}<td>{#if missing.length}<ClassicStatus label={missing.length === 1 ? '1 detail missing' : '{count} details missing'} params={{ count: missing.length }} tone="attention" /><span class="missing">{missing.map((item) => t(item)).join(', ')}</span>{:else}<ClassicStatus label="Complete" tone="ok" />{/if}</td>{/if}
                    <td class="is-num"><button class="cl-btn edit" type="button" disabled={!team.owner || !team.editable} onclick={() => (detailId = employee.id)}>{t('Details')}</button></td>
                    <td class="menu-cell"></td>
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
      <EmployeeInlineEditor employeeId={detailId} mode="contract" saving={team.saving} isNew={detailId === freshId} onclose={closeDetails} onsave={team.saveEmployee} />
    {/if}

{/if}

<style>
  .missing { display: block; color: var(--cl-muted); font-size: 12px; }
  .namefield { min-width: 170px; height: 34px; }
  .employee-name { font-weight: var(--rst-fw-medium); }
  .edit { min-height: 32px; padding: 4px 10px; font-size: 13px; }
  .cellfield, .datefield, .hoursfield { height: 34px; }
  .cellfield { min-width: 132px; }
  .regime { min-width: 160px; }
  .hoursfield { width: 90px; text-align: right; }
  .actions-col, .chooser-col, .menu-cell { width: 44px; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--cl-line-strong); display: inline-block; }
  .dot.is-orange { background: var(--cl-attention); }
</style>
