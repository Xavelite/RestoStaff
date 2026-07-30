<script lang="ts">
  import { onMount } from 'svelte';
  import ActionButton from '$lib/components/ActionButton.svelte';
  import Dialog from '$lib/components/Dialog.svelte';
  import { friendlyError } from '$lib/api/error-messages';
  import {
    inviteEmployee,
    revokeEmployeeInvitation,
    setEmployeeAccessState
  } from '$lib/api/mutations';
  import { t } from '$lib/i18n/i18n.svelte';
  import { unsavedChanges } from '$lib/navigation/unsaved-changes.svelte';
  import type { EmployeeDraft } from '$lib/team/team-model';
  import { confirmAction } from '$lib/ui/confirm.svelte';
  import { toasts } from '$lib/ui/toast.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import WorkspaceCellBadge from './WorkspaceCellBadge.svelte';

  let {
    employee,
    disabled = false
  }: {
    employee: EmployeeDraft;
    disabled?: boolean;
  } = $props();

  let busy = $state(false);
  let inviteOpen = $state(false);
  let inviteEmail = $state('');
  let inviteRole = $state<'manager' | 'employee'>('employee');
  let inviteBaseline = $state('');
  const inviteDirty = $derived(
    Boolean(
      inviteOpen &&
        inviteBaseline &&
        JSON.stringify([inviteEmail, inviteRole]) !== inviteBaseline
    )
  );

  const labels: Record<string, string> = {
    active: 'Enabled',
    disabled: 'Disabled',
    invited: 'Invited',
    expired: 'Invitation expired',
    revoked: 'Invitation revoked',
    not_invited: 'Not invited'
  };

  function tone(): 'success' | 'warning' | 'danger' {
    if (employee.accessState === 'active') return 'success';
    if (employee.accessState === 'disabled' || employee.accessState === 'expired') return 'danger';
    return 'warning';
  }

  function icon(): 'check' | 'clock' | 'minus' | 'lock' {
    if (employee.accessState === 'active') return 'check';
    if (employee.accessState === 'invited') return 'clock';
    if (employee.accessState === 'not_invited') return 'minus';
    return 'lock';
  }

  function actionLabel(): string {
    if (employee.accessState === 'active') return t('Disable app access');
    if (employee.accessState === 'disabled') return t('Restore app access');
    if (employee.accessState === 'invited') return t('Revoke invitation');
    return t('Invite to Restogogo');
  }

  async function run(action: () => Promise<unknown>, success: string): Promise<boolean> {
    if (!workspace.activeId || busy || disabled) return false;
    busy = true;
    try {
      await action();
      await workspace.loadTeam(true);
      toasts.show(t(success), 'success');
      return true;
    } catch (error) {
      toasts.show(friendlyError(error), 'danger');
      return false;
    } finally {
      busy = false;
    }
  }

  function openInvite(): void {
    inviteEmail = employee.email;
    inviteRole =
      employee.accessRole === 'manager' || employee.invitationRole === 'manager'
        ? 'manager'
        : 'employee';
    inviteBaseline = JSON.stringify([inviteEmail, inviteRole]);
    inviteOpen = true;
  }

  function discardInvite(): void {
    inviteOpen = false;
    inviteEmail = '';
    inviteRole = 'employee';
    inviteBaseline = '';
  }

  async function requestInviteClose(): Promise<void> {
    if (!inviteDirty) {
      discardInvite();
      return;
    }
    const discard = await confirmAction({
      title: t('Discard invitation changes?'),
      body: t('The email address or role has not been sent yet.'),
      confirmLabel: t('Discard'),
      cancelLabel: t('Keep editing'),
      tone: 'danger'
    });
    if (discard) discardInvite();
  }

  async function handleAction(): Promise<void> {
    if (disabled || busy || !workspace.activeId) return;
    if (employee.accessState === 'active') {
      const confirmed = await confirmAction({
        title: t('Disable app access?'),
        body: t('{name} will no longer be able to sign in. Employee history and badge records are preserved.', {
          name: employee.displayName
        }),
        confirmLabel: t('Disable access'),
        cancelLabel: t('Keep enabled'),
        tone: 'danger'
      });
      if (confirmed) {
        await run(
          () => setEmployeeAccessState(workspace.activeId!, employee.id, 'disable'),
          'App access disabled.'
        );
      }
      return;
    }
    if (employee.accessState === 'disabled') {
      await run(
        () => setEmployeeAccessState(workspace.activeId!, employee.id, 'restore'),
        'App access restored.'
      );
      return;
    }
    if (employee.accessState === 'invited') {
      const confirmed = await confirmAction({
        title: t('Revoke this invitation?'),
        body: t('{name} will no longer be able to use the invitation link.', {
          name: employee.displayName
        }),
        confirmLabel: t('Revoke invitation'),
        cancelLabel: t('Keep invitation'),
        tone: 'danger'
      });
      if (confirmed) {
        await run(
          () => revokeEmployeeInvitation(workspace.activeId!, employee.id),
          'Invitation revoked.'
        );
      }
      return;
    }
    openInvite();
  }

  async function sendInvite(): Promise<void> {
    if (!workspace.activeId || !inviteEmail.trim()) {
      toasts.show(t('Enter an email address to invite.'), 'warning');
      return;
    }
    const sent = await run(
      () =>
        inviteEmployee({
          restaurantId: workspace.activeId!,
          employeeId: employee.id,
          email: inviteEmail.trim(),
          role: inviteRole
        }),
      'Invitation sent.'
    );
    if (sent) discardInvite();
  }

  onMount(() =>
    unsavedChanges.register({
      id: `team-invitation-${employee.id}`,
      label: 'Employee invitation',
      priority: 10,
      isDirty: () => inviteDirty,
      save: sendInvite,
      discard: discardInvite
    })
  );
