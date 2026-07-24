<script lang="ts">
  import { friendlyError } from '$lib/api/error-messages';
  import { t } from '$lib/i18n/i18n.svelte';
  import { personInitials } from '$lib/ui/person';
  import { buildEmployeeColorMap } from '$lib/ui/position-color';
  import { toasts } from '$lib/ui/toast.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import type { EmployeeDraft } from '$lib/team/team-model';
  import ClassicStat from '$lib/classic/ClassicStat.svelte';
  import ClassicStatus from '$lib/classic/ClassicStatus.svelte';
  import ClassicTeamPage from '$lib/classic/ClassicTeamPage.svelte';
  import EmployeeInlineEditor from '$lib/classic/EmployeeInlineEditor.svelte';
  import { teamDraft } from '$lib/classic/classic-team.svelte';

  type GroupBy = 'contract' | 'position' | 'none';
  type Group = { key: string; label: string; employees: EmployeeDraft[] };

  let search = $state('');
  let groupBy = $state<GroupBy>('contract');
  let detailId = $state('');
  let saving = $state(false);

  const employeeColor = $derived(
    workspace.team
      ? buildEmployeeColorMap(workspace.team.job_functions, workspace.team.employee_job_functions)
      : new Map<string, string>()
  );
  const contractTypes = $derived(workspace.team?.contract_types.filter((item) => item.active) ?? []);

  const REGIME_LABEL: Record<string, string> = {
    weekly_availability: 'Weekly availability',
    fixed_schedule: 'Fixed schedule',
    manager_only: 'Manager planned'
  };

  function gaps(employee: EmployeeDraft): string[] {
    const missing: string[] = [];
    if (!employee.contractTypeId) missing.push('Contract type');
    if (!employee.contractStart) missing.push('Start date');
    if (!Number(employee.weeklyContractHours)) missing.push('Weekly hours');
    return missing;
  }

  function matches(employee: EmployeeDraft, contractName: Map<string, string>, jobName: Map<string, string>): boolean {
    const term = search.trim().toLowerCase();
    if (!employee.active) return false;
    if (!term) return true;
    return `${employee.displayName} ${contractName.get(employee.contractTypeId) ?? ''} ${employee.jobFunctionIds.map((id) => jobName.get(id) ?? '').join(' ')}`
      .toLowerCase()
      .includes(term);
  }

  function grouped(rows: EmployeeDraft[], contractName: Map<string, string>, jobName: Map<string, string>): Group[] {
    if (groupBy === 'none') return [{ key: 'all', label: '', employees: rows }];
    const map = new Map<string, Group>();
    for (const employee of rows) {
      const id = groupBy === 'contract' ? employee.contractTypeId : employee.jobFunctionIds[0] ?? '';
      const label = id
        ? (groupBy === 'contract' ? contractName.get(id) : jobName.get(id)) ?? t('Unknown')
        : groupBy === 'contract' ? t('No contract yet') : t('No position yet');
      const key = id || '__undefined__';
      const group = map.get(key) ?? { key, label, employees: [] };
      group.employees.push(employee);
      map.set(key, group);
    }
    return [...map.values()].sort((left, right) => {
      if (left.key === '__undefined__') return -1;
      if (right.key === '__undefined__') return 1;
      return left.label.localeCompare(right.label);
    });
  }

  function setContractType(employee: EmployeeDraft, contractTypeId: string) {
    const code = contractTypes.find((item) => item.id === contractTypeId)?.code;
    teamDraft.update(employee.id, {
      contractTypeId,
      contractEnd: code === 'CDI' ? '' : employee.contractEnd,
      employmentValidTo: code === 'CDI' ? '' : employee.employmentValidTo
    });
  }

  async function persist(closeEditor = false) {
    const role = workspace.effectiveRole;
    if (!workspace.activeId || !role || saving) return;
    saving = true;
    try {
      await teamDraft.save(workspace.activeId, role);
      if (closeEditor) detailId = '';
      toasts.show(t('Team saved.'), 'success');
    } catch (error) {
      toasts.show(friendlyError(error), 'danger');
    } finally {
      saving = false;
    }
  }

  async function saveEmployee(employee: EmployeeDraft) {
    teamDraft.update(employee.id, employee);
    await persist(true);
  }
</script>

<svelte:head><title>{t('Contracts')} &middot; restogogo</title></svelte:head>

