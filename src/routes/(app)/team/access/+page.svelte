<script lang="ts">
  import { Pencil } from '@lucide/svelte';
  import { onMount, tick } from 'svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import { personInitials } from '$lib/ui/person';
  import { buildEmployeeColorMap } from '$lib/ui/position-color';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import type { EmployeeDraft } from '$lib/team/team-model';
  import { useWorkspaceTeamContext } from '$lib/workspace-ui/workspace-context';
  import WorkspaceCellBadge from '$lib/workspace-ui/WorkspaceCellBadge.svelte';
  import WorkspaceTablePanel from '$lib/workspace-ui/WorkspaceTablePanel.svelte';
  import WorkspaceCard from '$lib/workspace-ui/WorkspaceCard.svelte';
  import WorkspaceCardGrid from '$lib/workspace-ui/WorkspaceCardGrid.svelte';
  import { workspaceLayout } from '$lib/workspace-ui/workspace-layout.svelte';
  import WorkspaceColMenu from '$lib/workspace-ui/WorkspaceColMenu.svelte';
  import WorkspacePrimaryColMenu from '$lib/workspace-ui/WorkspacePrimaryColMenu.svelte';
  import WorkspaceGroupRow from '$lib/workspace-ui/WorkspaceGroupRow.svelte';
  import WorkspaceColChooser from '$lib/workspace-ui/WorkspaceColChooser.svelte';
  import EmployeeInlineEditor from '$lib/workspace-ui/EmployeeInlineEditor.svelte';
  import EmployeeAccessControl from '$lib/workspace-ui/EmployeeAccessControl.svelte';
  import { teamDraft } from '$lib/workspace-ui/workspace-team.svelte';
  import { createTableView, peopleCountLabel } from '$lib/workspace-ui/table-view.svelte';

  type GroupBy = 'status' | 'role' | 'none';
  type SortKey = 'name' | 'email' | 'role' | 'pin' | 'status';
  type Group = { key: string; label: string; employees: EmployeeDraft[] };

  let detailId = $state('');
  let editingEmployeeId = $state('');
  let editingValue = $state('');
  let editingInput = $state<HTMLInputElement | null>(null);

  const OPTIONAL_COLUMNS = [
    { key: 'email', label: 'Email' },
    { key: 'role', label: 'Role' },
    { key: 'pin', label: 'Badge PIN' },
    { key: 'status', label: 'Status' }
  ] as const;
  const view = createTableView<SortKey, GroupBy>({
    storageKey: 'rst-team-access-cols-v2',
    columns: OPTIONAL_COLUMNS,
    defaultGroupBy: 'status'
  });
  const shown = view.shown;
  const colCount = $derived(view.colCount + 1);

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

  const ACCESS_LABEL: Record<string, string> = {
    active: 'Enabled',
    disabled: 'Disabled',
    invited: 'Invited',
    expired: 'Invitation expired',
    revoked: 'Invitation revoked',
    not_invited: 'Not invited'
  };

  onMount(view.restore);

  function matches(employee: EmployeeDraft) {
    const placement = teamDraft.placement(employee);
    if (!placement.active || view.isExcluded('status', placement.accessState)) return false;
    if (view.isExcluded('role', placement.accessRole || '__none__')) return false;
    if (view.isExcluded('pin', placement.pinStatus || '__none__')) return false;
    if (!view.matchesSearch('email', placement.email)) return false;
    return view.matchesSearch(
      'name',
      `${placement.displayName} ${placement.email} ${placement.accessRole} ${placement.accessState}`
    );
  }
  function sortValue(employee: EmployeeDraft, key: SortKey) {
    const placement = teamDraft.placement(employee);
    if (key === 'name') return placement.displayName.toLowerCase();
    if (key === 'email') return placement.email.toLowerCase();
    if (key === 'role') return placement.accessRole.toLowerCase();
    if (key === 'pin') return placement.pinStatus;
    return placement.accessState;
  }
  function ordered(rows: EmployeeDraft[]) {
    return view.ordered(rows, sortValue);
  }
  function grouped(rows: EmployeeDraft[]): Group[] {
    if (!view.grouping) return [{ key: 'all', label: '', employees: rows }];
    const map = new Map<string, Group>();
    for (const employee of rows) {
      const placement = teamDraft.placement(employee);
      const key = view.groupBy === 'status' ? placement.accessState : placement.accessRole || '__undefined__';
      const label = view.groupBy === 'status'
        ? t(ACCESS_LABEL[placement.accessState] ?? placement.accessState)
        : key === '__undefined__'
          ? t('No role')
          : key === 'manager'
            ? t('Manager')
            : t('Employee');
      const group = map.get(key) ?? { key, label, employees: [] };
      group.employees.push(employee);
      map.set(key, group);
    }
    return [...map.values()].sort((a, b) => a.key === '__undefined__' ? -1 : b.key === '__undefined__' ? 1 : a.label.localeCompare(b.label));
  }

  function roleLabel(role: string): string {
    if (role === 'manager') return 'Manager';
    if (role === 'employee') return 'Employee';
    return '—';
  }

  async function startEmailEdit(employee: EmployeeDraft): Promise<void> {
    if (!team?.editable) return;
    editingEmployeeId = employee.id;
    editingValue = employee.email;
    await tick();
    editingInput?.focus();
    editingInput?.select();
  }

  function commitEmailEdit(): void {
    if (!editingEmployeeId) return;
    const id = editingEmployeeId;
    const email = editingValue.trim();
    editingEmployeeId = '';
    editingValue = '';
    teamDraft.update(id, { email });
  }

  function cancelEmailEdit(): void {
    editingEmployeeId = '';
    editingValue = '';
  }

  function handleEmailKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitEmailEdit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelEmailEdit();
    }
  }

  const readTeamContext = useWorkspaceTeamContext();
  const team = $derived(readTeamContext());
