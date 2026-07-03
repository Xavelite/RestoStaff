<script lang="ts">
  import type { EmployeeOperationsReadModel } from '$lib/api/workspace-snapshot';
  import Dialog from '$lib/components/Dialog.svelte';
  import {
    defaultEmployeeTimeOffType,
    employeeTimeOffTypes,
    type EmployeeSelfServiceMode
  } from '$lib/employee/employee-self-service';

  // Shared optional-details dialog for the employee self-service flow used by
  // both Calendar and Shifts: pick a non-default leave type and add a comment.
  // The page owns the request lifecycle; this only edits the two optional inputs.
  let {
    open,
    mode,
    description,
    absenceTypes,
    absenceTypeId = $bindable(),
    comment = $bindable(),
    onclose
  }: {
    open: boolean;
    mode: EmployeeSelfServiceMode;
    description: string;
    absenceTypes: EmployeeOperationsReadModel['absence_types'];
    absenceTypeId: string;
    comment: string;
    onclose: () => void;
  } = $props();

  const defaultType = $derived(defaultEmployeeTimeOffType(absenceTypes));
  const types = $derived(employeeTimeOffTypes(absenceTypes));
</script>

<Dialog
  {open}
  title={mode === 'time_off' ? 'Time-off request details' : 'Availability change details'}
  {description}
  size="small"
  {onclose}
>
  <div class="action-details">
    {#if mode === 'time_off'}
      <label>
        Leave type
        <select bind:value={absenceTypeId}>
          <option value={defaultType?.id ?? ''}>{defaultType?.name ?? 'Default holiday'}</option>
          {#each types.filter((item) => item.id !== defaultType?.id) as type (type.id)}
            <option value={type.id}>{type.name}</option>
          {/each}
        </select>
      </label>
    {/if}
    <label>
      Comment
      <input bind:value={comment} placeholder="Optional context for your manager" />
    </label>
  </div>
</Dialog>

<style>
  .action-details { display: grid; gap: 12px; }
  .action-details label { display: grid; gap: 6px; color: var(--rst-ui-muted); font-size: 11px; font-weight: var(--rst-fw-bold); }
  .action-details input, .action-details select { min-height: 40px; padding: 8px 10px; border: 1px solid var(--rst-ui-line); border-radius: var(--rst-ui-radius-md); color: var(--rst-ui-text); background: var(--rst-ui-surface-field-strong); font: inherit; }
</style>
