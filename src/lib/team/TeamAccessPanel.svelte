<script lang="ts">
  import ActionButton from '$lib/components/ActionButton.svelte';
  import Panel from '$lib/components/Panel.svelte';
  import type { EmployeeDraft } from './team-model';

  let {
    employee,
    inviteRole = $bindable(),
    owner,
    busy,
    dirty,
    canManage,
    onBadgeChange,
    onSendInvite,
    onRevokeInvite,
    onChangeAccess
  }: {
    employee: EmployeeDraft;
    inviteRole: 'employee' | 'manager';
    owner: boolean;
    busy: boolean;
    dirty: boolean;
    canManage: boolean;
    onBadgeChange: (enabled: boolean) => void;
    onSendInvite: () => void;
    onRevokeInvite: () => void;
    onChangeAccess: (action: 'disable' | 'restore') => void;
  } = $props();

  const statusTone = $derived.by(() => {
    if (employee.accessState === 'active') return 'success';
    if (employee.accessState === 'invited') return 'warning';
    if (['disabled', 'revoked', 'expired'].includes(employee.accessState)) return 'danger';
    return 'neutral';
  });
  const statusDetail = $derived(
    employee.accessRole
      ? `Workspace role: ${employee.accessRole}`
      : employee.invitationSentAt
        ? `Invited as ${employee.invitationRole} · sent ${new Date(employee.invitationSentAt).toLocaleDateString()}`
        : 'No workspace access yet — send an invitation to get started.'
  );
</script>

<div class={`access-status is-${statusTone}`}>
  <div class="access-status__badge"><i></i></div>
  <div>
    <strong>{employee.accessState.replace('_', ' ')}</strong>
    <span>{statusDetail}</span>
  </div>
</div>

<Panel title="Access actions" eyebrow="Security">
  <div class="action-row">
    {#if !employee.profileId}
      <label class="role-select">
        Invitation role
        <select bind:value={inviteRole}>
          <option value="employee">Employee</option>
          {#if owner}<option value="manager">Manager</option>{/if}
        </select>
      </label>
      <p class="hint">The invitation stays tied to the saved employee email until that person accepts it.</p>
      <div class="actions">
        <ActionButton
          label={busy
            ? 'Sending…'
            : employee.accessState === 'invited'
              ? 'Resend invitation'
              : 'Send invitation'}
          tone="primary"
          disabled={busy || dirty || !employee.email || !canManage}
          onclick={onSendInvite}
        />
        {#if employee.accessState === 'invited'}
          <ActionButton label="Revoke invitation" tone="danger" disabled={busy || !canManage} onclick={onRevokeInvite} />
        {/if}
      </div>
    {:else}
      <p class="hint">Workspace access and badge permission are durable account controls. Invitations are no longer involved after acceptance.</p>
      {#if employee.accessRole !== 'owner'}
        <div class="actions">
          <ActionButton
            label={busy
              ? 'Updating…'
              : employee.accessState === 'disabled'
                ? 'Restore access'
                : 'Disable access'}
            tone={employee.accessState === 'disabled' ? 'primary' : 'danger'}
            disabled={busy || dirty || !canManage}
            onclick={() =>
              onChangeAccess(
                employee.accessState === 'disabled' ? 'restore' : 'disable'
              )}
          />
        </div>
      {/if}
    {/if}
  </div>
</Panel>

<Panel title="Technical details" eyebrow="Badge and PIN">
  <div class="fields">
    <label>PIN status<input value={employee.pinStatus} disabled /></label>
    <label class="check">
      <input
        type="checkbox"
        checked={employee.badgeEnabled}
        onchange={(event) => onBadgeChange(event.currentTarget.checked)}
      />
      Badge terminal enabled
    </label>
    {#if employee.invitationSentAt && !employee.profileId}
      <label>Last invitation<input value={new Date(employee.invitationSentAt).toLocaleString()} disabled /></label>
    {/if}
    {#if employee.accessState === 'invited' && employee.invitationExpiresAt}
      <label>Invitation expires<input value={new Date(employee.invitationExpiresAt).toLocaleString()} disabled /></label>
    {/if}
  </div>
</Panel>

<style>
  .access-status {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 14px;
    padding: 16px;
    border-radius: var(--rst-ui-radius-xl);
    background: var(--rst-ui-surface-panel);
    border: 1px solid var(--rst-ui-line);
    animation: rst-fade-up .35s var(--rst-ease-out) backwards;
  }
  .access-status.is-success { background: linear-gradient(135deg, rgba(var(--rst-state-success-rgb), .16), transparent 60%), var(--rst-ui-surface-panel); border-color: rgba(var(--rst-state-success-rgb), .3); }
  .access-status.is-warning { background: linear-gradient(135deg, rgba(var(--rst-state-warning-rgb), .16), transparent 60%), var(--rst-ui-surface-panel); border-color: rgba(var(--rst-state-warning-rgb), .3); }
  .access-status.is-danger { background: linear-gradient(135deg, rgba(var(--rst-state-danger-rgb), .16), transparent 60%), var(--rst-ui-surface-panel); border-color: rgba(var(--rst-state-danger-rgb), .3); }
  .access-status__badge { width: 44px; height: 44px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 999px; background: var(--rst-state-neutral-bg); }
  .access-status.is-success .access-status__badge { background: var(--rst-state-success-bg); }
  .access-status.is-warning .access-status__badge { background: var(--rst-state-warning-bg); }
  .access-status.is-danger .access-status__badge { background: var(--rst-state-danger-bg); }
  .access-status__badge i { width: 12px; height: 12px; display: block; border-radius: 999px; background: var(--rst-ui-quiet); animation: rst-pulse-soft 2.2s ease-in-out infinite; }
  .access-status.is-success .access-status__badge i { background: var(--rst-state-success); box-shadow: 0 0 0 4px rgba(var(--rst-state-success-rgb), .2); }
  .access-status.is-warning .access-status__badge i { background: var(--rst-state-warning); box-shadow: 0 0 0 4px rgba(var(--rst-state-warning-rgb), .2); }
  .access-status.is-danger .access-status__badge i { background: var(--rst-state-danger); box-shadow: 0 0 0 4px rgba(var(--rst-state-danger-rgb), .2); }
  .access-status strong { display: block; font-size: 16px; text-transform: capitalize; }
  .access-status span { color: var(--rst-ui-muted); font-size: 12px; }

  .action-row { display: grid; gap: 12px; }
  .role-select { display: grid; gap: 6px; max-width: 260px; color: var(--rst-ui-muted); font-size: 11px; font-weight: var(--rst-fw-bold); }
  .fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  label { display: grid; gap: 6px; color: var(--rst-ui-muted); font-size: 11px; font-weight: var(--rst-fw-bold); }
  input, select { min-height: 36px; padding: 6px 2px; border: 0; border-bottom: 1.5px solid var(--rst-ui-line); border-radius: 0; color: var(--rst-ui-text); background: transparent; font: inherit; transition: border-color .15s ease, box-shadow .15s ease; }
  input:focus-visible, select:focus-visible { border-bottom-color: var(--rst-ui-action); outline: none; box-shadow: 0 1.5px 0 0 var(--rst-ui-action); }
  .check { display: flex; align-items: center; gap: 8px; }
  .check input { min-height: auto; }
  .hint { margin: 0; color: var(--rst-ui-muted); line-height: 1.45; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; }

  @media (max-width: 760px) {
    .fields { grid-template-columns: 1fr; }
    .actions { justify-content: stretch; }
  }
</style>
