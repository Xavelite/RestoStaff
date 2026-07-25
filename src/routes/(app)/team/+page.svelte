<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import { buildEmployeeColorMap } from '$lib/ui/position-color';
  import { personInitials } from '$lib/ui/person';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import type { EmployeeDraft } from '$lib/team/team-model';
  import { newEmployeeDraft } from '$lib/team/team-model';
  import ClassicStatus from '$lib/classic/ClassicStatus.svelte';
  import ClassicTeamPage from '$lib/classic/ClassicTeamPage.svelte';
  import ClassicColMenu from '$lib/classic/ClassicColMenu.svelte';
  import ClassicColChooser from '$lib/classic/ClassicColChooser.svelte';
  import EmployeeInlineEditor from '$lib/classic/EmployeeInlineEditor.svelte';
  import { teamDraft } from '$lib/classic/classic-team.svelte';

  type SortKey = 'name' | 'position' | 'email' | 'phone' | 'contract' | 'access' | 'active';
  type EmployeeGroup = { key: string; label: string; employees: EmployeeDraft[] };

  // The header is the toolbar: sort/group/filter each live in a column's own
  // menu, so there is no filter strip. Filters are stored as the set of EXCLUDED
  // values (empty = show all), which lets "unselect everything" mean "show none".
  let sort = $state<{ key: SortKey; dir: 'asc' | 'desc' } | null>(null);
  let groupBy = $state<'position' | 'contract' | 'none'>('position');
  let search = $state('');
  let excludedPosition = $state(new Set<string>());
  let excludedContract = $state(new Set<string>());
  let excludedAccess = $state(new Set<string>());
  let excludedActive = $state(new Set<string>(['archived']));
  let freshId = $state('');
  let detailId = $state('');

  // Optional columns, remembered per device. Name is always shown.
  const OPTIONAL_COLUMNS = [
    { key: 'position', label: 'Position' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'contract', label: 'Contract' },
    { key: 'access', label: 'Access' },
    { key: 'active', label: 'Active' }
  ] as const;
  let hidden = $state(new Set<string>());
  const COLS_KEY = 'rst-team-people-cols';
  onMount(() => {
    try {
      const raw = localStorage.getItem(COLS_KEY);
      if (raw) hidden = new Set(JSON.parse(raw) as string[]);
    } catch {
      hidden = new Set();
    }
  });
  function toggleColumn(key: string) {
    const next = new Set(hidden);
    next.has(key) ? next.delete(key) : next.add(key);
    hidden = next;
    try {
      localStorage.setItem(COLS_KEY, JSON.stringify([...next]));
    } catch {
      // A device that refuses storage still toggles for this session.
    }
  }
  const shown = (key: string) => !hidden.has(key);
  const colCount = $derived(2 + OPTIONAL_COLUMNS.filter((column) => shown(column.key)).length);

  const employeeColor = $derived(
    workspace.team
      ? buildEmployeeColorMap(workspace.team.job_functions, workspace.team.employee_job_functions)
      : new Map<string, string>()
  );

  // Grouping by position uses the SAVED primary position, not the row being
  // edited — so changing someone's position does not yank their row into another
  // group mid-edit; it moves only once you Save (which refreshes this map).
  const savedPrimary = $derived.by(() => {
    const map = new Map<string, string>();
    for (const link of workspace.team?.employee_job_functions ?? []) {
      if (link.active === false) continue;
      if (link.is_primary || !map.has(link.employee_id)) map.set(link.employee_id, link.job_function_id);
    }
    return map;
  });

  function addEmployee() {
    if (workspace.isPreview || !workspace.team) return;
    // A blank row drops in at the top, edited inline; click again for another.
    // Blank rows are dropped on save, so adding several and filling a few is fine.
    const draft = newEmployeeDraft(crypto.randomUUID());
    draft.displayName = '';
    teamDraft.employees = [draft, ...teamDraft.employees];
    freshId = draft.id;
    search = '';
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
        ? [...new Set([...employee.jobFunctionIds, id])]
        : employee.jobFunctionIds.filter((item) => item !== id)
    });
  }

  function toggleExcluded(set: Set<string>, value: string): Set<string> {
    const next = new Set(set);
    next.has(value) ? next.delete(value) : next.add(value);
    return next;
  }

  function matches(employee: EmployeeDraft, jobName: Map<string, string>, contractName: Map<string, string>): boolean {
    if (employee.id === freshId) return true;
    const positionValue = employee.jobFunctionIds[0] || '__none__';
    if (excludedPosition.has(positionValue)) return false;
    if (excludedContract.has(employee.contractTypeId || '__none__')) return false;
    if (excludedAccess.has(employee.accessState)) return false;
    if (excludedActive.has(employee.active ? 'active' : 'archived')) return false;
    const term = search.trim().toLowerCase();
    if (!term) return true;
    const positions = employee.jobFunctionIds.map((id) => jobName.get(id) ?? '').join(' ');
    const contract = contractName.get(employee.contractTypeId) ?? '';
    return `${employee.displayName} ${employee.email} ${employee.phone} ${positions} ${contract}`
      .toLowerCase()
      .includes(term);
  }

  function sortValue(employee: EmployeeDraft, key: SortKey, jobName: Map<string, string>, contractName: Map<string, string>): string {
    switch (key) {
      case 'name': return employee.displayName.toLowerCase();
      case 'position': return (jobName.get(employee.jobFunctionIds[0] ?? '') ?? '~').toLowerCase();
      case 'email': return employee.email.toLowerCase();
      case 'phone': return employee.phone.toLowerCase();
      case 'contract': return (contractName.get(employee.contractTypeId) ?? '~').toLowerCase();
      case 'access': return employee.accessState;
      case 'active': return employee.active ? '0' : '1';
      default: return '';
    }
  }

  function ordered(rows: EmployeeDraft[], jobName: Map<string, string>, contractName: Map<string, string>): EmployeeDraft[] {
    if (!sort) return rows;
    const factor = sort.dir === 'desc' ? -1 : 1;
    return [...rows].sort(
      (left, right) => factor * sortValue(left, sort!.key, jobName, contractName).localeCompare(sortValue(right, sort!.key, jobName, contractName))
    );
  }

  function grouped(rows: EmployeeDraft[], jobName: Map<string, string>, contractName: Map<string, string>): EmployeeGroup[] {
    if (groupBy === 'none') return [{ key: 'all', label: '', employees: rows }];
    const groups = new Map<string, EmployeeGroup>();
    for (const employee of rows) {
      const id = groupBy === 'position' ? savedPrimary.get(employee.id) ?? '' : employee.contractTypeId;
      const label = id
        ? (groupBy === 'position' ? jobName.get(id) : contractName.get(id)) ?? t('Unknown')
        : groupBy === 'position'
          ? t('No position yet')
          : t('No contract yet');
      const key = id || '__undefined__';
      const group = groups.get(key) ?? { key, label, employees: [] };
      group.employees.push(employee);
      groups.set(key, group);
    }
    return [...groups.values()].sort((left, right) => {
      if (left.key === '__undefined__') return -1;
      if (right.key === '__undefined__') return 1;
      return left.label.localeCompare(right.label);
    });
  }

  const accessTone: Record<string, 'ok' | 'attention' | 'problem'> = {
    active: 'ok',
    disabled: 'problem',
    expired: 'problem',
    invited: 'attention',
    revoked: 'attention',
    not_invited: 'attention'
  };
