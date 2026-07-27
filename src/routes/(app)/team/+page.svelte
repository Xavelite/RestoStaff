<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import { buildAreaColorMap, buildEmployeeColorMap, buildPositionColorMap } from '$lib/ui/position-color';
  import { personInitials } from '$lib/ui/person';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import type { EmployeeDraft } from '$lib/team/team-model';
  import { newEmployeeDraft } from '$lib/team/team-model';
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
  import { workspacePositionByKey } from '$lib/restaurant/workspace-catalogue';
  import WorkspaceAreaIcon from '$lib/restaurant/WorkspaceAreaIcon.svelte';

  type SortKey = 'employee' | 'position' | 'email' | 'phone' | 'contract' | 'access' | 'status';
  type GroupBy = 'position' | 'contract' | 'area' | 'status' | 'none';
  type EmployeeGroup = { key: string; label: string; color?: string; employees: EmployeeDraft[] };

  let sort = $state<{ key: SortKey; dir: 'asc' | 'desc' } | null>(null);
  let groupBy = $state<GroupBy>('position');
  let search = $state('');
  let emailSearch = $state('');
  let phoneSearch = $state('');
  let excludedPosition = $state(new Set<string>());
  let excludedContract = $state(new Set<string>());
  let excludedAccess = $state(new Set<string>());
  let excludedStatus = $state(new Set<string>(['archived']));
  let freshId = $state('');
  let detailId = $state('');
  let editingEmployeeId = $state('');
  let editingField = $state<'email' | 'phone' | ''>('');
  let editingValue = $state('');
  let editingInput = $state<HTMLInputElement | null>(null);
  let collapsedGroups = $state<string[]>([]);

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
  const colCount = $derived(1 + OPTIONAL_COLUMNS.filter((column) => shown(column.key)).length);

  const employeeColor = $derived(
    workspace.team
      ? buildEmployeeColorMap(workspace.team.job_functions, workspace.team.employee_job_functions, workspace.restaurant?.work_areas ?? [])
      : new Map<string, string>()
  );
  const positionColor = $derived(
    workspace.team
      ? buildPositionColorMap(workspace.team.job_functions, workspace.restaurant?.work_areas ?? [])
      : new Map<string, string>()
  );

  const restaurantAreaName = $derived(
    new Map((workspace.restaurant?.work_areas ?? []).map((area) => [area.id, area.name]))
  );
  const restaurantAreaColor = $derived(buildAreaColorMap(workspace.restaurant?.work_areas ?? []));

  function positionArea(positionId: string): { icon: string; color: string } | null {
    const relation = (workspace.restaurant?.job_function_areas ?? [])
      .filter((item) => item.active && item.job_function_id === positionId)
      .sort((left, right) => Number(right.is_primary) - Number(left.is_primary))[0];
    const area = workspace.restaurant?.work_areas.find((item) => item.id === relation?.area_id);
    return area
      ? { icon: area.icon_key ?? '', color: area.color ?? 'var(--cl-muted)' }
      : null;
  }

  function setGroupBy(next: GroupBy): void {
    groupBy = next;
    collapsedGroups = [];
  }

  function toggleGroup(key: string): void {
    collapsedGroups = collapsedGroups.includes(key)
      ? collapsedGroups.filter((item) => item !== key)
      : [...collapsedGroups, key];
  }

  function employeeArea(employee: EmployeeDraft): { key: string; label: string; color?: string } {
    const positionId = employee.jobFunctionIds[0] ?? '';
    const position = workspace.restaurant?.job_functions.find((job) => job.id === positionId);
    const areaRelations = (workspace.restaurant?.job_function_areas ?? [])
      .filter((relation) => relation.active && relation.job_function_id === positionId)
      .sort((left, right) => Number(right.is_primary) - Number(left.is_primary));
    const primaryAreaId = areaRelations[0]?.area_id;
    const catalogue = position?.catalogue_key ?? null;
    const allAreasPosition = catalogue
      ? workspacePositionByKey.get(catalogue)?.areaKeys.length === 0
      : false;
    if (!primaryAreaId && allAreasPosition) return { key: '__all_areas__', label: t('All areas') };
    if (!primaryAreaId) return { key: '__no_area__', label: t('No area') };
    return {
      key: primaryAreaId,
      label: restaurantAreaName.get(primaryAreaId) ?? t('Unknown'),
      color: restaurantAreaColor.get(primaryAreaId)
    };
  }

  function peopleCountLabel(count: number): string {
    return count === 1 ? t('1 person') : t('{count} people', { count });
  }

  async function addEmployee() {
    if (workspace.isPreview || !workspace.team) return;
    const draft = newEmployeeDraft(crypto.randomUUID());
    draft.displayName = '';
    teamDraft.employees = [draft, ...teamDraft.employees];
    freshId = draft.id;
    search = '';
    emailSearch = '';
    phoneSearch = '';
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

  function removeDraftEmployee(employeeId: string) {
    if (employeeId !== freshId) return;
    teamDraft.remove(employeeId);
    detailId = '';
    freshId = '';
  }

  async function startInlineEdit(employee: EmployeeDraft, field: 'email' | 'phone') {
    if (!team?.editable) return;
    editingEmployeeId = employee.id;
    editingField = field;
    editingValue = employee[field];
    await tick();
    editingInput?.focus();
    editingInput?.select();
  }

  function commitInlineEdit() {
    if (!editingEmployeeId || !editingField) return;
    const employeeId = editingEmployeeId;
    const field = editingField;
    const value = editingValue.trim();
    editingEmployeeId = '';
    editingField = '';
    editingValue = '';
    if (field === 'email') teamDraft.update(employeeId, { email: value });
    else teamDraft.update(employeeId, { phone: value });
  }

  function cancelInlineEdit() {
    editingEmployeeId = '';
    editingField = '';
    editingValue = '';
  }

  function handleInlineKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitInlineEdit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelInlineEdit();
    }
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
    if (emailSearch.trim() && !employee.email.toLowerCase().includes(emailSearch.trim().toLowerCase())) return false;
    if (phoneSearch.trim() && !employee.phone.toLowerCase().includes(phoneSearch.trim().toLowerCase())) return false;
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
      let key = '';
      let label = '';
      let color: string | undefined;
      if (groupBy === 'position') {
        key = employee.jobFunctionIds[0] ?? '__undefined__';
        label = key === '__undefined__' ? t('No position yet') : jobName.get(key) ?? t('Unknown');
        color = key === '__undefined__' ? undefined : employeeColor.get(employee.id);
      } else if (groupBy === 'contract') {
        key = employee.contractTypeId || '__undefined__';
        label = key === '__undefined__' ? t('No contract yet') : contractName.get(key) ?? t('Unknown');
      } else if (groupBy === 'area') {
        const area = employeeArea(employee);
        key = area.key;
        label = area.label;
        color = area.color;
      } else {
        key = employee.active ? 'active' : 'archived';
        label = t(employee.active ? 'Active' : 'Archived');
      }
      const group = groups.get(key) ?? { key, label, color, employees: [] };
      group.employees.push(employee);
      if (!group.color && color) group.color = color;
      groups.set(key, group);
    }
    return [...groups.values()].sort((left, right) => {
      if (left.key.startsWith('__')) return -1;
      if (right.key.startsWith('__')) return 1;
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

  const accessTone: Record<string, 'success' | 'warning' | 'danger'> = {
    active: 'success',
    disabled: 'danger',
    expired: 'danger',
    invited: 'warning',
    revoked: 'warning',
    not_invited: 'warning'
  };

  const accessIcon = (state: string): 'check' | 'clock' | 'minus' | 'lock' =>
    state === 'active' ? 'check' : state === 'invited' ? 'clock' : state === 'not_invited' ? 'minus' : 'lock';

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
    {@const rosterTotal = team.employees.length}
    {@const activeCount = team.employees.filter((employee) => employee.active).length}
    {@const accessCount = team.employees.filter((employee) => employee.accessState === 'active').length}

    {#if teamDraft.supplementaryError && team.canViewFinancials}
      <div class="cl-notice" role="alert">{teamDraft.supplementaryError}</div>
    {/if}

    <ClassicTablePanel dirty={team.dirty} saving={team.saving} canSave={team.canSave} onsave={() => void savePage(team.save).catch(() => undefined)} ondiscard={() => discardPage(team.discard)}>
      {#snippet meta()}
        <span><i class="dot"></i>{peopleCountLabel(rosterTotal)}</span>
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
                <ClassicPrimaryColMenu
                  label={t('Employee')}
                  sortable
                  sortDir={sort?.key === 'employee' ? sort.dir : null}
                  onsort={(dir) => (sort = { key: 'employee', dir })}
                  filterKind="text"
                  searchValue={search}
                  onsearch={(value) => (search = value)}
                  groupValue={groupBy}
                  groupOptions={[
                    { value: 'none', label: t('No grouping') },
                    { value: 'contract', label: t('Contract type') },
                    { value: 'position', label: t('Position') },
                    { value: 'area', label: t('Area') },
                    { value: 'status', label: t('Status') }
                  ]}
                  ongroupchange={(value) => setGroupBy(value as GroupBy)}
                />
              </th>
              {#if shown('position')}
                <th class="has-menu">
                  <ClassicColMenu label={t('Position')} sortable sortDir={sort?.key === 'position' ? sort.dir : null} onsort={(dir) => (sort = { key: 'position', dir })}
                    filterKind="values" filterValues={positionValues} selected={excludedPosition}
                    ontoggle={(value) => (excludedPosition = toggleExcluded(excludedPosition, value))}
                    onselectall={(on) => (excludedPosition = on ? new Set() : new Set(positionValues.map((item) => item.value)))} />
                </th>
              {/if}
              {#if shown('email')}<th class="has-menu"><ClassicColMenu label={t('Email')} sortable sortDir={sort?.key === 'email' ? sort.dir : null} onsort={(dir) => (sort = { key: 'email', dir })} filterKind="text" searchValue={emailSearch} onsearch={(value) => (emailSearch = value)} /></th>{/if}
              {#if shown('phone')}<th class="has-menu"><ClassicColMenu label={t('Phone')} sortable sortDir={sort?.key === 'phone' ? sort.dir : null} onsort={(dir) => (sort = { key: 'phone', dir })} filterKind="text" searchValue={phoneSearch} onsearch={(value) => (phoneSearch = value)} /></th>{/if}
              {#if shown('contract')}
                <th class="has-menu">
                  <ClassicColMenu label={t('Contract')} sortable sortDir={sort?.key === 'contract' ? sort.dir : null} onsort={(dir) => (sort = { key: 'contract', dir })}
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
              <th class="chooser-col"><ClassicColChooser columns={OPTIONAL_COLUMNS.map((column) => ({ key: column.key, label: t(column.label) }))} {hidden} ontoggle={toggleColumn} /></th>
            </tr>
          </thead>
          {#if !total}
            <tbody><tr><td colspan={colCount + 1}>
              <div class="cl-empty">
                <strong>{t(rosterTotal ? 'No employees match' : 'No active employees')}</strong>
                <span>{t('Change the filter, or add someone to the team.')}</span>
              </div>
            </td></tr></tbody>
          {:else}
            {#each rows as group (group.key)}
              <tbody>
                {#if groupBy !== 'none'}
                  {@const groupArea = groupBy === 'position'
                    ? positionArea(group.key)
                    : groupBy === 'area'
                      ? workspace.restaurant?.work_areas.find((area) => area.id === group.key)
                      : null}
                  {#snippet groupIcon()}
                    {#if groupArea}
                      <WorkspaceAreaIcon icon={'icon' in groupArea ? groupArea.icon : groupArea.icon_key} color={groupArea.color} size={15} compact />
                    {/if}
                  {/snippet}
                  <ClassicGroupRow
                    colspan={colCount + 1}
                    label={group.label}
                    meta={peopleCountLabel(group.employees.length)}
                    color={group.color}
                    icon={groupArea ? groupIcon : undefined}
                    collapsed={collapsedGroups.includes(group.key)}
                    ontoggle={() => toggleGroup(group.key)}
                  />
                {/if}
                {#if !collapsedGroups.includes(group.key)}
                {#each group.employees as employee (employee.id)}
                  {@const primaryPositionArea = positionArea(employee.jobFunctionIds[0] ?? '')}
                  <tr data-employee-id={employee.id} class:is-attention={employee.id === freshId}>
                    <td>
                      <span class="cl-table__name is-employee">
                        <span class="cl-avatar" style="--avatar-color:{employeeColor.get(employee.id) ?? 'var(--cl-muted)'}">{personInitials(employee.displayName || '?')}</span>
                        {#if employee.id === freshId}
                          <input class="cl-field namefield" placeholder={t('Full name')} value={employee.displayName} disabled={!team.editable} oninput={(event) => setName(employee, event.currentTarget.value)} />
                        {:else}
                          <button class="cell-value employee-name" type="button" disabled={!team.editable} onclick={() => (detailId = employee.id)}>
                            {employee.displayName || t('New employee')}
                          </button>
                        {/if}
                      </span>
                    </td>
                    {#if shown('position')}
                      <td>
                        <details class="posmenu">
                          <summary style={`--position-color:${positionColor.get(employee.jobFunctionIds[0] ?? '') ?? 'var(--cl-line-strong)'}`}>
                            {#if primaryPositionArea}
                              <WorkspaceAreaIcon icon={primaryPositionArea.icon} color={primaryPositionArea.color} size={16} compact />
                            {:else}
                              <i aria-hidden="true"></i>
                            {/if}
                            <span>{team.jobName.get(employee.jobFunctionIds[0] ?? '') || t('No position yet')}</span>
                            {#if employee.jobFunctionIds.length > 1}<em>+{employee.jobFunctionIds.length - 1}</em>{/if}
                          </summary>
                          <div class="posmenu__list">
                            {#if team.jobName.size}
                              {#each [...team.jobName] as [id, name] (id)}
                                {@const linkedArea = positionArea(id)}
                                <label>
                                  <input type="checkbox" disabled={!team.editable} checked={employee.jobFunctionIds.includes(id)} onchange={(event) => togglePosition(employee, id, event.currentTarget.checked)} />
                                  {#if linkedArea}
                                    <WorkspaceAreaIcon icon={linkedArea.icon} color={linkedArea.color} size={15} compact />
                                  {:else}
                                    <i style={`--position-color:${positionColor.get(id) ?? 'var(--cl-line-strong)'}`} aria-hidden="true"></i>
                                  {/if}
                                  <span>{name}</span>
                                </label>
                              {/each}
                            {:else}
                              <span>{t('Create positions in Restaurant first.')}</span>
                            {/if}
                          </div>
                        </details>
                      </td>
                    {/if}
                    {#if shown('email')}<td>
                      {#if employee.id === freshId}
                        <input class="cl-field cellfield" type="email" placeholder={t('Email')} value={employee.email} disabled={!team.editable} oninput={(event) => teamDraft.update(employee.id, { email: event.currentTarget.value })} />
                      {:else if editingEmployeeId === employee.id && editingField === 'email'}
                        <input
                          bind:this={editingInput}
                          class="cl-field cellfield inline-editor"
                          type="email"
                          aria-label={`${t('Email')} · ${employee.displayName}`}
                          value={editingValue}
                          oninput={(event) => (editingValue = event.currentTarget.value)}
                          onkeydown={handleInlineKeydown}
                          onblur={commitInlineEdit}
                        />
                      {:else}
                        <button
                          class="inline-cell"
                          class:is-empty={!employee.email}
                          type="button"
                          disabled={!team.editable}
                          aria-label={`${t('Email')} · ${employee.displayName}`}
                          onclick={() => startInlineEdit(employee, 'email')}
                        >
                          <span>{employee.email || t('Add')}</span>
                          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 20 4.3-1 10.8-10.8a2.1 2.1 0 0 0-3-3L5.3 16zM14.8 6.5l3 3" /></svg>
                        </button>
                      {/if}
                    </td>{/if}
                    {#if shown('phone')}<td>
                      {#if employee.id === freshId}
                        <input class="cl-field cellfield phonefield" type="tel" placeholder={t('Phone')} value={employee.phone} disabled={!team.editable} oninput={(event) => teamDraft.update(employee.id, { phone: event.currentTarget.value })} />
                      {:else if editingEmployeeId === employee.id && editingField === 'phone'}
                        <input
                          bind:this={editingInput}
                          class="cl-field cellfield phonefield inline-editor"
                          type="tel"
                          aria-label={`${t('Phone')} · ${employee.displayName}`}
                          value={editingValue}
                          oninput={(event) => (editingValue = event.currentTarget.value)}
                          onkeydown={handleInlineKeydown}
                          onblur={commitInlineEdit}
                        />
                      {:else}
                        <button
                          class="inline-cell"
                          class:is-empty={!employee.phone}
                          type="button"
                          disabled={!team.editable}
                          aria-label={`${t('Phone')} · ${employee.displayName}`}
                          onclick={() => startInlineEdit(employee, 'phone')}
                        >
                          <span>{employee.phone || t('Add')}</span>
                          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 20 4.3-1 10.8-10.8a2.1 2.1 0 0 0-3-3L5.3 16zM14.8 6.5l3 3" /></svg>
                        </button>
                      {/if}
                    </td>{/if}
                    {#if shown('contract')}<td>
                      <label class="contract-select">
                        <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5.2 3.5h6.2l3.4 3.4v9.6H5.2z" /><path d="M11.4 3.5v3.4h3.4M7.7 10h4.8M7.7 13h4.8" /></svg>
                        <select
                          aria-label={`${t('Contract')} · ${employee.displayName}`}
                          value={employee.contractTypeId}
                          disabled={!team.editable}
                          onchange={(event) => teamDraft.update(employee.id, { contractTypeId: event.currentTarget.value })}
                        >
                          <option value="">{t('Not set')}</option>
                          {#each [...team.contractName] as [id, name] (id)}<option value={id}>{name}</option>{/each}
                        </select>
                      </label>
                    </td>{/if}
                    {#if shown('access')}<td><ClassicCellBadge label={ACCESS_LABEL[employee.accessState] ?? employee.accessState} tone={accessTone[employee.accessState] ?? 'warning'} icon={accessIcon(employee.accessState)} /></td>{/if}
                    {#if shown('status')}<td><ClassicCellBadge label={employee.active ? 'Active' : 'Archived'} tone={employee.active ? 'success' : 'warning'} icon={employee.active ? 'check' : 'clock'} /></td>{/if}
                    <td class="menu-cell">
                      <ClassicRowMenu
                        disabled={!team.editable}
                        items={employee.id === freshId
                          ? [{ label: t('Remove'), tone: 'danger', onselect: () => removeDraftEmployee(employee.id) }]
                          : [{ label: t('Open'), onselect: () => (detailId = employee.id) }]}
                      />
                    </td>
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
      <EmployeeInlineEditor employeeId={detailId} mode="people" saving={team.saving} isNew={detailId === freshId} onclose={closeDetails} onsave={team.saveEmployee} />
    {/if}

{/if}

<style>
  .namefield { min-width: 180px; height: 34px; font-weight: var(--rst-fw-medium); }
  .cellfield { min-width: 150px; height: 34px; }
  .phonefield { min-width: 125px; }
  .chooser-col,
  .menu-cell { width: 44px; }
  .cell-value { max-width: 260px; display: block; overflow: hidden; padding: 3px 0; border: 0; background: transparent; color: var(--cl-ink); font: inherit; font-size: 13px; font-weight: var(--rst-fw-regular); line-height: 1.35; text-align: left; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
  .cell-value:hover:not(:disabled) { color: var(--cl-accent); text-decoration: underline; text-underline-offset: 2px; }
  .cell-value:disabled { cursor: default; }
  .cell-value.employee-name { color: var(--cl-ink); font-weight: var(--rst-fw-medium); }
  .inline-cell { max-width: 260px; min-height: 30px; display: inline-flex; align-items: center; gap: 7px; overflow: hidden; margin: -3px -7px; padding: 4px 7px; border: 1px solid transparent; border-radius: 6px; color: var(--cl-muted); background: transparent; font: inherit; font-size: 13px; line-height: 1.35; text-align: left; cursor: text; transition: color var(--cl-dur) var(--cl-ease), border-color var(--cl-dur) var(--cl-ease), background var(--cl-dur) var(--cl-ease); }
  .inline-cell span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .inline-cell svg { flex: 0 0 auto; opacity: 0; transition: opacity var(--cl-dur) var(--cl-ease); }
  .inline-cell:hover:not(:disabled), .inline-cell:focus-visible { border-color: color-mix(in srgb, var(--cl-accent) 22%, var(--cl-line)); color: var(--cl-ink); background: var(--cl-accent-wash); }
  .inline-cell:hover:not(:disabled) svg, .inline-cell:focus-visible svg, .inline-cell.is-empty svg { opacity: .72; }
  .inline-cell.is-empty { color: var(--cl-accent); font-size: 12px; font-weight: var(--rst-fw-medium); }
  .inline-cell:disabled { cursor: default; }
  .inline-editor { border-color: var(--cl-accent); background: var(--cl-surface); box-shadow: 0 0 0 2px var(--cl-accent-wash); }
  .posmenu { position: relative; }
  .posmenu summary { min-width: 118px; max-width: 230px; display: inline-grid; grid-template-columns: 16px minmax(0, 1fr) auto; align-items: center; gap: 7px; list-style: none; padding: 6px 9px; border: 1px solid color-mix(in srgb, var(--position-color) 28%, var(--cl-line)); border-radius: 6px; background: color-mix(in srgb, var(--position-color) 7%, var(--cl-surface)); color: var(--cl-ink); font-size: 13px; cursor: pointer; white-space: nowrap; }
  .posmenu summary:hover { border-color: color-mix(in srgb, var(--position-color) 54%, var(--cl-line)); background: color-mix(in srgb, var(--position-color) 10%, var(--cl-surface)); }
  .posmenu summary > i { width: 7px; height: 20px; border-radius: 2px; background: var(--position-color); }
  .posmenu summary > span { overflow: hidden; text-overflow: ellipsis; }
  .posmenu summary > em { min-width: 18px; height: 18px; display: grid; place-items: center; border: 1px solid color-mix(in srgb, var(--position-color) 30%, var(--cl-line)); border-radius: 999px; color: var(--cl-muted); font-size: 9px; font-style: normal; }
  .posmenu summary::-webkit-details-marker { display: none; }
  .posmenu[open] summary { border-color: color-mix(in srgb, var(--position-color) 66%, var(--cl-line)); background: var(--cl-surface); }
  .posmenu__list { position: absolute; z-index: var(--rst-z-popover, 120); top: calc(100% + 4px); left: 0; display: grid; gap: 6px; min-width: 220px; padding: 10px 12px; border: 1px solid var(--cl-line-strong); border-radius: var(--cl-radius); background: var(--cl-surface); box-shadow: 0 8px 24px rgba(0,0,0,.12); }
  .posmenu__list label { display: grid; grid-template-columns: 15px 16px minmax(0, 1fr); align-items: center; gap: 8px; font-size: 13px; }
  .posmenu__list input { width: 15px; height: 15px; accent-color: var(--cl-accent); }
  .posmenu__list label > i { width: 6px; height: 20px; border-radius: 2px; background: var(--position-color); }
  .contract-select { max-width: 190px; min-height: 30px; display: grid; grid-template-columns: 17px minmax(0, 1fr); align-items: center; gap: 6px; margin: -3px -7px; padding: 3px 6px; border: 1px solid transparent; border-radius: 6px; color: var(--cl-muted); transition: border-color var(--cl-dur) var(--cl-ease), background var(--cl-dur) var(--cl-ease), color var(--cl-dur) var(--cl-ease); }
  .contract-select:hover, .contract-select:focus-within { border-color: color-mix(in srgb, var(--cl-info) 24%, var(--cl-line)); color: var(--cl-info); background: color-mix(in srgb, var(--cl-info) 7%, var(--cl-surface)); }
  .contract-select select { min-width: 0; width: 100%; padding: 2px 20px 2px 0; border: 0; outline: 0; color: var(--cl-ink); background: transparent; font: inherit; font-size: 12px; font-weight: var(--rst-fw-medium); text-overflow: ellipsis; cursor: pointer; }
  .contract-select select:disabled { cursor: default; }
  .posmenu__list > span { color: var(--cl-muted); font-size: 12px; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--cl-line-strong); display: inline-block; }
  .dot.is-green { background: var(--cl-ok); }
  .dot.is-blue { background: var(--cl-info); }
  .is-employee { align-items: flex-start; }
</style>
