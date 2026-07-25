<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import { buildEmployeeColorMap } from '$lib/ui/position-color';
  import { personInitials } from '$lib/ui/person';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import type { EmployeeDraft } from '$lib/team/team-model';
  import { newEmployeeDraft } from '$lib/team/team-model';
  import { useClassicTeamContext } from '$lib/classic/classic-workspace-context';
  import ClassicStatus from '$lib/classic/ClassicStatus.svelte';
  import ClassicTablePanel from '$lib/classic/ClassicTablePanel.svelte';
  import ClassicColMenu from '$lib/classic/ClassicColMenu.svelte';
  import ClassicColChooser from '$lib/classic/ClassicColChooser.svelte';
  import EmployeeInlineEditor from '$lib/classic/EmployeeInlineEditor.svelte';
  import { teamDraft } from '$lib/classic/classic-team.svelte';

  type SortKey = 'employee' | 'position' | 'email' | 'phone' | 'contract' | 'access' | 'status';
  type GroupBy = 'position' | 'contract' | 'none';
  type EmployeeGroup = { key: string; label: string; color?: string; employees: EmployeeDraft[] };

  let sort = $state<{ key: SortKey; dir: 'asc' | 'desc' } | null>(null);
  let groupBy = $state<GroupBy>('position');
  let search = $state('');
  let excludedPosition = $state(new Set<string>());
  let excludedContract = $state(new Set<string>());
  let excludedAccess = $state(new Set<string>());
  let excludedStatus = $state(new Set<string>(['archived']));
  let freshId = $state('');
  let detailId = $state('');
  let dragEmployeeId = $state('');
  let dropGroupKey = $state('');

  const OPTIONAL_COLUMNS = [
    { key: 'position', label: 'Position' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'contract', label: 'Contract' },
    { key: 'access', label: 'App access' },
    { key: 'status', label: 'Status' }
  ] as const;

  const COLS_KEY = 'rst-team-people-cols-v2';
  let hidden = $state(new Set<string>());

  onMount(() => {
    try {
      const raw = localStorage.getItem(COLS_KEY);
      if (raw) hidden = new Set(JSON.parse(raw) as string[]);
    } catch {
      hidden = new Set();
    }
  });

  function setHidden(next: Set<string>) {
    hidden = next;
    try {
      localStorage.setItem(COLS_KEY, JSON.stringify([...next]));
    } catch {
      // ignore devices without local storage
    }
  }

  function toggleColumn(key: string) {
    const next = new Set(hidden);
    next.has(key) ? next.delete(key) : next.add(key);
    const hiding = next.has(key);
    if (hiding && sort?.key === key) sort = null;
    if (key === 'position' && hiding) {
      if (groupBy === 'position') groupBy = 'none';
      excludedPosition = new Set();
    }
    if (key === 'contract' && hiding) {
      if (groupBy === 'contract') groupBy = 'none';
      excludedContract = new Set();
    }
    if (key === 'access' && hiding) excludedAccess = new Set();
    if (key === 'status' && hiding) excludedStatus = new Set();
    setHidden(next);
  }

  const shown = (key: string) => !hidden.has(key);
  const colCount = $derived(2 + OPTIONAL_COLUMNS.filter((column) => shown(column.key)).length);

  const employeeColor = $derived(
    workspace.team
      ? buildEmployeeColorMap(workspace.team.job_functions, workspace.team.employee_job_functions)
      : new Map<string, string>()
  );

  async function addEmployee() {
    if (workspace.isPreview || !workspace.team) return;
    const draft = newEmployeeDraft(crypto.randomUUID());
    draft.displayName = '';
    teamDraft.employees = [draft, ...teamDraft.employees];
    freshId = draft.id;
    search = '';
    excludedPosition = new Set();
    excludedContract = new Set();
    excludedAccess = new Set();
    excludedStatus = new Set(['archived']);
    await tick();
    document.querySelector<HTMLInputElement>(`[data-employee-id="${draft.id}"] .namefield`)?.focus();
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

  function setName(employee: EmployeeDraft, value: string) {
    const patch: Partial<EmployeeDraft> = { displayName: value };
    if (!employee.firstName.trim() && !employee.lastName.trim()) {
      patch.firstName = value.split(' ')[0] ?? '';
      patch.lastName = value.split(' ').slice(1).join(' ');
    }
    teamDraft.update(employee.id, patch);
  }

  function togglePosition(employee: EmployeeDraft, id: string, on: boolean) {
    teamDraft.update(employee.id, {
      jobFunctionIds: on
        ? employee.jobFunctionIds.includes(id)
          ? employee.jobFunctionIds
          : [...employee.jobFunctionIds, id]
        : employee.jobFunctionIds.filter((item) => item !== id)
    });
  }

  function movePrimaryPosition(employee: EmployeeDraft, targetId: string) {
    const next = [targetId, ...employee.jobFunctionIds.filter((id) => id !== targetId)];
    teamDraft.update(employee.id, { jobFunctionIds: next });
  }

  function toggleExcluded(set: Set<string>, value: string): Set<string> {
    const next = new Set(set);
    next.has(value) ? next.delete(value) : next.add(value);
    return next;
  }

  function searchBlob(employee: EmployeeDraft, jobName: Map<string, string>, contractName: Map<string, string>) {
    const positions = employee.jobFunctionIds.map((id) => jobName.get(id) ?? '').join(' ');
    const contract = contractName.get(employee.contractTypeId) ?? '';
    return `${employee.displayName} ${employee.email} ${employee.phone} ${positions} ${contract}`.toLowerCase();
  }

  function matches(employee: EmployeeDraft, jobName: Map<string, string>, contractName: Map<string, string>): boolean {
    if (excludedPosition.has(employee.jobFunctionIds[0] || '__none__')) return false;
    if (excludedContract.has(employee.contractTypeId || '__none__')) return false;
    if (excludedAccess.has(employee.accessState)) return false;
    if (excludedStatus.has(employee.active ? 'active' : 'archived')) return false;
    const term = search.trim().toLowerCase();
    return !term || searchBlob(employee, jobName, contractName).includes(term);
  }

  function sortValue(employee: EmployeeDraft, key: SortKey, jobName: Map<string, string>, contractName: Map<string, string>): string {
    switch (key) {
      case 'employee':
        return employee.displayName.toLowerCase();
      case 'position':
        return (jobName.get(employee.jobFunctionIds[0] ?? '') ?? '~').toLowerCase();
      case 'email':
        return employee.email.toLowerCase();
      case 'phone':
        return employee.phone.toLowerCase();
      case 'contract':
        return (contractName.get(employee.contractTypeId) ?? '~').toLowerCase();
      case 'access':
        return employee.accessState;
      case 'status':
        return employee.active ? '0' : '1';
      default:
        return '';
    }
  }

  function ordered(rows: EmployeeDraft[], jobName: Map<string, string>, contractName: Map<string, string>) {
    if (!sort) return rows;
    const factor = sort.dir === 'desc' ? -1 : 1;
    return [...rows].sort((left, right) => factor * sortValue(left, sort!.key, jobName, contractName).localeCompare(sortValue(right, sort!.key, jobName, contractName)));
  }

  function grouped(rows: EmployeeDraft[], jobName: Map<string, string>, contractName: Map<string, string>): EmployeeGroup[] {
    if (groupBy === 'none') return [{ key: 'all', label: '', employees: rows }];
    const groups = new Map<string, EmployeeGroup>();
    for (const employee of rows) {
      const id = groupBy === 'position' ? employee.jobFunctionIds[0] ?? '' : employee.contractTypeId;
      const label = id
        ? (groupBy === 'position' ? jobName.get(id) : contractName.get(id)) ?? t('Unknown')
        : groupBy === 'position'
          ? t('No position yet')
          : t('No contract yet');
      const key = id || '__undefined__';
      const color = groupBy === 'position' && id ? employeeColor.get(employee.id) : undefined;
      const group = groups.get(key) ?? { key, label, color, employees: [] };
      group.employees.push(employee);
      if (!group.color && color) group.color = color;
      groups.set(key, group);
    }
    return [...groups.values()].sort((left, right) => {
      if (left.key === '__undefined__') return -1;
      if (right.key === '__undefined__') return 1;
      return left.label.localeCompare(right.label);
    });
  }

  const ACCESS_LABEL: Record<string, string> = {
    active: 'Enabled',
    disabled: 'Disabled',
    expired: 'Expired',
    invited: 'Invited',
    revoked: 'Revoked',
    not_invited: 'Not invited'
  };

  const accessTone: Record<string, 'ok' | 'attention' | 'problem'> = {
    active: 'ok',
    disabled: 'problem',
    expired: 'problem',
    invited: 'attention',
    revoked: 'attention',
    not_invited: 'attention'
  };

  function startDrag(employeeId: string) {
    if (groupBy !== 'position') return;
    dragEmployeeId = employeeId;
  }

  function dropIntoPosition(groupKey: string) {
    if (!dragEmployeeId || groupBy !== 'position' || !workspace.team) return;
    const employee = teamDraft.employees.find((item) => item.id === dragEmployeeId);
    if (employee && groupKey && groupKey !== '__undefined__') movePrimaryPosition(employee, groupKey);
    dragEmployeeId = '';
    dropGroupKey = '';
  }

  const readTeamContext = useClassicTeamContext();
  const team = $derived(readTeamContext());
</script>

<svelte:head><title>{t('Team')} &middot; restogogo</title></svelte:head>

{#if team}
{@const filtered = team.employees.filter((employee) => matches(employee, team.jobName, team.contractName))}
    {@const rows = grouped(ordered(filtered, team.jobName, team.contractName), team.jobName, team.contractName)}
    {@const positionValues = [{ value: '__none__', label: t('No position') }, ...[...team.jobName].map(([id, name]) => ({ value: id, label: name }))]}
    {@const contractValues = [{ value: '__none__', label: t('No contract') }, ...[...team.contractName].map(([id, name]) => ({ value: id, label: name }))]}
    {@const accessValues = [...new Set(team.employees.map((employee) => employee.accessState))].map((state) => ({ value: state, label: state.replace('_', ' ') }))}
    {@const total = filtered.length}
    {@const activeCount = filtered.filter((employee) => employee.active).length}
    {@const accessCount = filtered.filter((employee) => employee.accessState === 'active').length}

    {#if teamDraft.supplementaryError && team.owner}
      <div class="cl-notice" role="alert">{teamDraft.supplementaryError}</div>
    {/if}

    <ClassicTablePanel dirty={team.dirty} saving={team.saving} canSave={team.canSave} onsave={() => void savePage(team.save).catch(() => undefined)} ondiscard={() => discardPage(team.discard)}>
      {#snippet meta()}
        <span><i class="dot"></i>{t('{count} people', { count: total })}</span>
        <span><i class="dot is-green"></i>{t('{count} active', { count: activeCount })}</span>
        <span><i class="dot is-blue"></i>{t('{count} with app access', { count: accessCount })}</span>
      {/snippet}
      {#snippet actions()}
        <button class="cl-btn is-primary" type="button" disabled={workspace.isPreview || !workspace.team} onclick={addEmployee}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          <span>{t('Add employee')}</span>
        </button>
      {/snippet}
      {#snippet children()}
      <div class="cl-tablewrap">
        <table class="cl-table people-table">
          <thead>
            <tr>
              <th class="has-menu">
                <ClassicColMenu label={t('Employee')} sortable sortDir={sort?.key === 'employee' ? sort.dir : null} onsort={(dir) => (sort = { key: 'employee', dir })}
                  filterKind="text" searchValue={search} onsearch={(value) => (search = value)} />
              </th>
              {#if shown('position')}
                <th class="has-menu">
                  <ClassicColMenu label={t('Position')} sortable sortDir={sort?.key === 'position' ? sort.dir : null} onsort={(dir) => (sort = { key: 'position', dir })}
                    groupable grouped={groupBy === 'position'} ongroup={(on) => (groupBy = on ? 'position' : 'none')}
                    filterKind="values" filterValues={positionValues} selected={excludedPosition}
                    ontoggle={(value) => (excludedPosition = toggleExcluded(excludedPosition, value))}
                    onselectall={(on) => (excludedPosition = on ? new Set() : new Set(positionValues.map((item) => item.value)))} />
                </th>
              {/if}
              {#if shown('email')}<th class="has-menu"><ClassicColMenu label={t('Email')} sortable sortDir={sort?.key === 'email' ? sort.dir : null} onsort={(dir) => (sort = { key: 'email', dir })} /></th>{/if}
              {#if shown('phone')}<th class="has-menu"><ClassicColMenu label={t('Phone')} sortable sortDir={sort?.key === 'phone' ? sort.dir : null} onsort={(dir) => (sort = { key: 'phone', dir })} /></th>{/if}
              {#if shown('contract')}
                <th class="has-menu">
                  <ClassicColMenu label={t('Contract')} sortable sortDir={sort?.key === 'contract' ? sort.dir : null} onsort={(dir) => (sort = { key: 'contract', dir })}
                    groupable grouped={groupBy === 'contract'} ongroup={(on) => (groupBy = on ? 'contract' : 'none')}
                    filterKind="values" filterValues={contractValues} selected={excludedContract}
                    ontoggle={(value) => (excludedContract = toggleExcluded(excludedContract, value))}
                    onselectall={(on) => (excludedContract = on ? new Set() : new Set(contractValues.map((item) => item.value)))} />
                </th>
              {/if}
              {#if shown('access')}
                <th class="has-menu">
                  <ClassicColMenu label={t('App access')} sortable sortDir={sort?.key === 'access' ? sort.dir : null} onsort={(dir) => (sort = { key: 'access', dir })}
                    filterKind="values" filterValues={accessValues} selected={excludedAccess}
                    ontoggle={(value) => (excludedAccess = toggleExcluded(excludedAccess, value))}
                    onselectall={(on) => (excludedAccess = on ? new Set() : new Set(accessValues.map((item) => item.value)))} />
                </th>
              {/if}
              {#if shown('status')}
                <th class="has-menu">
                  <ClassicColMenu label={t('Status')} sortable sortDir={sort?.key === 'status' ? sort.dir : null} onsort={(dir) => (sort = { key: 'status', dir })}
                    filterKind="values" filterValues={[{ value: 'active', label: t('Active') }, { value: 'archived', label: t('Archived') }]} selected={excludedStatus}
                    ontoggle={(value) => (excludedStatus = toggleExcluded(excludedStatus, value))}
                    onselectall={(on) => (excludedStatus = on ? new Set() : new Set(['active', 'archived']))} />
                </th>
              {/if}
              <th class="actions-col">{t('Actions')}</th>
              <th class="chooser-col"><ClassicColChooser columns={OPTIONAL_COLUMNS.map((column) => ({ key: column.key, label: t(column.label) }))} {hidden} ontoggle={toggleColumn} /></th>
            </tr>
          </thead>
          {#if !total}
            <tbody><tr><td colspan={colCount + 1}><div class="cl-empty"><strong>{t('No employees match')}</strong><span>{t('Change the filter, or add someone to the team.')}</span></div></td></tr></tbody>
          {:else}
            {#each rows as group (group.key)}
              <tbody>
                {#if groupBy !== 'none'}
                  <tr class="cl-group-row dropzone" class:is-drop-target={dropGroupKey === group.key} ondragover={(event) => { if (groupBy === 'position') { event.preventDefault(); dropGroupKey = group.key; } }} ondragleave={() => (dropGroupKey = '')} ondrop={() => dropIntoPosition(group.key)}>
                    <td colspan={colCount + 1}>
                      <span class="groupbadge">{#if group.color}<i class="groupbadge__dot" style={`--group:${group.color}`}></i>{/if}{group.label}</span>
                      <span class="cl-group-row__count">{t('{count} people', { count: group.employees.length })}</span>
                    </td>
                  </tr>
                {/if}
                {#each group.employees as employee (employee.id)}
                  <tr data-employee-id={employee.id} class:is-attention={employee.id === freshId} draggable={groupBy === 'position'} ondragstart={() => startDrag(employee.id)} ondragend={() => { dragEmployeeId = ''; dropGroupKey = ''; }}>
                    <td>
                      <span class="cl-table__name is-employee">
                        <span class="cl-avatar" style="--avatar-color:{employeeColor.get(employee.id) ?? 'var(--cl-muted)'}">{personInitials(employee.displayName || '?')}</span>
                        <input class="cl-field namefield" placeholder={t('Full name')} value={employee.displayName} disabled={!team.editable} oninput={(event) => setName(employee, event.currentTarget.value)} />
                      </span>
                    </td>
                    {#if shown('position')}
                      <td>
                        <details class="posmenu">
                          <summary>{employee.jobFunctionIds.map((id) => team.jobName.get(id)).filter(Boolean).join(', ') || t('No position yet')}</summary>
                          <div class="posmenu__list">
                            {#if team.jobName.size}
                              {#each [...team.jobName] as [id, name] (id)}
                                <label><input type="checkbox" disabled={!team.editable} checked={employee.jobFunctionIds.includes(id)} onchange={(event) => togglePosition(employee, id, event.currentTarget.checked)} />{name}</label>
                              {/each}
                            {:else}
                              <span>{t('Create positions in Restaurant first.')}</span>
                            {/if}
                          </div>
                        </details>
                      </td>
                    {/if}
                    {#if shown('email')}<td><input class="cl-field cellfield" type="email" placeholder={t('Email')} value={employee.email} disabled={!team.editable} oninput={(event) => teamDraft.update(employee.id, { email: event.currentTarget.value })} /></td>{/if}
                    {#if shown('phone')}<td><input class="cl-field cellfield phonefield" type="tel" placeholder={t('Phone')} value={employee.phone} disabled={!team.editable} oninput={(event) => teamDraft.update(employee.id, { phone: event.currentTarget.value })} /></td>{/if}
                    {#if shown('contract')}<td><span class="cl-badge is-neutral">{team.contractName.get(employee.contractTypeId) ?? t('Not set')}</span></td>{/if}
                    {#if shown('access')}<td><ClassicStatus label={ACCESS_LABEL[employee.accessState] ?? employee.accessState} tone={accessTone[employee.accessState] ?? 'attention'} /></td>{/if}
                    {#if shown('status')}<td><ClassicStatus label={employee.active ? 'Active' : 'Archived'} tone={employee.active ? 'ok' : 'attention'} /></td>{/if}
                    <td class="is-num"><button class="cl-btn detail" type="button" disabled={!team.editable} onclick={() => (detailId = employee.id)}>{t('Details')}</button></td>
                    <td class="menu-cell"></td>
                  </tr>
                {/each}
              </tbody>
            {/each}
          {/if}
        </table>
      </div>
      {/snippet}
    </ClassicTablePanel>

    {#if detailId}
      <EmployeeInlineEditor employeeId={detailId} mode="people" saving={team.saving} isNew={detailId === freshId} onclose={closeDetails} onsave={team.saveEmployee} />
    {/if}

{/if}

<style>
  .namefield { min-width: 180px; height: 34px; font-weight: var(--rst-fw-medium); }
  .cellfield { min-width: 150px; height: 34px; }
  .phonefield { min-width: 125px; }
  .chooser-col,
  .menu-cell { width: 44px; }
  .actions-col { width: 90px; }
  .detail { min-height: 32px; padding: 4px 12px; font-size: 13px; }
  .posmenu { position: relative; }
  .posmenu summary { list-style: none; padding: 6px 10px; border: 1px solid transparent; border-radius: var(--cl-radius); color: var(--cl-ink); font-size: 14px; cursor: pointer; white-space: nowrap; }
  .posmenu summary:hover { border-color: var(--cl-line); background: var(--cl-surface-muted); }
  .posmenu summary::-webkit-details-marker { display: none; }
  .posmenu[open] summary { border-color: var(--cl-accent); background: var(--cl-surface); }
  .posmenu__list { position: absolute; z-index: var(--rst-z-popover, 120); top: calc(100% + 4px); left: 0; display: grid; gap: 6px; min-width: 220px; padding: 10px 12px; border: 1px solid var(--cl-line-strong); border-radius: var(--cl-radius); background: var(--cl-surface); box-shadow: 0 8px 24px rgba(0,0,0,.12); }
  .posmenu__list label { display: flex; align-items: center; gap: 8px; font-size: 14px; }
  .posmenu__list input { width: 15px; height: 15px; accent-color: var(--cl-accent); }
  .posmenu__list span { color: var(--cl-muted); font-size: 12px; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--cl-line-strong); display: inline-block; }
  .dot.is-green { background: var(--cl-ok); }
  .dot.is-blue { background: var(--cl-info); }
  .groupbadge { display: inline-flex; align-items: center; gap: 8px; }
  .groupbadge__dot { width: 9px; height: 9px; border-radius: 50%; background: var(--group, var(--cl-accent)); display: inline-block; }
  .dropzone.is-drop-target td { background: color-mix(in srgb, var(--cl-accent) 9%, var(--cl-surface-muted)) !important; }
  .is-employee { align-items: flex-start; }
</style>