</script>

<svelte:head><title>{t('Team')} &middot; restogogo</title></svelte:head>

<ClassicTeamPage>
  {#snippet children(team)}
    {@const rows = grouped(ordered(team.employees.filter((employee) => matches(employee, team.jobName, team.contractName)), team.jobName, team.contractName), team.jobName, team.contractName)}
    {@const positionValues = [{ value: '__none__', label: t('No position') }, ...[...team.jobName].map(([id, name]) => ({ value: id, label: name }))]}
    {@const contractValues = [{ value: '__none__', label: t('No contract') }, ...[...team.contractName].map(([id, name]) => ({ value: id, label: name }))]}
    {@const accessValues = [...new Set(team.employees.map((employee) => employee.accessState))].map((state) => ({ value: state, label: state.replace('_', ' ') }))}
    {@const total = rows.reduce((sum, group) => sum + group.employees.length, 0)}

    {#if teamDraft.supplementaryError && team.owner}
      <div class="cl-notice" role="alert">{teamDraft.supplementaryError}</div>
    {/if}

    <div class="cl-tablewrap">
      <table class="cl-table">
        <thead>
          <tr>
            <th class="has-menu">
              <ClassicColMenu label={t('Name')} sortable sortDir={sort?.key === 'name' ? sort.dir : null} onsort={(dir) => (sort = { key: 'name', dir })}
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
            {#if shown('email')}
              <th class="has-menu"><ClassicColMenu label={t('Email')} sortable sortDir={sort?.key === 'email' ? sort.dir : null} onsort={(dir) => (sort = { key: 'email', dir })} /></th>
            {/if}
            {#if shown('phone')}
              <th class="has-menu"><ClassicColMenu label={t('Phone')} sortable sortDir={sort?.key === 'phone' ? sort.dir : null} onsort={(dir) => (sort = { key: 'phone', dir })} /></th>
            {/if}
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
                <ClassicColMenu label={t('Access')} sortable sortDir={sort?.key === 'access' ? sort.dir : null} onsort={(dir) => (sort = { key: 'access', dir })}
                  filterKind="values" filterValues={accessValues} selected={excludedAccess}
                  ontoggle={(value) => (excludedAccess = toggleExcluded(excludedAccess, value))}
                  onselectall={(on) => (excludedAccess = on ? new Set() : new Set(accessValues.map((item) => item.value)))} />
              </th>
            {/if}
            {#if shown('active')}
              <th class="has-menu">
                <ClassicColMenu label={t('Active')} sortable sortDir={sort?.key === 'active' ? sort.dir : null} onsort={(dir) => (sort = { key: 'active', dir })}
                  filterKind="values" filterValues={[{ value: 'active', label: t('Active') }, { value: 'archived', label: t('Archived') }]} selected={excludedActive}
                  ontoggle={(value) => (excludedActive = toggleExcluded(excludedActive, value))}
                  onselectall={(on) => (excludedActive = on ? new Set() : new Set(['active', 'archived']))} />
              </th>
            {/if}
            <th class="chooser-col"><ClassicColChooser columns={OPTIONAL_COLUMNS.map((column) => ({ key: column.key, label: t(column.label) }))} {hidden} ontoggle={toggleColumn} /></th>
          </tr>
        </thead>
        <tbody>
          <tr class="cl-addrow">
            <td colspan={colCount}>
              <button type="button" disabled={workspace.isPreview || !workspace.team} onclick={addEmployee}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                {t('Add employee')}
              </button>
            </td>
          </tr>
        </tbody>
        {#if !total}
          <tbody><tr><td colspan={colCount}><div class="cl-empty"><strong>{t('No employees match')}</strong><span>{t('Change the filter, or add someone to the team.')}</span></div></td></tr></tbody>
        {:else}
          {#each rows as group (group.key)}
            <tbody>
              {#if groupBy !== 'none'}
                <tr class="cl-group-row"><td colspan={colCount}>{group.label}<span class="cl-group-row__count">{t('{count} people', { count: group.employees.length })}</span></td></tr>
              {/if}
              {#each group.employees as employee (employee.id)}
                <tr class:is-attention={employee.id === freshId}>
                  <td>
                    <span class="cl-table__name">
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
                  {#if shown('contract')}<td class="is-quiet">{team.contractName.get(employee.contractTypeId) ?? '—'}</td>{/if}
                  {#if shown('access')}<td><ClassicStatus label={employee.accessState.replace('_', ' ')} tone={accessTone[employee.accessState] ?? 'attention'} /></td>{/if}
                  {#if shown('active')}<td><label class="switch"><input type="checkbox" disabled={!team.editable} checked={employee.active} onchange={(event) => teamDraft.update(employee.id, { active: event.currentTarget.checked })} /><span>{t(employee.active ? 'Active' : 'Archived')}</span></label></td>{/if}
                  <td class="is-num"><button class="cl-btn detail" type="button" disabled={!team.editable} onclick={() => (detailId = employee.id)}>{t('Details')}</button></td>
                </tr>
              {/each}
            </tbody>
          {/each}
        {/if}
      </table>
    </div>

    {#if detailId}
      <EmployeeInlineEditor employeeId={detailId} mode="people" saving={team.saving} isNew={detailId === freshId} onclose={closeDetails} onsave={team.saveEmployee} />
    {/if}
  {/snippet}
</ClassicTeamPage>

<style>
  .namefield { min-width: 140px; height: 34px; }
  .cellfield { min-width: 150px; height: 34px; }
  .phonefield { min-width: 125px; }
  .chooser-col { width: 44px; }
  .switch { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; }
  .switch input { width: 16px; height: 16px; accent-color: var(--cl-accent); }
  .detail { min-height: 30px; padding: 4px 10px; font-size: 13px; }
  .posmenu { position: relative; }
  .posmenu summary { list-style: none; padding: 6px 10px; border: 1px solid transparent; border-radius: var(--cl-radius); color: var(--cl-ink); font-size: 14px; cursor: pointer; white-space: nowrap; }
  .posmenu summary:hover { border-color: var(--cl-line); background: var(--cl-surface-muted); }
  .posmenu summary::-webkit-details-marker { display: none; }
  .posmenu[open] summary { border-color: var(--cl-accent); background: var(--cl-surface); }
  .posmenu__list { position: absolute; z-index: var(--rst-z-popover, 120); top: calc(100% + 4px); left: 0; display: grid; gap: 6px; min-width: 200px; padding: 10px 12px; border: 1px solid var(--cl-line-strong); border-radius: var(--cl-radius); background: var(--cl-surface); box-shadow: 0 8px 24px rgba(0,0,0,.12); }
  .posmenu__list label { display: flex; align-items: center; gap: 8px; font-size: 14px; }
  .posmenu__list input { width: 15px; height: 15px; accent-color: var(--cl-accent); }
  .posmenu__list span { color: var(--cl-muted); font-size: 12px; }
</style>