</script>

<button
  class="access-control"
  type="button"
  {disabled}
  aria-label={`${actionLabel()} · ${employee.displayName}`}
  title={actionLabel()}
  onclick={() => void handleAction()}
>
  <WorkspaceCellBadge
    label={labels[employee.accessState] ?? employee.accessState}
    tone={tone()}
    icon={icon()}
  />
</button>

{#snippet footer()}
  <ActionButton label="Cancel" disabled={busy} onclick={() => void requestInviteClose()} />
  <ActionButton
    label={busy ? 'Sending…' : 'Send invitation'}
    tone="primary"
    disabled={busy || !inviteEmail.trim()}
    onclick={() => void sendInvite()}
  />
{/snippet}

<Dialog
  open={inviteOpen}
  title={t('Invite {name}', { name: employee.displayName })}
  description={t('They receive an email link to set a password and sign in.')}
  size="small"
  onclose={() => !busy && void requestInviteClose()}
  {footer}
>
  <div class="invite-form">
    <label class="cl-label">
      <span>{t('Email')}</span>
      <input class="cl-field" type="email" bind:value={inviteEmail} />
    </label>
    <label class="cl-label">
      <span>{t('Role')}</span>
      <select class="cl-field" bind:value={inviteRole}>
        <option value="employee">{t('Employee')}</option>
        <option value="manager">{t('Manager')}</option>
      </select>
    </label>
  </div>
</Dialog>

<style>
  .access-control {
    width: 100%;
    min-height: var(--cl-row);
    display: flex;
    align-items: center;
    padding: 8px 14px;
    border: 0;
    background: transparent;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .access-control:hover:not(:disabled) {
    background: var(--cl-accent-wash);
  }
  .access-control:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--cl-accent) 48%, transparent);
    outline-offset: -2px;
  }
  .access-control:disabled {
    cursor: default;
  }
  .invite-form {
    display: grid;
    gap: 14px;
  }
</style>
