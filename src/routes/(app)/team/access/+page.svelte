<script lang="ts">
  import { onMount, tick } from 'svelte';
  import ActionButton from '$lib/components/ActionButton.svelte';
  import Dialog from '$lib/components/Dialog.svelte';
  import { inviteEmployee, revokeEmployeeInvitation, setEmployeeAccessState } from '$lib/api/mutations';
  import { friendlyError } from '$lib/api/error-messages';
  import { t } from '$lib/i18n/i18n.svelte';
  import { unsavedChanges } from '$lib/navigation/unsaved-changes.svelte';
  import { confirmAction } from '$lib/ui/confirm.svelte';
  import { personInitials } from '$lib/ui/person';
  import { buildEmployeeColorMap } from '$lib/ui/position-color';
  import { toasts } from '$lib/ui/toast.svelte';
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

  type GroupBy = 'status' | 'role' | 'none';
  type SortKey = 'name' | 'email' | 'role' | 'pin' | 'status';
  type Group = { key: string; label: string; employees: EmployeeDraft[] };

  let busy = $state('');
  let inviting = $state<EmployeeDraft | null>(null);
  let inviteEmail = $state('');
  let inviteRole = $state<'manager' | 'employee'>('employee');
  let inviteBaseline = $state('');
  let search = $state('');
  let groupBy = $state<GroupBy>('status');
  let sort = $state<{ key: SortKey; dir: 'asc' | 'desc' } | null>(null);
  let excludedStatus = $state(new Set<string>());
  let excludedRole = $state(new Set<string>());
  let excludedPin = $state(new Set<string>());
  let emailSearch = $state('');
  let collapsedGroups = $state<string[]>([]);
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
  const COLS_KEY = 'rst-team-access-cols-v2';
  let hidden = $state(new Set<string>());

  const inviteDirty = $derived(Boolean(inviting && inviteBaseline && JSON.stringify([inviteEmail, inviteRole]) !== inviteBaseline));
  const employeeColor = $derived(workspace.team ? buildEmployeeColorMap(workspace.team.job_functions, workspace.team.employee_job_functions, workspace.restaurant?.work_areas ?? []) : new Map<string, string>());

  const ACCESS_LABEL: Record<string, string> = {
    active: 'Enabled',
    disabled: 'Disabled',
    invited: 'Invited',
    expired: 'Invitation expired',
    revoked: 'Invitation revoked',
    not_invited: 'Not invited'
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

  onMount(() => {
    try { const raw = localStorage.getItem(COLS_KEY); if (raw) hidden = new Set(JSON.parse(raw) as string[]); } catch { hidden = new Set(); }
    return unsavedChanges.register({ id: 'team-invitation', label: 'Employee invitation', priority: 10, isDirty: () => inviteDirty, save: sendInvite, discard: discardInvite });
  });

  function toggleColumn(key: string) {
    const next = new Set(hidden);
    next.has(key) ? next.delete(key) : next.add(key);
    const hiding = next.has(key);
    if (hiding && sort?.key === key) sort = null;
    if (key === 'status' && hiding) {
      if (groupBy === 'status') groupBy = 'none';
      excludedStatus = new Set();
    }
    if (key === 'role' && hiding) {
      if (groupBy === 'role') groupBy = 'none';
      excludedRole = new Set();
    }
    if (key === 'email' && hiding) emailSearch = '';
    if (key === 'pin' && hiding) excludedPin = new Set();
    hidden = next;
    try { localStorage.setItem(COLS_KEY, JSON.stringify([...next])); } catch {}
  }
  const shown = (key: string) => !hidden.has(key);
  const colCount = $derived(2 + OPTIONAL_COLUMNS.filter((column) => shown(column.key)).length);

  function accessTone(state: string): 'success' | 'warning' | 'danger' {
    if (state === 'active') return 'success';
    if (state === 'disabled' || state === 'expired') return 'danger';
    return 'warning';
  }
  function accessIcon(state: string): 'check' | 'clock' | 'minus' | 'lock' {
    if (state === 'active') return 'check';
    if (state === 'invited') return 'clock';
    if (state === 'not_invited') return 'minus';
    return 'lock';
  }
  function toggleExcluded(value: string) {
    const next = new Set(excludedStatus);
    next.has(value) ? next.delete(value) : next.add(value);
    excludedStatus = next;
  }
  function matches(employee: EmployeeDraft) {
    const placement = teamDraft.placement(employee);
    if (!placement.active || excludedStatus.has(placement.accessState)) return false;
    if (excludedRole.has(placement.accessRole || '__none__')) return false;
    if (excludedPin.has(placement.pinStatus || '__none__')) return false;
    if (emailSearch.trim() && !placement.email.toLowerCase().includes(emailSearch.trim().toLowerCase())) return false;
    const term = search.trim().toLowerCase();
    return !term || `${placement.displayName} ${placement.email} ${placement.accessRole} ${placement.accessState}`.toLowerCase().includes(term);
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
    if (!sort) return rows;
    const factor = sort.dir === 'desc' ? -1 : 1;
    return [...rows].sort((a, b) => factor * sortValue(a, sort!.key).localeCompare(sortValue(b, sort!.key)));
  }
  function grouped(rows: EmployeeDraft[], jobName: Map<string, string>): Group[] {
    if (groupBy === 'none') return [{ key: 'all', label: '', employees: rows }];
    const map = new Map<string, Group>();
    for (const employee of rows) {
      const placement = teamDraft.placement(employee);
      const key = groupBy === 'status' ? placement.accessState : placement.accessRole || '__undefined__';
      const label = groupBy === 'status'
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

  function peopleCountLabel(count: number): string {
    return count === 1 ? t('1 person') : t('{count} people', { count });
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

  function openInvite(employee: EmployeeDraft) {
    inviting = employee;
    inviteEmail = employee.email;
    inviteRole = employee.invitationRole || 'employee';
    inviteBaseline = JSON.stringify([inviteEmail, inviteRole]);
  }
  function discardInvite() { inviting = null; inviteEmail = ''; inviteRole = 'employee'; inviteBaseline = ''; }
  async function requestInviteClose() {
    if (!inviteDirty) return discardInvite();
    const discard = await confirmAction({ title: 'Discard invitation changes?', body: 'The email address or role has not been sent yet.', confirmLabel: 'Discard', cancelLabel: 'Keep editing', tone: 'danger' });
    if (discard) discardInvite();
  }
  async function run(id: string, action: () => Promise<unknown>, message: string) {
    if (!workspace.activeId || busy) return;
    busy = id;
    try { await action(); await workspace.loadTeam(true); toasts.show(t(message), 'success'); }
    catch (error) { toasts.show(friendlyError(error), 'danger'); throw error; }
    finally { busy = ''; }
  }
  async function sendInvite() {
    if (!workspace.activeId || !inviting) return;
    if (!inviteEmail.trim()) { const error = new Error(t('Enter an email address to invite.')); toasts.show(error.message, 'warning'); throw error; }
    const employee = inviting;
    await run(employee.id, () => inviteEmployee({ restaurantId: workspace.activeId!, employeeId: employee.id, email: inviteEmail.trim(), role: inviteRole }), 'Invitation sent.');
    discardInvite();
  }

  async function disableAccess(employee: EmployeeDraft) {
    const confirmed = await confirmAction({
      title: 'Disable app access?',
      body: `${employee.displayName} will no longer be able to sign in. Their employee history and badge records are preserved.`,
      confirmLabel: 'Disable access',
      cancelLabel: 'Keep enabled',
      tone: 'danger'
    });
    if (!confirmed) return;
    await run(employee.id, () => setEmployeeAccessState(workspace.activeId!, employee.id, 'disable'), 'App access disabled.');
  }

  async function revokeInvite(employee: EmployeeDraft) {
    const confirmed = await confirmAction({
      title: 'Revoke this invitation?',
      body: `${employee.displayName} will no longer be able to use the invitation link.`,
      confirmLabel: 'Revoke invitation',
      cancelLabel: 'Keep invitation',
      tone: 'danger'
    });
    if (!confirmed) return;
    await run(employee.id, () => revokeEmployeeInvitation(workspace.activeId!, employee.id), 'Invitation revoked.');
  }

  const readTeamContext = useClassicTeamContext();
  const team = $derived(readTeamContext());
</script>

<svelte:head><title>{t('Access')} &middot; restogogo</title></svelte:head>

{#if team}
{@const filtered = team.employees.filter(matches)}
    {@const groups = grouped(ordered(filtered), team.jobName)}
    {@const accessValues = [...new Set(team.employees.filter((employee) => employee.active).map((employee) => employee.accessState))].map((value) => ({ value, label: t(ACCESS_LABEL[value] ?? value) }))}
    {@const roleValues = [{ value: '__none__', label: t('No role') }, { value: 'manager', label: t('Manager') }, { value: 'employee', label: t('Employee') }]}
    {@const pinValues = [...new Set(team.employees.filter((employee) => employee.active).map((employee) => employee.pinStatus || '__none__'))].map((value) => ({ value, label: value === '__none__' ? t('Not set') : t(value) }))}
    {@const activeEmployees = team.employees.filter((employee) => employee.active)}
    {@const appEnabled = activeEmployees.filter((employee) => employee.accessState === 'active').length}

    <ClassicTablePanel dirty={team.dirty} saving={team.saving} canSave={team.canSave} onsave={() => void team.save().catch(() => undefined)} ondiscard={() => { team.discard(); cancelEmailEdit(); }}>
      {#snippet meta()}
        <span><i class="dot"></i>{t('{count} employees', { count: activeEmployees.length })}</span>
        <span><i class="dot is-green"></i>{t('{count} with app access', { count: appEnabled })}</span>
      {/snippet}
      {#snippet children()}
        <div class="cl-tablewrap">
          <table class="cl-table">
            <thead><tr>
              <th class="has-menu"><ClassicPrimaryColMenu label={t('Employee')} sortable sortDir={sort?.key === 'name' ? sort.dir : null} onsort={(dir) => (sort = { key: 'name', dir })} filterKind="text" searchValue={search} onsearch={(value) => (search = value)} groupValue={groupBy} groupOptions={[{ value: 'none', label: t('No grouping') }, { value: 'status', label: t('Status') }, { value: 'role', label: t('Role') }]} ongroupchange={(value) => setGroupBy(value as GroupBy)} /></th>
              {#if shown('email')}<th class="has-menu"><ClassicColMenu label={t('Email')} sortable sortDir={sort?.key === 'email' ? sort.dir : null} onsort={(dir) => (sort = { key: 'email', dir })} filterKind="text" searchValue={emailSearch} onsearch={(value) => (emailSearch = value)} /></th>{/if}
              {#if shown('role')}<th class="has-menu"><ClassicColMenu label={t('Role')} sortable sortDir={sort?.key === 'role' ? sort.dir : null} onsort={(dir) => (sort = { key: 'role', dir })} filterKind="values" filterValues={roleValues} selected={excludedRole} ontoggle={(value) => { const next = new Set(excludedRole); next.has(value) ? next.delete(value) : next.add(value); excludedRole = next; }} onselectall={(on) => (excludedRole = on ? new Set() : new Set(roleValues.map((item) => item.value)))} /></th>{/if}
              {#if shown('pin')}<th class="has-menu"><ClassicColMenu label={t('Badge PIN')} sortable sortDir={sort?.key === 'pin' ? sort.dir : null} onsort={(dir) => (sort = { key: 'pin', dir })} filterKind="values" filterValues={pinValues} selected={excludedPin} ontoggle={(value) => { const next = new Set(excludedPin); next.has(value) ? next.delete(value) : next.add(value); excludedPin = next; }} onselectall={(on) => (excludedPin = on ? new Set() : new Set(pinValues.map((item) => item.value)))} /></th>{/if}
              {#if shown('status')}<th class="has-menu"><ClassicColMenu label={t('Status')} sortable sortDir={sort?.key === 'status' ? sort.dir : null} onsort={(dir) => (sort = { key: 'status', dir })} filterKind="values" filterValues={accessValues} selected={excludedStatus} ontoggle={toggleExcluded} onselectall={(on) => (excludedStatus = on ? new Set() : new Set(accessValues.map((item) => item.value)))} /></th>{/if}
              <th class="chooser-col"><ClassicColChooser columns={OPTIONAL_COLUMNS.map((column) => ({ key: column.key, label: t(column.label) }))} {hidden} ontoggle={toggleColumn} /></th>
            </tr></thead>
            {#if !filtered.length}
              <tbody><tr><td colspan={colCount}>
                <div class="cl-empty">
                  <strong>{t(activeEmployees.length ? 'No employees match' : 'No active employees')}</strong>
                  <span>{t('Change the filter, or add someone to the team.')}</span>
                  {#if !activeEmployees.length}<a class="empty-link" href="/team">{t('People')}</a>{/if}
                </div>
              </td></tr></tbody>
            {:else}
              {#each groups as group (group.key)}
                <tbody>
                  {#if groupBy !== 'none'}<ClassicGroupRow colspan={colCount} label={group.label} meta={peopleCountLabel(group.employees.length)} collapsed={collapsedGroups.includes(group.key)} ontoggle={() => toggleGroup(group.key)} />{/if}
                  {#if !collapsedGroups.includes(group.key)}
                  {#each group.employees as employee (employee.id)}
                    <tr>
                      <td><span class="cl-table__name"><span class="cl-avatar" style="--avatar-color:{employeeColor.get(employee.id) ?? 'var(--cl-muted)'}">{personInitials(employee.displayName)}</span><button class="employee-link" type="button" disabled={!team.editable} onclick={() => (detailId = employee.id)}>{employee.displayName}</button></span></td>
                      {#if shown('email')}<td>
                        {#if editingEmployeeId === employee.id}
                          <input bind:this={editingInput} class="cl-field email-editor" type="email" aria-label={`${t('Email')} · ${employee.displayName}`} value={editingValue} oninput={(event) => (editingValue = event.currentTarget.value)} onkeydown={handleEmailKeydown} onblur={commitEmailEdit} />
                        {:else}
                          <button class="inline-cell" class:is-empty={!employee.email} type="button" disabled={!team.editable} onclick={() => startEmailEdit(employee)}><span>{employee.email || t('Add')}</span><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 20 4.3-1 10.8-10.8a2.1 2.1 0 0 0-3-3L5.3 16zM14.8 6.5l3 3" /></svg></button>
                        {/if}
                      </td>{/if}
                      {#if shown('role')}<td><ClassicCellBadge label={roleLabel(employee.accessRole)} tone={employee.accessRole === 'manager' ? 'info' : 'neutral'} icon="user" /></td>{/if}
                      {#if shown('pin')}<td><ClassicCellBadge label={employee.pinStatus === 'set' ? 'Set' : 'Not set'} tone={employee.pinStatus === 'set' ? 'success' : 'neutral'} icon="key" /></td>{/if}
                      {#if shown('status')}<td><ClassicCellBadge label={ACCESS_LABEL[employee.accessState] ?? employee.accessState} tone={accessTone(employee.accessState)} icon={accessIcon(employee.accessState)} /></td>{/if}
                      <td class="menu-cell">
                        <ClassicRowMenu
                          disabled={!team.editable || busy === employee.id}
                          items={[
                            { label: t('Open employee'), onselect: () => (detailId = employee.id) },
                            employee.accessState === 'active'
                              ? { label: t('Disable'), tone: 'danger', onselect: () => void disableAccess(employee).catch(() => undefined) }
                              : employee.accessState === 'disabled'
                                ? { label: t('Restore'), onselect: () => void run(employee.id, () => setEmployeeAccessState(workspace.activeId!, employee.id, 'restore'), 'App access restored.').catch(() => undefined) }
                                : employee.accessState === 'invited'
                                  ? { label: t('Revoke invitation'), tone: 'danger', onselect: () => void revokeInvite(employee).catch(() => undefined) }
                                  : { label: t('Invite'), onselect: () => openInvite(employee) }
                          ]}
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

    {#snippet footer()}<ActionButton label={t('Cancel')} onclick={() => void requestInviteClose()} /><ActionButton label={t('Send invitation')} tone="primary" disabled={Boolean(busy)} onclick={() => void sendInvite().catch(() => undefined)} />{/snippet}
    <Dialog open={Boolean(inviting)} title={t('Invite {name}', { name: inviting?.displayName ?? '' })} description={t('They receive an email link to set a password and sign in.')} size="small" onclose={() => void requestInviteClose()} {footer}>
      <div class="form"><label class="cl-label"><span>{t('Email')}</span><input class="cl-field" type="email" bind:value={inviteEmail} /></label><label class="cl-label"><span>{t('Role')}</span><select class="cl-field" bind:value={inviteRole}><option value="employee">{t('Employee')}</option><option value="manager">{t('Manager')}</option></select></label></div>
    </Dialog>

    {#if detailId}
      <EmployeeInlineEditor employeeId={detailId} mode="people" saving={team.saving} onclose={() => (detailId = '')} onsave={team.saveEmployee} />
    {/if}

{/if}

<style>
  .form { display: grid; gap: 14px; }
  .employee-link { max-width: 230px; overflow: hidden; padding: 3px 0; border: 0; color: var(--cl-ink); background: transparent; font: inherit; font-size: 13px; font-weight: var(--rst-fw-medium); text-align: left; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
  .employee-link:hover:not(:disabled) { color: var(--cl-accent); text-decoration: underline; text-underline-offset: 2px; }
  .employee-link:disabled { cursor: default; }
  .inline-cell { max-width: 260px; min-height: 30px; display: inline-flex; align-items: center; gap: 7px; overflow: hidden; margin: -3px -7px; padding: 4px 7px; border: 1px solid transparent; border-radius: 6px; color: var(--cl-muted); background: transparent; font: inherit; font-size: 13px; text-align: left; cursor: text; }
  .inline-cell span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .inline-cell svg { flex: 0 0 auto; opacity: 0; }
  .inline-cell:hover:not(:disabled), .inline-cell:focus-visible { border-color: color-mix(in srgb, var(--cl-accent) 22%, var(--cl-line)); color: var(--cl-ink); background: var(--cl-accent-wash); }
  .inline-cell:hover:not(:disabled) svg, .inline-cell:focus-visible svg, .inline-cell.is-empty svg { opacity: .72; }
  .inline-cell.is-empty { color: var(--cl-accent); font-size: 12px; font-weight: var(--rst-fw-medium); }
  .email-editor { min-width: 160px; height: 32px; border-color: var(--cl-accent); box-shadow: 0 0 0 2px var(--cl-accent-wash); }
  .empty-link { justify-self: center; color: var(--cl-accent); font-size: 13px; font-weight: var(--rst-fw-medium); text-decoration: none; }
  .empty-link:hover { text-decoration: underline; }
</style>
