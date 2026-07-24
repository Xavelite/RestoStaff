<script lang="ts">
  import ActionButton from '$lib/components/ActionButton.svelte';
  import Dialog from '$lib/components/Dialog.svelte';
  import {
    inviteEmployee,
    revokeEmployeeInvitation,
    setEmployeeAccessState
  } from '$lib/api/mutations';
  import { friendlyError } from '$lib/api/error-messages';
  import { t } from '$lib/i18n/i18n.svelte';
  import { toasts } from '$lib/ui/toast.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import type { EmployeeDraft } from '$lib/team/team-model';
  import ClassicStatus from '$lib/classic/ClassicStatus.svelte';
  import ClassicTeamPage from '$lib/classic/ClassicTeamPage.svelte';

  let busy = $state('');
  let inviting = $state<EmployeeDraft | null>(null);
  let inviteEmail = $state('');
  let inviteRole = $state<'manager' | 'employee'>('employee');

  const ACCESS_LABEL: Record<string, string> = {
    active: 'Signed in',
    disabled: 'Disabled',
    invited: 'Invitation sent',
    expired: 'Invitation expired',
    revoked: 'Invitation revoked',
    not_invited: 'No invitation'
  };

  function accessTone(state: string): 'ok' | 'attention' | 'problem' {
    if (state === 'active') return 'ok';
    if (state === 'disabled' || state === 'expired') return 'problem';
    return 'attention';
  }

  function openInvite(employee: EmployeeDraft) {
    inviting = employee;
    inviteEmail = employee.email;
    inviteRole = employee.invitationRole || 'employee';
  }

  async function run(id: string, action: () => Promise<unknown>, message: string) {
    if (!workspace.activeId || busy) return;
    busy = id;
    try {
      await action();
      await workspace.loadTeam(true);
      toasts.show(t(message), 'success');
    } catch (error) {
      toasts.show(friendlyError(error), 'danger');
    } finally {
      busy = '';
    }
  }

  async function sendInvite() {
    if (!workspace.activeId || !inviting) return;
    if (!inviteEmail.trim()) {
      toasts.show(t('Enter an email address to invite.'), 'warning');
      return;
    }
    const employee = inviting;
    const email = inviteEmail.trim();
    const role = inviteRole;
    await run(
      employee.id,
      () =>
        inviteEmployee({
          restaurantId: workspace.activeId!,
          employeeId: employee.id,
          email,
          role
        }),
      'Invitation sent.'
    );
    inviting = null;
  }
</script>

<svelte:head><title>{t('Access')} &middot; restogogo</title></svelte:head>

<ClassicTeamPage>
  {#snippet children(team)}
    {@const rows = team.employees.filter((employee) => employee.active)}

    <p class="cl-section__note">
      {t('App access is separate from badge access: a PIN lets someone clock in, an invitation lets them sign in.')}
    </p>

    <div class="cl-tablewrap">
      <table class="cl-table">
        <thead>
          <tr>
            <th>{t('Name')}</th>
            <th>{t('Email')}</th>
            <th>{t('Role')}</th>
            <th>{t('Badge PIN')}</th>
            <th>{t('Status')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#if !rows.length}
            <tr>
              <td colspan="6">
                <div class="cl-empty"><strong>{t('No active employees')}</strong></div>
              </td>
            </tr>
          {:else}
            {#each rows as employee (employee.id)}
              <tr>
                <td>{employee.displayName}</td>
                <td class="is-quiet">{employee.email || '—'}</td>
                <td class="is-quiet">{employee.accessRole ? t(employee.accessRole) : '—'}</td>
                <td class="is-quiet">{t(employee.pinStatus === 'set' ? 'Set' : 'Not set')}</td>
                <td>
                  <ClassicStatus
                    label={ACCESS_LABEL[employee.accessState] ?? employee.accessState}
                    tone={accessTone(employee.accessState)}
                  />
                </td>
                <td class="is-num">
                  <span class="actions">
                    {#if employee.accessState === 'active'}
                      <button
                        class="cl-btn"
                        type="button"
                        disabled={!team.editable || busy === employee.id}
                        onclick={() =>
                          run(
                            employee.id,
                            () => setEmployeeAccessState(workspace.activeId!, employee.id, 'disable'),
                            'App access disabled.'
                          )}
                      >{t('Disable')}</button>
                    {:else if employee.accessState === 'disabled'}
                      <button
                        class="cl-btn"
                        type="button"
                        disabled={!team.editable || busy === employee.id}
                        onclick={() =>
                          run(
                            employee.id,
                            () => setEmployeeAccessState(workspace.activeId!, employee.id, 'restore'),
                            'App access restored.'
                          )}
                      >{t('Restore')}</button>
                    {:else if employee.accessState === 'invited'}
                      <button
                        class="cl-btn"
                        type="button"
                        disabled={!team.editable || busy === employee.id}
                        onclick={() =>
                          run(
                            employee.id,
                            () => revokeEmployeeInvitation(workspace.activeId!, employee.id),
                            'Invitation revoked.'
                          )}
                      >{t('Revoke')}</button>
                    {:else}
                      <button
                        class="cl-btn"
                        type="button"
                        disabled={!team.editable || busy === employee.id}
                        onclick={() => openInvite(employee)}
                      >{t('Invite')}</button>
                    {/if}
                  </span>
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>

    {#snippet footer()}
      <ActionButton label={t('Cancel')} onclick={() => (inviting = null)} />
      <ActionButton label={t('Send invitation')} tone="primary" disabled={Boolean(busy)} onclick={sendInvite} />
    {/snippet}

    <Dialog
      open={Boolean(inviting)}
      title={t('Invite {name}', { name: inviting?.displayName ?? '' })}
      description={t('They receive an email link to set a password and sign in.')}
      size="small"
      onclose={() => (inviting = null)}
      {footer}
    >
      <div class="form">
        <label class="cl-label">
          <span>{t('Email')}</span>
          <input class="cl-field" type="email" bind:value={inviteEmail} />
        </label>
        <label class="cl-label">
          <span>{t('Role')}</span>
          <select class="cl-field" bind:value={inviteRole}>
            <option value="employee">{t('employee')}</option>
            <option value="manager">{t('manager')}</option>
          </select>
        </label>
      </div>
    </Dialog>
  {/snippet}
</ClassicTeamPage>

<style>
  .actions {
    display: inline-flex;
    gap: 8px;
  }
  .form {
    display: grid;
    gap: 14px;
  }
</style>