{#snippet pageActions()}
  <input class="cl-field toolbar-search" type="search" placeholder={t('Search employees')} bind:value={search} />
  <select class="cl-field" aria-label={t('Group employees')} bind:value={groupBy}>
    <option value="contract">{t('Group by contract')}</option>
    <option value="position">{t('Group by position')}</option>
    <option value="none">{t('No grouping')}</option>
  </select>
  <span class="toolbar-grow"></span>
  <button class="cl-btn is-icon" type="button" disabled={saving || !teamDraft.dirty || !workspace.team} title={t('Discard')} aria-label={t('Discard')} onclick={() => workspace.team && teamDraft.reload(workspace.team)}>
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6"/><path d="M4 4v4.6h4.6"/></svg>
  </button>
  <button class="cl-btn is-primary is-icon" type="button" disabled={saving || workspace.isPreview || !teamDraft.dirty} title={t(saving ? 'Saving…' : 'Save')} aria-label={t(saving ? 'Saving…' : 'Save')} onclick={() => persist()}>
    {#if saving}<span aria-hidden="true">…</span>{:else}<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h12l2 2v14H5z"/><path d="M8 4v6h8V4M8 20v-6h8v6"/></svg>{/if}
  </button>
{/snippet}

<ClassicTeamPage actions={pageActions}>
  {#snippet children(team)}
    {@const rows = team.employees.filter((employee) => matches(employee, team.contractName, team.jobName))}
    {@const incomplete = rows.filter((employee) => gaps(employee).length).length}
    {@const groups = grouped(rows, team.contractName, team.jobName)}

    <div class="cl-stats">
      <ClassicStat label="Active employees" value={rows.length} accent="var(--cl-mod-team)" mutedZero={false} />
      <ClassicStat label="Incomplete contracts" value={incomplete} tone={incomplete ? 'attention' : 'ok'} />
    </div>

    <div class="cl-tablewrap">
      <table class="cl-table contract-table">
        <thead><tr><th>{t('Name')}</th><th>{t('Contract')}</th><th>{t('Work regime')}</th><th>{t('Start')}</th><th>{t('End')}</th><th class="is-num">{t('Weekly hours')}</th><th>{t('Status')}</th><th></th></tr></thead>
        {#if !rows.length}
          <tbody><tr><td colspan="8"><div class="cl-empty"><strong>{t('No active employees')}</strong><span>{t('Add someone on the People page first.')}</span></div></td></tr></tbody>
        {:else}
          {#each groups as group (group.key)}
            <tbody>
              {#if groupBy !== 'none'}<tr class="cl-group-row"><td colspan="8">{group.label}<span class="cl-group-row__count">{t('{count} people', { count: group.employees.length })}</span></td></tr>{/if}
              {#each group.employees as employee (employee.id)}
                {@const missing = gaps(employee)}
                <tr class:is-attention={missing.length > 0}>
                  <td><span class="cl-table__name"><span class="cl-avatar" style="--avatar-color:{employeeColor.get(employee.id) ?? 'var(--cl-muted)'}">{personInitials(employee.displayName)}</span>{employee.displayName}</span></td>
                  <td>
                    <select class="cl-field cellfield" value={employee.contractTypeId} disabled={!team.owner || !team.editable} onchange={(event) => setContractType(employee, event.currentTarget.value)}>
                      <option value="">{t('Not set')}</option>
                      {#each contractTypes as item (item.id)}<option value={item.id}>{item.name}</option>{/each}
                    </select>
                  </td>
                  <td>
                    <select class="cl-field cellfield regime" value={employee.workRegime} disabled={!team.owner || !team.editable} onchange={(event) => teamDraft.update(employee.id, { workRegime: event.currentTarget.value as EmployeeDraft['workRegime'] })}>
                      {#each Object.entries(REGIME_LABEL) as [value, label] (value)}<option value={value}>{t(label)}</option>{/each}
                    </select>
                  </td>
                  <td><input class="cl-field datefield" type="date" value={employee.contractStart} disabled={!team.owner || !team.editable} oninput={(event) => teamDraft.update(employee.id, { contractStart: event.currentTarget.value, employmentValidFrom: employee.employmentValidFrom || event.currentTarget.value })} /></td>
                  <td><input class="cl-field datefield" type="date" value={employee.contractEnd} disabled={!team.owner || !team.editable || contractTypes.find((item) => item.id === employee.contractTypeId)?.code === 'CDI'} oninput={(event) => teamDraft.update(employee.id, { contractEnd: event.currentTarget.value })} /></td>
                  <td class="is-num"><input class="cl-field hoursfield" type="number" min="0" step="0.25" value={employee.weeklyContractHours} disabled={!team.owner || !team.editable} oninput={(event) => teamDraft.update(employee.id, { weeklyContractHours: event.currentTarget.valueAsNumber || 0 })} /></td>
                  <td>
                    {#if missing.length}
                      <ClassicStatus label={missing.length === 1 ? '1 detail missing' : '{count} details missing'} params={{ count: missing.length }} tone="attention" />
                      <span class="missing">{missing.map((item) => t(item)).join(', ')}</span>
                    {:else}<ClassicStatus label="Complete" tone="ok" />{/if}
                  </td>
                  <td class="is-num"><button class="cl-btn edit" type="button" disabled={!team.owner || !team.editable} aria-expanded={detailId === employee.id} onclick={() => (detailId = detailId === employee.id ? '' : employee.id)}>{t(detailId === employee.id ? 'Close' : 'More')}</button></td>
                </tr>
                {#if detailId === employee.id}
                  <tr class="cl-editor-row"><td colspan="8"><EmployeeInlineEditor employeeId={employee.id} mode="contract" {saving} onclose={() => (detailId = '')} onsave={saveEmployee} /></td></tr>
                {/if}
              {/each}
            </tbody>
          {/each}
        {/if}
      </table>
    </div>
  {/snippet}
</ClassicTeamPage>

<style>
  .missing { display: block; color: var(--cl-muted); font-size: 12px; }
  .edit { min-height: 30px; padding: 4px 10px; font-size: 13px; }
  .cellfield { min-width: 150px; height: 34px; }
  .regime { min-width: 160px; }
  .datefield { min-width: 138px; height: 34px; }
  .hoursfield { width: 88px; height: 34px; text-align: right; }
</style>
