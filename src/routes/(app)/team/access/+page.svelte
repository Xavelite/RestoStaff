<script lang="ts">
  import { onMount } from 'svelte';
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
  import ClassicStatus from '$lib/classic/ClassicStatus.svelte';
  import ClassicTablePanel from '$lib/classic/ClassicTablePanel.svelte';
  import ClassicColMenu from '$lib/classic/ClassicColMenu.svelte';
  import ClassicPrimaryColMenu from '$lib/classic/ClassicPrimaryColMenu.svelte';
  import ClassicGroupRow from '$lib/classic/ClassicGroupRow.svelte';
  import ClassicColChooser from '$lib/classic/ClassicColChooser.svelte';

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

  const OPTIONAL_COLUMNS = [
    { key: 'email', label: 'Email' },
    { key: 'role', label: 'Role' },
    { key: 'pin', label: 'Badge PIN' },
    { key: 'status', label: 'Status' }
  ] as const;
  const COLS_KEY = 'rst-team-access-cols-v2';
  let hidden = $state(new Set<string>());

  const inviteDirty = $derived(Boolean(inviting && inviteBaseline && JSON.stringify([inviteEmail, inviteRole]) !== inviteBaseline));
  const employeeColor = $derived(workspace.team ? buildEmployeeColorMap(workspace.team.job_functions, workspace.team.employee_job_functions, workspace.operations?.work_areas ?? []) : new Map<string, string>());

  const ACCESS_LABEL: Record<string, string> = {
    active: 'Signed in', disabled: 'Disabled', invited: 'Invitation sent', expired: 'Invitation expired', revoked: 'Invitation revoked', not_invited: 'No invitation'
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
  const colCount = $derived(3 + OPTIONAL_COLUMNS.filter((column) => shown(column.key)).length);

  function accessTone(state: string): 'ok' | 'attention' | 'problem' {
    if (state === 'active') return 'ok';
    if (state === 'disabled' || state === 'expired') return 'problem';
    return 'attention';
  }
  function toggleExcluded(value: string) {
    const next = new Set(excludedStatus);
    next.has(value) ? next.delete(value) : next.add(value);
    excludedStatus = next;
  }
  function matches(employee: EmployeeDraft) {
    if (!employee.active || excludedStatus.has(employee.accessState)) return false;
    if (excludedRole.has(employee.accessRole || '__none__')) return false;
    if (excludedPin.has(employee.pinStatus || '__none__')) return false;
    if (emailSearch.trim() && !employee.email.toLowerCase().includes(emailSearch.trim().toLowerCase())) return false;
    const term = search.trim().toLowerCase();
    return !term || `${employee.displayName} ${employee.email} ${employee.accessRole} ${employee.accessState}`.toLowerCase().includes(term);
  }
  function sortValue(employee: EmployeeDraft, key: SortKey) {
    if (key === 'name') return employee.displayName.toLowerCase();
    if (key === 'email') return employee.email.toLowerCase();
    if (key === 'role') return employee.accessRole.toLowerCase();
    if (key === 'pin') return employee.pinStatus;
    return employee.accessState;
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
      const key = groupBy === 'status' ? employee.accessState : employee.accessRole || '__undefined__';
      const label = groupBy === 'status'
        ? t(ACCESS_LABEL[employee.accessState] ?? employee.accessState)
        : key === '__undefined__'
          ? t('No role')
          : t(key);
      const group = map.get(key) ?? { key, label, employees: [] };
      group.employees.push(employee);
      map.set(key, group);
    }
    return [...map.values()].sort((a, b) => a.key === '__undefined__' ? -1 : b.key === '__undefined__' ? 1 : a.label.localeCompare(b.label));
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

  const readTeamContext = useClassicTeamContext();
  const team = $derived(readTeamContext());
</script>

<svelte:head><title>{t('Access')} &middot; restogogo</title></svelte:head>

{#if team}
{@const filtered = team.employees.filter(matches)}
    {@const groups = grouped(ordered(filtered), team.jobName)}
    {@const accessValues = [...new Set(team.employees.filter((employee) => employee.active).map((employee) => employee.accessState))].map((value) => ({ value, label: t(ACCESS_LABEL[value] ?? value) }))}
    {@const roleValues = [{ value: '__none__', label: t('No role') }, { value: 'manager', label: t('manager') }, { value: 'employee', label: t('employee') }]}
    {@const pinValues = [...new Set(team.employees.filter((employee) => employee.active).map((employee) => employee.pinStatus || '__none__'))].map((value) => ({ value, label: value === '__none__' ? t('Not set') : t(value) }))}
    {@const signedIn = filtered.filter((employee) => employee.accessState === 'active').length}

    <ClassicTablePanel>
      {#snippet meta()}
        <span><i class="dot"></i>{t('{count} employees', { count: filtered.length })}</span>
        <span><i class="dot is-green"></i>{t('{count} signed in', { count: signedIn })}</span>
      {/snippet}
      {#snippet children()}
        <div class="cl-tablewrap">
          <table class="cl-table">
            <thead><tr>
              <th class="has-menu"><ClassicPrimaryColMenu label={t('Name')} sortable sortDir={sort?.key === 'name' ? sort.dir : null} onsort={(dir) => (sort = { key: 'name', dir })} filterKind="text" searchValue={search} onsearch={(value) => (search = value)} groupValue={groupBy} groupOptions={[{ value: 'none', label: t('No grouping') }, { value: 'status', label: t('Status') }, { value: 'role', label: t('Role') }]} ongroupchange={(value) => setGroupBy(value as GroupBy)} /></th>
              {#if shown('email')}<th class="has-menu"><ClassicColMenu label={t('Email')} sortable sortDir={sort?.key === 'email' ? sort.dir : null} onsort={(dir) => (sort = { key: 'email', dir })} filterKind="text" searchValue={emailSearch} onsearch={(value) => (emailSearch = value)} /></th>{/if}
              {#if shown('role')}<th class="has-menu"><ClassicColMenu label={t('Role')} sortable sortDir={sort?.key === 'role' ? sort.dir : null} onsort={(dir) => (sort = { key: 'role', dir })} filterKind="values" filterValues={roleValues} selected={excludedRole} ontoggle={(value) => { const next = new Set(excludedRole); next.has(value) ? next.delete(value) : next.add(value); excludedRole = next; }} onselectall={(on) => (excludedRole = on ? new Set() : new Set(roleValues.map((item) => item.value)))} /></th>{/if}
              {#if shown('pin')}<th class="has-menu"><ClassicColMenu label={t('Badge PIN')} sortable sortDir={sort?.key === 'pin' ? sort.dir : null} onsort={(dir) => (sort = { key: 'pin', dir })} filterKind="values" filterValues={pinValues} selected={excludedPin} ontoggle={(value) => { const next = new Set(excludedPin); next.has(value) ? next.delete(value) : next.add(value); excludedPin = next; }} onselectall={(on) => (excludedPin = on ? new Set() : new Set(pinValues.map((item) => item.value)))} /></th>{/if}
              {#if shown('status')}<th class="has-menu"><ClassicColMenu label={t('Status')} sortable sortDir={sort?.key === 'status' ? sort.dir : null} onsort={(dir) => (sort = { key: 'status', dir })} filterKind="values" filterValues={accessValues} selected={excludedStatus} ontoggle={toggleExcluded} onselectall={(on) => (excludedStatus = on ? new Set() : new Set(accessValues.map((item) => item.value)))} /></th>{/if}
              <th class="actions-col">{t('Actions')}</th>
              <th class="chooser-col"><ClassicColChooser columns={OPTIONAL_COLUMNS.map((column) => ({ key: column.key, label: t(column.label) }))} {hidden} ontoggle={toggleColumn} /></th>
            </tr></thead>
            {#if !filtered.length}
              <tbody><tr><td colspan={colCount}><div class="cl-empty"><strong>{t('No active employees')}</strong></div></td></tr></tbody>
            {:else}
              {#each groups as group (group.key)}
                <tbody>
                  {#if groupBy !== 'none'}<ClassicGroupRow colspan={colCount} label={group.label} meta={t('{count} people', { count: group.employees.length })} collapsed={collapsedGroups.includes(group.key)} ontoggle={() => toggleGroup(group.key)} />{/if}
                  {#if !collapsedGroups.includes(group.key)}
                  {#each group.employees as employee (employee.id)}
                    <tr>
                      <td><span class="cl-table__name"><span class="cl-avatar" style="--avatar-color:{employeeColor.get(employee.id) ?? 'var(--cl-muted)'}">{personInitials(employee.displayName)}</span>{employee.displayName}</span></td>
                      {#if shown('email')}<td class="is-quiet">{employee.email || '—'}</td>{/if}
                      {#if shown('role')}<td class="is-quiet">{employee.accessRole ? t(employee.accessRole) : '—'}</td>{/if}
                      {#if shown('pin')}<td class="is-quiet">{t(employee.pinStatus === 'set' ? 'Set' : 'Not set')}</td>{/if}
                      {#if shown('status')}<td><ClassicStatus label={ACCESS_LABEL[employee.accessState] ?? employee.accessState} tone={accessTone(employee.accessState)} /></td>{/if}
                      <td class="is-num"><span class="actions">{#if employee.accessState === 'active'}<button class="cl-btn" type="button" disabled={!team.editable || busy === employee.id} onclick={() => run(employee.id, () => setEmployeeAccessState(workspace.activeId!, employee.id, 'disable'), 'App access disabled.').catch(() => undefined)}>{t('Disable')}</button>{:else if employee.accessState === 'disabled'}<button class="cl-btn" type="button" disabled={!team.editable || busy === employee.id} onclick={() => run(employee.id, () => setEmployeeAccessState(workspace.activeId!, employee.id, 'restore'), 'App access restored.').catch(() => undefined)}>{t('Restore')}</button>{:else if employee.accessState === 'invited'}<button class="cl-btn" type="button" disabled={!team.editable || busy === employee.id} onclick={() => run(employee.id, () => revokeEmployeeInvitation(workspace.activeId!, employee.id), 'Invitation revoked.').catch(() => undefined)}>{t('Revoke')}</button>{:else}<button class="cl-btn" type="button" disabled={!team.editable || busy === employee.id} onclick={() => openInvite(employee)}>{t('Invite')}</button>{/if}</span></td>
                      <td></td>
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
      <div class="form"><label class="cl-label"><span>{t('Email')}</span><input class="cl-field" type="email" bind:value={inviteEmail} /></label><label class="cl-label"><span>{t('Role')}</span><select class="cl-field" bind:value={inviteRole}><option value="employee">{t('employee')}</option><option value="manager">{t('manager')}</option></select></label></div>
    </Dialog>

{/if}

<style>
  .actions { display: inline-flex; gap: 8px; }
  .form { display: grid; gap: 14px; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--cl-line-strong); display: inline-block; }
  .dot.is-green { background: var(--cl-ok); }
  .actions-col, .chooser-col { width: 44px; }
</style>