</script>

<svelte:head><title>{t('Access')} &middot; restogogo</title></svelte:head>

{#if team}
{@const filtered = team.employees.filter(matches)}
    {@const groups = grouped(ordered(filtered))}
    {@const accessValues = [...new Set(team.employees.filter((employee) => employee.active).map((employee) => employee.accessState))].map((value) => ({ value, label: t(ACCESS_LABEL[value] ?? value) }))}
    {@const roleValues = [{ value: '__none__', label: t('No role') }, { value: 'manager', label: t('Manager') }, { value: 'employee', label: t('Employee') }]}
    {@const pinValues = [...new Set(team.employees.filter((employee) => employee.active).map((employee) => employee.pinStatus || '__none__'))].map((value) => ({ value, label: value === '__none__' ? t('Not set') : t(value) }))}
    {@const activeEmployees = team.employees.filter((employee) => employee.active)}
    {@const appEnabled = activeEmployees.filter((employee) => employee.accessState === 'active').length}

    <WorkspaceTablePanel dirty={team.dirty} saving={team.saving} canSave={team.canSave} onsave={() => void team.save().catch(() => undefined)} ondiscard={() => { team.discard(); cancelEmailEdit(); }}>
      {#snippet meta()}
        <span><i class="dot"></i>{t('{count} employees', { count: activeEmployees.length })}</span>
        <span><i class="dot is-green"></i>{t('{count} with app access', { count: appEnabled })}</span>
      {/snippet}
      {#snippet children()}
        {#if workspaceLayout.cards}
          <WorkspaceCardGrid>
            {#each groups as group (group.key)}
              {#each group.employees as employee (employee.id)}
                <WorkspaceCard
                  accent={employeeColor.get(employee.id) ?? null}
                  initials={personInitials(employee.displayName)}
                  title={employee.displayName}
                  subtitle={employee.accessRole ? t(roleLabel(employee.accessRole)) : null}
                  badges={[
                    {
                      label: t(ACCESS_LABEL[employee.accessState] ?? employee.accessState),
                      tone: employee.accessState === 'active'
                        ? ('ok' as const)
                        : employee.accessState === 'invited'
                          ? ('accent' as const)
                          : employee.accessState === 'expired' || employee.accessState === 'revoked'
                            ? ('warn' as const)
                            : ('neutral' as const)
                    },
                    {
                      label: employee.pinStatus === 'set' ? t('PIN set') : t('No PIN'),
                      tone: employee.pinStatus === 'set' ? ('accent' as const) : ('neutral' as const)
                    }
                  ]}
                  meta={[
                    { label: t('Email'), value: employee.email || '—', muted: !employee.email }
                  ]}
                  onactivate={team.editable ? () => (detailId = employee.id) : null}
                />
              {/each}
            {/each}
          </WorkspaceCardGrid>
        {:else}
        <div class="cl-tablewrap">
          <table class="cl-table cl-mobile-rows">
            <thead><tr>
              <th class="has-menu"><WorkspacePrimaryColMenu label={t('Employee')} sortable sortDir={view.sortDir('name')} onsort={(dir) => view.setSort('name', dir)} filterKind="text" searchValue={view.search('name')} onsearch={(value) => view.setSearch('name', value)} groupValue={view.groupBy} groupOptions={[{ value: 'none', label: t('No grouping') }, { value: 'status', label: t('Status') }, { value: 'role', label: t('Role') }]} ongroupchange={(value) => view.setGroupBy(value as GroupBy)} /></th>
              {#if shown('email')}<th class="has-menu"><WorkspaceColMenu label={t('Email')} sortable sortDir={view.sortDir('email')} onsort={(dir) => view.setSort('email', dir)} filterKind="text" searchValue={view.search('email')} onsearch={(value) => view.setSearch('email', value)} /></th>{/if}
              {#if shown('role')}<th class="has-menu"><WorkspaceColMenu label={t('Role')} sortable sortDir={view.sortDir('role')} onsort={(dir) => view.setSort('role', dir)} filterKind="values" filterValues={roleValues} selected={view.excluded('role')} ontoggle={(value) => view.toggleValue('role', value)} onselectall={(on) => view.selectAll('role', on, roleValues)} /></th>{/if}
              {#if shown('pin')}<th class="has-menu"><WorkspaceColMenu label={t('Badge PIN')} sortable sortDir={view.sortDir('pin')} onsort={(dir) => view.setSort('pin', dir)} filterKind="values" filterValues={pinValues} selected={view.excluded('pin')} ontoggle={(value) => view.toggleValue('pin', value)} onselectall={(on) => view.selectAll('pin', on, pinValues)} /></th>{/if}
              {#if shown('status')}<th class="has-menu"><WorkspaceColMenu label={t('Status')} sortable sortDir={view.sortDir('status')} onsort={(dir) => view.setSort('status', dir)} filterKind="values" filterValues={accessValues} selected={view.excluded('status')} ontoggle={(value) => view.toggleValue('status', value)} onselectall={(on) => view.selectAll('status', on, accessValues)} /></th>{/if}
              <th class="chooser-col"><WorkspaceColChooser columns={view.columns} hidden={view.hidden} ontoggle={view.toggleColumn} /></th>
            </tr></thead>
            {#if !filtered.length}
              <tbody><tr class="cl-mobile-empty"><td colspan={colCount}>
                <div class="cl-empty">
                  <strong>{t(activeEmployees.length ? 'No employees match' : 'No active employees')}</strong>
                  <span>{t('Change the filter, or add someone to the team.')}</span>
                  {#if !activeEmployees.length}<a class="empty-link" href="/team">{t('People')}</a>{/if}
                </div>
              </td></tr></tbody>
            {:else}
              {#each groups as group (group.key)}
                <tbody>
                  {#if view.grouping}<WorkspaceGroupRow colspan={colCount} label={group.label} meta={peopleCountLabel(group.employees.length)} collapsed={view.isCollapsed(group.key)} ontoggle={() => view.toggleGroup(group.key)} />{/if}
                  {#if !view.isCollapsed(group.key)}
                  {#each group.employees as employee (employee.id)}
                    <tr>
                      <td class="cl-mobile-primary">
                        <span class="cl-table__name"><span class="cl-avatar" style="--avatar-color:{employeeColor.get(employee.id) ?? 'var(--cl-muted)'}">{personInitials(employee.displayName)}</span><button class="employee-link" type="button" disabled={!team.editable} onclick={() => (detailId = employee.id)}>{employee.displayName}</button></span>
                        <span class="cl-mobile-summary">
                          <span>{t(roleLabel(employee.accessRole))}</span>
                          <span>{t(ACCESS_LABEL[employee.accessState] ?? employee.accessState)}</span>
                          {#if employee.email}<span>{employee.email}</span>{/if}
                        </span>
                      </td>
                      {#if shown('email')}<td>
                        {#if editingEmployeeId === employee.id}
                          <input bind:this={editingInput} class="cl-field email-editor" type="email" aria-label={`${t('Email')} · ${employee.displayName}`} value={editingValue} oninput={(event) => (editingValue = event.currentTarget.value)} onkeydown={handleEmailKeydown} onblur={commitEmailEdit} />
                        {:else}
                          <button class="inline-cell" class:is-empty={!employee.email} type="button" disabled={!team.editable} onclick={() => startEmailEdit(employee)}><span>{employee.email || t('Add')}</span>{#if !employee.email}<Pencil size={12} aria-hidden="true" />{/if}</button>
                        {/if}
                      </td>{/if}
                      {#if shown('role')}<td><WorkspaceCellBadge label={roleLabel(employee.accessRole)} tone={employee.accessRole === 'manager' ? 'info' : 'neutral'} icon="user" /></td>{/if}
                      {#if shown('pin')}<td><WorkspaceCellBadge label={employee.pinStatus === 'set' ? 'Set' : 'Not set'} tone={employee.pinStatus === 'set' ? 'success' : 'neutral'} icon="key" /></td>{/if}
                      {#if shown('status')}<td class="action-cell"><EmployeeAccessControl {employee} disabled={!team.editable || team.dirty} /></td>{/if}
                      <td class="menu-cell"></td>
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
      <EmployeeInlineEditor employeeId={detailId} mode="people" saving={team.saving} onclose={() => (detailId = '')} onsave={team.saveEmployee} />
    {/if}

{/if}

<style>
  .employee-link { max-width: 230px; overflow: hidden; padding: 3px 0; border: 0; color: var(--cl-ink); background: transparent; font: inherit; font-size: var(--rst-fs-body); font-weight: var(--rst-fw-medium); text-align: left; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
  .employee-link:hover:not(:disabled) { color: var(--cl-accent); text-decoration: underline; text-underline-offset: 2px; }
  .employee-link:disabled { cursor: default; }
  .inline-cell { max-width: 260px; min-height: 30px; display: inline-flex; align-items: center; gap: 7px; overflow: hidden; margin: -3px -7px; padding: 4px 7px; border: 1px solid transparent; border-radius: 6px; color: var(--cl-muted); background: transparent; font: inherit; font-size: var(--rst-fs-body); text-align: left; cursor: text; }
  .inline-cell span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .inline-cell:hover:not(:disabled), .inline-cell:focus-visible { border-color: color-mix(in srgb, var(--cl-accent) 22%, var(--cl-line)); color: var(--cl-ink); background: var(--cl-accent-wash); }
  .inline-cell.is-empty { color: var(--cl-accent); font-size: var(--rst-fs-control); font-weight: var(--rst-fw-medium); }
  .inline-cell :global(svg) { flex: 0 0 auto; color: var(--cl-accent); }
  .action-cell { padding: 0 !important; }
  .email-editor { min-width: 160px; height: 32px; border-color: var(--cl-accent); box-shadow: 0 0 0 2px var(--cl-accent-wash); }
  .empty-link { justify-self: center; color: var(--cl-accent); font-size: var(--rst-fs-body); font-weight: var(--rst-fw-medium); text-decoration: none; }
  .empty-link:hover { text-decoration: underline; }
</style>
