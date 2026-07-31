<script lang="ts">
  import { Mail, Pencil, Phone } from '@lucide/svelte';
  import { onMount, tick } from 'svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import {
    buildAreaColorMap,
    buildEmployeeColorMap,
    buildPositionColorMap,
    linkedAreasForPosition,
    positionAreaVisualIdentity
  } from '$lib/ui/position-color';
  import { personInitials } from '$lib/ui/person';
  import { confirmAction } from '$lib/ui/confirm.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import type { EmployeeDraft } from '$lib/team/team-model';
  import { newEmployeeDraft } from '$lib/team/team-model';
  import { useWorkspaceTeamContext } from '$lib/workspace-ui/workspace-context';
  import EmployeeAccessControl from '$lib/workspace-ui/EmployeeAccessControl.svelte';
  import WorkspaceTablePanel from '$lib/workspace-ui/WorkspaceTablePanel.svelte';
  import WorkspaceColMenu from '$lib/workspace-ui/WorkspaceColMenu.svelte';
  import WorkspacePrimaryColMenu from '$lib/workspace-ui/WorkspacePrimaryColMenu.svelte';
  import WorkspaceGroupRow from '$lib/workspace-ui/WorkspaceGroupRow.svelte';
  import WorkspacePersonCard from '$lib/workspace-ui/WorkspacePersonCard.svelte';
  import WorkspaceCardGrid from '$lib/workspace-ui/WorkspaceCardGrid.svelte';
  import WorkspaceTag from '$lib/workspace-ui/WorkspaceTag.svelte';
  import { ACCESS_LABEL, accessTone } from '$lib/team/access-labels';
  import { workspaceLayout } from '$lib/workspace-ui/workspace-layout.svelte';
  import WorkspaceColChooser from '$lib/workspace-ui/WorkspaceColChooser.svelte';
  import WorkspaceRowMenu from '$lib/workspace-ui/WorkspaceRowMenu.svelte';
  import EmployeeInlineEditor from '$lib/workspace-ui/EmployeeInlineEditor.svelte';
  import WorkspacePicker from '$lib/workspace-ui/WorkspacePicker.svelte';
  import WorkspaceToggle from '$lib/workspace-ui/WorkspaceToggle.svelte';
  import { teamDraft } from '$lib/workspace-ui/workspace-team.svelte';
  import { createTableView, peopleCountLabel } from '$lib/workspace-ui/table-view.svelte';
  import WorkspaceAreaIcon from '$lib/restaurant/WorkspaceAreaIcon.svelte';
  import { areaInstanceLabelMap } from '$lib/restaurant/area-instance';

  type SortKey = 'employee' | 'position' | 'email' | 'phone' | 'contract' | 'access' | 'status';
  type GroupBy = 'position' | 'contract' | 'area' | 'status' | 'none';
  type EmployeeGroup = { key: string; label: string; color?: string; employees: EmployeeDraft[] };

  let detailId = $state('');
  let editingEmployeeId = $state('');
  let editingField = $state<'email' | 'phone' | ''>('');
  let editingValue = $state('');
  let editingInput = $state<HTMLInputElement | null>(null);
  let positionMenuEmployeeId = $state('');
  let positionMenuTrigger = $state<HTMLButtonElement | null>(null);
  let positionMenuElement = $state<HTMLElement | null>(null);
  let positionMenuLeft = $state(0);
  let positionMenuTop = $state(0);

  const OPTIONAL_COLUMNS = [
    { key: 'position', label: 'Position' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'contract', label: 'Contract' },
    { key: 'access', label: 'App access' },
    { key: 'status', label: 'Status' }
  ] as const;

  const view = createTableView<SortKey, GroupBy>({
    storageKey: 'rst-team-people-cols-v2',
    columns: OPTIONAL_COLUMNS,
    defaultGroupBy: 'position',
    defaultExcluded: { status: ['archived'] }
  });
  const shown = view.shown;
  const colCount = $derived(view.colCount + 1);

  onMount(view.restore);

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

  const restaurantAreaName = $derived(
    areaInstanceLabelMap(workspace.restaurant?.work_areas ?? [])
  );
  const restaurantAreaColor = $derived(buildAreaColorMap(workspace.restaurant?.work_areas ?? []));
  const positionMenuEmployee = $derived(
    teamDraft.employees.find((employee) => employee.id === positionMenuEmployeeId) ?? null
  );

  function positionLinkedAreas(positionId: string) {
    return linkedAreasForPosition(
      positionId,
      workspace.restaurant?.work_areas ?? [],
      workspace.restaurant?.job_function_areas ?? []
    );
  }

  function positionArea(positionId: string): { icon: string; color: string } | null {
    const identity = positionAreaVisualIdentity(
      positionId,
      workspace.restaurant?.work_areas ?? [],
      workspace.restaurant?.job_function_areas ?? [],
      restaurantAreaColor,
      positionColor.get(positionId)
    );
    return identity ? { icon: identity.icon, color: identity.color } : null;
  }

  function employeeArea(employee: EmployeeDraft): { key: string; label: string; color?: string } {
    const positionId = employee.jobFunctionIds[0] ?? '';
    const preferredAreaId = employee.jobFunctionAreaIds[positionId] ?? '';
    const linkedAreas = positionLinkedAreas(positionId);
    const linkedAreaIds = new Set(linkedAreas.map((area) => area.id));
    const preferredArea = preferredAreaId
      ? workspace.restaurant?.work_areas.find(
          (area) => area.active && area.id === preferredAreaId
        ) ?? null
      : null;
    const selectedArea =
      preferredArea && (!linkedAreas.length || linkedAreaIds.has(preferredArea.id))
      ? preferredArea
      : linkedAreas.length === 1
        ? linkedAreas[0]
        : null;
    if (selectedArea) {
      return {
        key: selectedArea.id,
        label: restaurantAreaName.get(selectedArea.id) ?? t('Unknown'),
        color: restaurantAreaColor.get(selectedArea.id)
      };
    }
    if (linkedAreas.length > 1) {
      return { key: '__multiple_areas__', label: t('Multiple areas') };
    }
    if (positionId && !linkedAreas.length) {
      return { key: '__all_areas__', label: t('All areas') };
    }
    return {
      key: '__no_area__',
      label: t('No area')
    };
  }

  async function addEmployee() {
    if (workspace.isPreview || !workspace.team) return;
    const draft = newEmployeeDraft(crypto.randomUUID());
    draft.displayName = '';
    teamDraft.add(draft);
    view.resetFilters();
    view.expandAll();
    await tick();
    document.querySelector<HTMLInputElement>(`[data-employee-id="${draft.id}"] .namefield`)?.focus();
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

  function removeDraftEmployee(employeeId: string) {
    if (!teamDraft.isPending(employeeId)) return;
    teamDraft.remove(employeeId);
    detailId = '';
  }

  async function setEmployeeActive(employee: EmployeeDraft, active: boolean): Promise<void> {
    if (!team?.editable) return;
    if (!active) {
      const confirmed = await confirmAction({
        title: t('Archive {name}?', { name: employee.displayName }),
        body: t('They will disappear from new planning. Historical shifts, time entries and documents are preserved.'),
        confirmLabel: t('Archive employee'),
        cancelLabel: t('Keep active'),
        tone: 'danger'
      });
      if (!confirmed) return;
    }
    teamDraft.update(employee.id, { active });
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
    const jobFunctionAreaIds = { ...employee.jobFunctionAreaIds };
    if (!on) delete jobFunctionAreaIds[id];
    teamDraft.update(employee.id, {
      jobFunctionIds: on
        ? employee.jobFunctionIds.includes(id)
          ? employee.jobFunctionIds
          : [...employee.jobFunctionIds, id]
        : employee.jobFunctionIds.filter((item) => item !== id),
      jobFunctionAreaIds
    });
  }

  function areasForPosition(positionId: string) {
    const areas = workspace.restaurant?.work_areas.filter((area) => area.active) ?? [];
    const linked = positionLinkedAreas(positionId);
    return linked.length ? linked : areas;
  }

  function setEmployeePositionArea(
    employee: EmployeeDraft,
    positionId: string,
    areaId: string
  ) {
    const next = { ...employee.jobFunctionAreaIds };
    if (areaId) next[positionId] = areaId;
    else delete next[positionId];
    teamDraft.update(employee.id, { jobFunctionAreaIds: next });
  }

  function preferredAreaName(employee: EmployeeDraft, positionId: string): string {
    const areaId = employee.jobFunctionAreaIds[positionId] ?? '';
    return areaId ? restaurantAreaName.get(areaId) ?? '' : '';
  }

  function positionEmployeeMenu() {
    if (!positionMenuTrigger) return;
    const triggerRect = positionMenuTrigger.getBoundingClientRect();
    const width = positionMenuElement?.offsetWidth || 340;
    const height = positionMenuElement?.offsetHeight || 260;
    const roomBelow = window.innerHeight - triggerRect.bottom;
    positionMenuLeft = Math.max(
      12,
      Math.min(triggerRect.left, window.innerWidth - width - 12)
    );
    positionMenuTop =
      roomBelow >= height + 12
        ? triggerRect.bottom + 5
        : Math.max(12, triggerRect.top - height - 5);
  }

  async function togglePositionMenu(
    employeeId: string,
    trigger: HTMLButtonElement
  ) {
    if (positionMenuEmployeeId === employeeId) {
      closePositionMenu(true);
      return;
    }
    positionMenuEmployeeId = employeeId;
    positionMenuTrigger = trigger;
    await tick();
    positionEmployeeMenu();
    positionMenuElement
      ?.querySelector<HTMLElement>('input:not(:disabled), select:not(:disabled)')
      ?.focus();
  }

  function closePositionMenu(returnFocus = false) {
    if (!positionMenuEmployeeId) return;
    const trigger = positionMenuTrigger;
    positionMenuEmployeeId = '';
    positionMenuElement = null;
    positionMenuTrigger = null;
    if (returnFocus) void tick().then(() => trigger?.focus());
  }

  function handlePositionMenuKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    closePositionMenu(true);
  }

  $effect(() => {
    if (!positionMenuEmployeeId) return;
    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        positionMenuElement?.contains(target) ||
        positionMenuTrigger?.contains(target)
      ) {
        return;
      }
      closePositionMenu();
    };
    const onReposition = () => positionEmployeeMenu();
    window.addEventListener('click', onDocumentClick, true);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('click', onDocumentClick, true);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  });

  function searchBlob(employee: EmployeeDraft, jobName: Map<string, string>, contractName: Map<string, string>) {
    const positions = employee.jobFunctionIds.map((id) => jobName.get(id) ?? '').join(' ');
    const contract = contractName.get(employee.contractTypeId) ?? '';
    return `${employee.displayName} ${employee.email} ${employee.phone} ${positions} ${contract}`.toLowerCase();
  }

  function matches(employee: EmployeeDraft, jobName: Map<string, string>, contractName: Map<string, string>): boolean {
    const placement = teamDraft.placement(employee);
    if (view.isExcluded('position', placement.jobFunctionIds[0] || '__none__')) return false;
    if (view.isExcluded('contract', placement.contractTypeId || '__none__')) return false;
    if (view.isExcluded('access', placement.accessState)) return false;
    if (view.isExcluded('status', placement.active ? 'active' : 'archived')) return false;
    if (!view.matchesSearch('email', placement.email)) return false;
    if (!view.matchesSearch('phone', placement.phone)) return false;
    return view.matchesSearch('employee', searchBlob(placement, jobName, contractName));
  }

  function sortValue(employee: EmployeeDraft, key: SortKey, jobName: Map<string, string>, contractName: Map<string, string>): string {
    const placement = teamDraft.placement(employee);
    switch (key) {
      case 'employee':
        return placement.displayName.toLowerCase();
      case 'position':
        return (jobName.get(placement.jobFunctionIds[0] ?? '') ?? '~').toLowerCase();
      case 'email':
        return placement.email.toLowerCase();
      case 'phone':
        return placement.phone.toLowerCase();
      case 'contract':
        return (contractName.get(placement.contractTypeId) ?? '~').toLowerCase();
      case 'access':
        return placement.accessState;
      case 'status':
        return placement.active ? '0' : '1';
      default:
        return '';
    }
  }

  function ordered(rows: EmployeeDraft[], jobName: Map<string, string>, contractName: Map<string, string>) {
    return view.ordered(rows, (employee, key) => sortValue(employee, key, jobName, contractName));
  }

  function grouped(rows: EmployeeDraft[], jobName: Map<string, string>, contractName: Map<string, string>): EmployeeGroup[] {
    if (!view.grouping) return [{ key: 'all', label: '', employees: rows }];
    const groups = new Map<string, EmployeeGroup>();
    for (const employee of rows) {
      const placement = teamDraft.placement(employee);
      let key = '';
      let label = '';
      let color: string | undefined;
      if (view.groupBy === 'position') {
        key = placement.jobFunctionIds[0] ?? '__undefined__';
        label = key === '__undefined__' ? t('No position yet') : jobName.get(key) ?? t('Unknown');
        color = key === '__undefined__' ? undefined : employeeColor.get(employee.id);
      } else if (view.groupBy === 'contract') {
        key = placement.contractTypeId || '__undefined__';
        label = key === '__undefined__' ? t('No contract yet') : contractName.get(key) ?? t('Unknown');
      } else if (view.groupBy === 'area') {
        const area = employeeArea(placement);
        key = area.key;
        label = area.label;
        color = area.color;
      } else {
        key = placement.active ? 'active' : 'archived';
        label = t(placement.active ? 'Active' : 'Archived');
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

  const readTeamContext = useWorkspaceTeamContext();
  const team = $derived(readTeamContext());
</script>

<svelte:head><title>{t('Team')} &middot; restogogo</title></svelte:head>

{#if team}
{@const filtered = team.employees.filter((employee) => matches(employee, team.jobName, team.contractName))}
    {@const rows = grouped(ordered(filtered, team.jobName, team.contractName), team.jobName, team.contractName)}
    {@const positionValues = [{ value: '__none__', label: t('No position') }, ...[...team.jobName].map(([id, name]) => ({ value: id, label: name }))]}
    {@const contractValues = [{ value: '__none__', label: t('No contract') }, ...[...team.contractName].map(([id, name]) => ({ value: id, label: name }))]}
    {@const accessValues = [...new Set(team.employees.map((employee) => employee.accessState))].map((state) => ({ value: state, label: state.replace('_', ' ') }))}
    {@const statusValues = [{ value: 'active', label: t('Active') }, { value: 'archived', label: t('Archived') }]}
    {@const contractOptions = [{ value: '', label: t('Not set') }, ...[...team.contractName].map(([id, name]) => ({ value: id, label: name, icon: 'contract' }))]}
    {@const total = filtered.length}
    {@const rosterTotal = team.employees.length}
    {@const activeCount = team.employees.filter((employee) => employee.active).length}
    {@const accessCount = team.employees.filter((employee) => employee.accessState === 'active').length}

    {#if teamDraft.supplementaryError && team.canViewFinancials}
      <div class="cl-notice" role="alert">{teamDraft.supplementaryError}</div>
    {/if}

    <WorkspaceTablePanel dirty={team.dirty} saving={team.saving} canSave={team.canSave} onsave={() => void savePage(team.save).catch(() => undefined)} ondiscard={() => discardPage(team.discard)}>
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
      {#if workspaceLayout.cards}
        <!-- People are a directory, not records: faces lead, the position colour
             groups them, and the one dot says whether they can actually sign in.
             Contact detail stays in the row layout and the employee editor,
             which is where anyone reading an address is already headed. -->
        <WorkspaceCardGrid>
          {#each rows as group (group.key)}
            {#each group.employees as employee (employee.id)}
              {@const contract = team.contractName.get(employee.contractTypeId)}
              <WorkspacePersonCard
                name={employee.displayName || t('New employee')}
                accent={employeeColor.get(employee.id) ?? null}
                roles={employee.jobFunctionIds.length
                  ? employee.jobFunctionIds.map((id) => ({
                      label: team.jobName.get(id) ?? t('No position yet'),
                      color: positionColor.get(id) ?? null
                    }))
                  : [{ label: t('No position yet'), color: null }]}
                statusLabel={employee.active ? t('Active') : t('Archived')}
                statusTone={employee.active ? 'ok' : 'neutral'}
                details={[
                  { kind: 'mail' as const, value: employee.email || t('No email'), muted: !employee.email },
                  { kind: 'phone' as const, value: employee.phone || t('No phone'), muted: !employee.phone }
                ]}
                dimmed={!employee.active}
                onactivate={team.editable ? () => (detailId = employee.id) : null}
              >
                {#snippet tags()}
                  <WorkspaceTag label={contract || t('No contract')} tone={contract ? 'neutral' : 'warn'} />
                  <WorkspaceTag
                    label={t(ACCESS_LABEL[employee.accessState] ?? employee.accessState)}
                    tone={accessTone(employee.accessState)}
                  />
                {/snippet}
              </WorkspacePersonCard>
            {/each}
          {/each}
        </WorkspaceCardGrid>
      {:else}
      <div class="cl-tablewrap">
        <table class="cl-table cl-mobile-rows people-table">
          <thead>
            <tr>
              <th class="has-menu">
                <WorkspacePrimaryColMenu
                  label={t('Employee')}
                  sortable
                  sortDir={view.sortDir('employee')}
                  onsort={(dir) => view.setSort('employee', dir)}
                  filterKind="text"
                  searchValue={view.search('employee')}
                  onsearch={(value) => view.setSearch('employee', value)}
                  groupValue={view.groupBy}
                  groupOptions={[
                    { value: 'none', label: t('No grouping') },
                    { value: 'contract', label: t('Contract type') },
                    { value: 'position', label: t('Position') },
                    { value: 'area', label: t('Area') },
                    { value: 'status', label: t('Status') }
                  ]}
                  ongroupchange={(value) => view.setGroupBy(value as GroupBy)}
                />
              </th>
              {#if shown('position')}
                <th class="has-menu">
                  <WorkspaceColMenu label={t('Position')} sortable sortDir={view.sortDir('position')} onsort={(dir) => view.setSort('position', dir)}
                    filterKind="values" filterValues={positionValues} selected={view.excluded('position')}
                    ontoggle={(value) => view.toggleValue('position', value)}
                    onselectall={(on) => view.selectAll('position', on, positionValues)} />
                </th>
              {/if}
              {#if shown('email')}<th class="has-menu"><WorkspaceColMenu label={t('Email')} sortable sortDir={view.sortDir('email')} onsort={(dir) => view.setSort('email', dir)} filterKind="text" searchValue={view.search('email')} onsearch={(value) => view.setSearch('email', value)} /></th>{/if}
              {#if shown('phone')}<th class="has-menu"><WorkspaceColMenu label={t('Phone')} sortable sortDir={view.sortDir('phone')} onsort={(dir) => view.setSort('phone', dir)} filterKind="text" searchValue={view.search('phone')} onsearch={(value) => view.setSearch('phone', value)} /></th>{/if}
              {#if shown('contract')}
                <th class="has-menu">
                  <WorkspaceColMenu label={t('Contract')} sortable sortDir={view.sortDir('contract')} onsort={(dir) => view.setSort('contract', dir)}
                    filterKind="values" filterValues={contractValues} selected={view.excluded('contract')}
                    ontoggle={(value) => view.toggleValue('contract', value)}
                    onselectall={(on) => view.selectAll('contract', on, contractValues)} />
                </th>
              {/if}
              {#if shown('access')}
                <th class="has-menu">
                  <WorkspaceColMenu label={t('App access')} sortable sortDir={view.sortDir('access')} onsort={(dir) => view.setSort('access', dir)}
                    filterKind="values" filterValues={accessValues} selected={view.excluded('access')}
                    ontoggle={(value) => view.toggleValue('access', value)}
                    onselectall={(on) => view.selectAll('access', on, accessValues)} />
                </th>
              {/if}
              {#if shown('status')}
                <th class="has-menu">
                  <WorkspaceColMenu label={t('Status')} sortable sortDir={view.sortDir('status')} onsort={(dir) => view.setSort('status', dir)}
                    filterKind="values" filterValues={statusValues} selected={view.excluded('status')}
                    ontoggle={(value) => view.toggleValue('status', value)}
                    onselectall={(on) => view.selectAll('status', on, statusValues)} />
                </th>
              {/if}
              <th class="chooser-col"><WorkspaceColChooser columns={view.columns} hidden={view.hidden} ontoggle={view.toggleColumn} /></th>
            </tr>
          </thead>
          {#if !total}
            <tbody><tr class="cl-mobile-empty"><td colspan={colCount}>
              <div class="cl-empty">
                <strong>{t(rosterTotal ? 'No employees match' : 'No active employees')}</strong>
                <span>{t('Change the filter, or add someone to the team.')}</span>
              </div>
            </td></tr></tbody>
          {:else}
            {#each rows as group (group.key)}
              <tbody>
                {#if view.grouping}
                  {@const groupArea = view.groupBy === 'position'
                    ? positionArea(group.key)
                    : view.groupBy === 'area'
                      ? workspace.restaurant?.work_areas.find((area) => area.id === group.key)
                      : null}
                  {#snippet groupIcon()}
                    {#if groupArea}
                      <WorkspaceAreaIcon icon={'icon' in groupArea ? groupArea.icon : groupArea.icon_key} color={groupArea.color} size={15} compact />
                    {/if}
                  {/snippet}
                  <WorkspaceGroupRow
                    colspan={colCount}
                    label={group.label}
                    meta={peopleCountLabel(group.employees.length)}
                    color={group.color}
                    icon={groupArea ? groupIcon : undefined}
                    collapsed={view.isCollapsed(group.key)}
                    ontoggle={() => view.toggleGroup(group.key)}
                  />
                {/if}
                {#if !view.isCollapsed(group.key)}
                {#each group.employees as employee (employee.id)}
                  {@const primaryPositionArea = positionArea(employee.jobFunctionIds[0] ?? '')}
                  {@const isFresh = teamDraft.isPending(employee.id)}
                  <tr data-employee-id={employee.id} class:is-new={isFresh}>
                    <td class="cl-mobile-primary">
                      <span class="cl-table__name is-employee">
                        <span class="cl-avatar" style="--avatar-color:{employeeColor.get(employee.id) ?? 'var(--cl-muted)'}">{personInitials(employee.displayName || '?')}</span>
                        {#if isFresh}
                          <input class="cl-field namefield" placeholder={t('Full name')} value={employee.displayName} disabled={!team.editable} oninput={(event) => setName(employee, event.currentTarget.value)} />
                        {:else}
                          <button class="cell-value employee-name" type="button" disabled={!team.editable} onclick={() => (detailId = employee.id)}>
                            {employee.displayName || t('New employee')}
                          </button>
                        {/if}
                      </span>
                      <span class="cl-mobile-summary">
                        <span>{team.jobName.get(employee.jobFunctionIds[0] ?? '') || t('No position yet')}</span>
                        <span>{team.contractName.get(employee.contractTypeId) || t('No contract')}</span>
                        {#if employee.email}<span class="contact-summary"><Mail size={12} aria-hidden="true" />{employee.email}</span>{/if}
                      </span>
                    </td>
                    {#if shown('position')}
                      <td>
                        <button
                          class="posmenu__trigger"
                          style={`--position-color:${positionColor.get(employee.jobFunctionIds[0] ?? '') ?? 'var(--cl-line-strong)'}`}
                          type="button"
                          disabled={!team.editable}
                          title={team.jobName.get(employee.jobFunctionIds[0] ?? '') || t('No position yet')}
                          aria-label={`${t('Position')} · ${employee.displayName}`}
                          aria-haspopup="dialog"
                          aria-expanded={positionMenuEmployeeId === employee.id}
                          onclick={(event) =>
                            void togglePositionMenu(employee.id, event.currentTarget)}
                        >
                          {#if primaryPositionArea}
                            <WorkspaceAreaIcon icon={primaryPositionArea.icon} color={primaryPositionArea.color} size={16} compact />
                          {:else}
                            <i aria-hidden="true"></i>
                          {/if}
                          <span>
                            {team.jobName.get(employee.jobFunctionIds[0] ?? '') || t('No position yet')}
                            {#if preferredAreaName(employee, employee.jobFunctionIds[0] ?? '')}
                              <small>{preferredAreaName(employee, employee.jobFunctionIds[0] ?? '')}</small>
                            {/if}
                          </span>
                          {#if employee.jobFunctionIds.length > 1}<em>+{employee.jobFunctionIds.length - 1}</em>{/if}
                        </button>
                      </td>
                    {/if}
                    {#if shown('email')}<td>
                      {#if isFresh}
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
                          <Mail size={13} aria-hidden="true" />
                          <span>{employee.email || t('Add')}</span>
                          {#if !employee.email}<Pencil size={12} aria-hidden="true" />{/if}
                        </button>
                      {/if}
                    </td>{/if}
                    {#if shown('phone')}<td>
                      {#if isFresh}
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
                          <Phone size={13} aria-hidden="true" />
                          <span>{employee.phone || t('Add')}</span>
                          {#if !employee.phone}<Pencil size={12} aria-hidden="true" />{/if}
                        </button>
                      {/if}
                    </td>{/if}
                    {#if shown('contract')}<td>
                      <WorkspacePicker
                        value={employee.contractTypeId}
                        options={contractOptions}
                        disabled={!team.editable}
                        ariaLabel={`${t('Contract')} · ${employee.displayName}`}
                        onchange={(next) => teamDraft.update(employee.id, { contractTypeId: next })}
                      />
                    </td>{/if}
                    {#if shown('access')}<td class="action-cell"><EmployeeAccessControl {employee} disabled={!team.editable || team.dirty || isFresh} /></td>{/if}
                    {#if shown('status')}<td>
                      <WorkspaceToggle
                        checked={employee.active}
                        label={employee.active ? 'Active' : 'Archived'}
                        disabled={!team.editable || isFresh}
                        onchange={(active) => void setEmployeeActive(employee, active)}
                      />
                    </td>{/if}
                    <td class="menu-cell">
                      <WorkspaceRowMenu
                        disabled={!team.editable}
                        items={isFresh
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
      {/if}
      {/snippet}
    </WorkspaceTablePanel>

    {#if positionMenuEmployee}
      <div
        bind:this={positionMenuElement}
        class="posmenu__list"
        style={`left:${positionMenuLeft}px;top:${positionMenuTop}px`}
        role="dialog"
        tabindex="-1"
        aria-label={`${t('Positions')} · ${positionMenuEmployee.displayName}`}
        onkeydown={handlePositionMenuKeydown}
      >
        <div class="posmenu__head">
          <span>
            <strong>{t('Positions')}</strong>
            <small>{positionMenuEmployee.displayName}</small>
          </span>
          <button type="button" aria-label={t('Close')} onclick={() => closePositionMenu(true)}>×</button>
        </div>
        {#if team.jobName.size}
          {#each [...team.jobName] as [id, name] (id)}
            {@const linkedArea = positionArea(id)}
            {@const positionSelected = positionMenuEmployee.jobFunctionIds.includes(id)}
            {@const compatibleAreas = areasForPosition(id)}
            <div class="posmenu__option" class:is-selected={positionSelected}>
              <label>
                <input
                  type="checkbox"
                  disabled={!team.editable}
                  checked={positionSelected}
                  onchange={(event) =>
                    togglePosition(
                      positionMenuEmployee,
                      id,
                      event.currentTarget.checked
                    )}
                />
                {#if linkedArea}
                  <WorkspaceAreaIcon icon={linkedArea.icon} color={linkedArea.color} size={15} compact />
                {:else}
                  <i style={`--position-color:${positionColor.get(id) ?? 'var(--cl-line-strong)'}`} aria-hidden="true"></i>
                {/if}
                <span>{name}</span>
              </label>
              {#if positionSelected && compatibleAreas.length}
                <WorkspacePicker
                  value={positionMenuEmployee.jobFunctionAreaIds[id] ?? ''}
                  options={[
                    { value: '', label: t('Any linked area') },
                    ...compatibleAreas.map((area) => ({
                      value: area.id,
                      label: restaurantAreaName.get(area.id) ?? area.name,
                      color: restaurantAreaColor.get(area.id),
                      icon: area.icon_key ?? ''
                    }))
                  ]}
                  disabled={!team.editable}
                  ariaLabel={`${t('Preferred area')} · ${name}`}
                  onchange={(next) => setEmployeePositionArea(positionMenuEmployee, id, next)}
                />
              {/if}
            </div>
          {/each}
        {:else}
          <span class="posmenu__empty">{t('Create positions in Restaurant first.')}</span>
        {/if}
      </div>
    {/if}

    {#if detailId}
      <EmployeeInlineEditor employeeId={detailId} mode="people" saving={team.saving} isNew={teamDraft.isPending(detailId)} onclose={closeDetails} onsave={team.saveEmployee} />
    {/if}

{/if}

<style>
  .namefield { min-width: 180px; height: 34px; font-weight: var(--rst-fw-medium); }
  .cellfield { min-width: 150px; height: 34px; }
  .phonefield { min-width: 125px; }
  .cell-value { max-width: 260px; display: block; overflow: hidden; padding: 3px 0; border: 0; background: transparent; color: var(--cl-ink); font: inherit; font-size: var(--rst-fs-body); font-weight: var(--rst-fw-regular); line-height: 1.35; text-align: left; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
  .cell-value:hover:not(:disabled) { color: var(--cl-accent); text-decoration: underline; text-underline-offset: 2px; }
  .cell-value:disabled { cursor: default; }
  .cell-value.employee-name { color: var(--cl-ink); font-weight: var(--rst-fw-medium); }
  .inline-cell { max-width: 260px; min-height: 30px; display: inline-flex; align-items: center; gap: 7px; overflow: hidden; margin: -3px -7px; padding: 4px 7px; border: 1px solid transparent; border-radius: 6px; color: var(--cl-muted); background: transparent; font: inherit; font-size: var(--rst-fs-body); line-height: 1.35; text-align: left; cursor: text; transition: color var(--cl-dur) var(--cl-ease), border-color var(--cl-dur) var(--cl-ease), background var(--cl-dur) var(--cl-ease); }
  .inline-cell span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .inline-cell:hover:not(:disabled), .inline-cell:focus-visible { border-color: color-mix(in srgb, var(--cl-accent) 22%, var(--cl-line)); color: var(--cl-ink); background: var(--cl-accent-wash); }
  .inline-cell.is-empty { color: var(--cl-accent); font-size: var(--rst-fs-control); font-weight: var(--rst-fw-medium); }
  .inline-cell:disabled { cursor: default; }
  .inline-cell :global(svg) { flex: 0 0 auto; color: var(--cl-accent); }
  .contact-summary { display: inline-flex; align-items: center; gap: 4px; }
  .contact-summary :global(svg) { flex: 0 0 auto; color: var(--cl-accent); }
  .action-cell { padding: 0 !important; }
  .inline-editor { border-color: var(--cl-accent); background: var(--cl-surface); box-shadow: 0 0 0 2px var(--cl-accent-wash); }
  .posmenu__trigger { min-width: 170px; max-width: 230px; display: inline-grid; grid-template-columns: 16px minmax(0, 1fr) auto; align-items: center; gap: 7px; padding: 6px 9px; border: 1px solid color-mix(in srgb, var(--position-color) 28%, var(--cl-line)); border-radius: 6px; background: color-mix(in srgb, var(--position-color) 7%, var(--cl-surface)); color: var(--cl-ink); font: inherit; font-size: var(--rst-fs-body); text-align: left; cursor: pointer; white-space: nowrap; }
  .posmenu__trigger:hover:not(:disabled), .posmenu__trigger[aria-expanded='true'] { border-color: color-mix(in srgb, var(--position-color) 60%, var(--cl-line)); background: color-mix(in srgb, var(--position-color) 10%, var(--cl-surface)); }
  .posmenu__trigger:focus-visible { outline: 2px solid color-mix(in srgb, var(--cl-accent) 42%, transparent); outline-offset: 2px; }
  .posmenu__trigger:disabled { cursor: default; }
  .posmenu__trigger > i { width: 7px; height: 20px; border-radius: 2px; background: var(--position-color); }
  .posmenu__trigger > span { display: grid; overflow: hidden; text-overflow: ellipsis; }
  .posmenu__trigger > span small { overflow: hidden; color: var(--cl-muted); font-size: var(--rst-fs-micro); font-weight: var(--rst-fw-regular); text-overflow: ellipsis; }
  .posmenu__trigger > em { min-width: 18px; height: 18px; display: grid; place-items: center; border: 1px solid color-mix(in srgb, var(--position-color) 30%, var(--cl-line)); border-radius: 999px; color: var(--cl-muted); font-size: var(--rst-fs-micro); font-style: normal; }
  .posmenu__list { position: fixed; z-index: 460; display: grid; gap: 6px; width: min(340px, calc(100vw - 24px)); max-height: min(420px, calc(100vh - 24px)); overflow: auto; padding: 8px 10px 10px; border: 1px solid var(--cl-line-strong); border-radius: var(--cl-radius); background: var(--cl-surface); box-shadow: 0 14px 36px rgba(15,23,42,.16); }
  .posmenu__head { position: sticky; top: -8px; z-index: 2; display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: -2px -4px 2px; padding: 8px 8px 9px; border-bottom: 1px solid var(--cl-line); background: var(--cl-surface); }
  .posmenu__head > span { display: grid; gap: 1px; }
  .posmenu__head strong { color: var(--cl-ink); font-size: var(--rst-fs-control); }
  .posmenu__head small { color: var(--cl-muted); font-size: var(--rst-fs-caption); }
  .posmenu__head button { width: 26px; height: 26px; display: grid; place-items: center; padding: 0; border: 1px solid transparent; border-radius: 5px; color: var(--cl-muted); background: transparent; font: inherit; font-size: var(--rst-fs-title); cursor: pointer; }
  .posmenu__head button:hover { border-color: var(--cl-line); color: var(--cl-ink); background: var(--cl-soft); }
  .posmenu__option { display: grid; grid-template-columns: minmax(125px, 1fr) minmax(130px, .9fr); align-items: center; gap: 8px; padding: 5px 6px; border-radius: 5px; }
  .posmenu__option.is-selected { background: var(--cl-accent-wash); }
  .posmenu__list label { display: grid; grid-template-columns: 15px 16px minmax(0, 1fr); align-items: center; gap: 8px; font-size: var(--rst-fs-body); }
  .posmenu__list input { width: 15px; height: 15px; accent-color: var(--cl-accent); }
  .posmenu__list label > i { width: 6px; height: 20px; border-radius: 2px; background: var(--position-color); }
  .posmenu__empty { padding: 8px; color: var(--cl-muted); font-size: var(--rst-fs-control); }
  .is-employee { align-items: flex-start; }
</style>
