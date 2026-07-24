<script lang="ts">
  import { t } from '$lib/i18n/i18n.svelte';
  import { personInitials } from '$lib/ui/person';
  import { buildEmployeeColorMap } from '$lib/ui/position-color';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { newEmployeeDraft, type EmployeeDraft } from '$lib/team/team-model';
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
  let freshId = $state('');

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

  function addEmployee() {
    if (workspace.isPreview || !workspace.team || workspace.effectiveRole !== 'owner') return;
    const draft = newEmployeeDraft(crypto.randomUUID());
    draft.displayName = '';
    teamDraft.employees = [draft, ...teamDraft.employees];
    freshId = draft.id;
    detailId = draft.id;
    search = '';
    groupBy = 'contract';
  }

  function closeDetails() {
    detailId = '';
    freshId = '';
  }

  function gaps(employee: EmployeeDraft): string[] {
    const missing: string[] = [];
    if (!employee.contractTypeId) missing.push('Contract type');
    if (!employee.contractStart) missing.push('Start date');
    if (!Number(employee.weeklyContractHours)) missing.push('Weekly hours');
    return missing;
  }

  function matches(employee: EmployeeDraft, contractName: Map<string, string>, jobName: Map<string, string>): boolean {
    const term = search.trim().toLowerCase();
    if (!employee.active && employee.id !== freshId) return false;
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
</script>

<svelte:head><title>{t('Contracts')} &middot; restogogo</title></svelte:head>

<ClassicTeamPage>
  {#snippet children(team)}
    {@const rows = team.employees.filter((employee) => matches(employee, team.contractName, team.jobName))}
    {@const incomplete = rows.filter((employee) => gaps(employee).length).length}
    {@const groups = grouped(rows, team.contractName, team.jobName)}

    <div class="cl-stats">
      <ClassicStat label="Active employees" value={rows.length} accent="var(--cl-mod-team)" mutedZero={false} />
      <ClassicStat label="Incomplete contracts" value={incomplete} tone={incomplete ? 'attention' : 'ok'} />
    </div>

    <div class="cl-datatable">
      <div class="cl-datatable__tools">
        <span class="cl-datatable__search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg>
          <input class="cl-field" type="search" placeholder={t('Search employees')} bind:value={search} />
        </span>
        <select class="cl-field" aria-label={t('Group employees')} bind:value={groupBy}>
          <option value="contract">{t('Group by contract')}</option>
          <option value="position">{t('Group by position')}</option>
          <option value="none">{t('No grouping')}</option>
        </select>
        <span class="cl-grow"></span>
        <button class="cl-btn" type="button" disabled={workspace.isPreview || workspace.effectiveRole !== 'owner' || !workspace.team} onclick={addEmployee}>
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          <span class="cl-action-label">{t('Add employee')}</span>
        </button>
      </div>

      <div class="cl-tablewrap">
        <table class="cl-table contract-table">
        <thead><tr><th>{t('Name')}</th><th>{t('Contract')}</th><th>{t('Work regime')}</th><th>{t('Start')}</th><th>{t('End')}</th><th class="is-num">{t('Weekly hours')}</th><th>{t('Status')}</th><th></th></tr></thead>
        {#if !rows.length}
          <tbody><tr><td colspan="8"><div class="cl-empty"><strong>{t('No active employees')}</strong><span>{t('Add someone to define their contract and payroll setup.')}</span></div></td></tr></tbody>
        {:else}
          {#each groups as group (group.key)}
            <tbody>
              {#if groupBy !== 'none'}<tr class="cl-group-row"><td colspan="8">{group.label}<span class="cl-group-row__count">{t('{count} people', { count: group.employees.length })}</span></td></tr>{/if}
              {#each group.employees as employee (employee.id)}
                {@const missing = gaps(employee)}
                <tr class:is-attention={missing.length > 0 || employee.id === freshId}>
                  <td><span class="cl-table__name"><span class="cl-avatar" style="--avatar-color:{employeeColor.get(employee.id) ?? 'var(--cl-muted)'}">{personInitials(employee.displayName || '?')}</span>{employee.displayName || t('New employee')}</span></td>
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
                  <td class="is-num"><button class="cl-btn edit" type="button" disabled={!team.owner || !team.editable} onclick={() => (detailId = employee.id)}>{t('Details')}</button></td>
                </tr>
              {/each}
            </tbody>
          {/each}
        {/if}
        </table>
      </div>
    </div>

    {#if detailId}
      <EmployeeInlineEditor employeeId={detailId} mode="contract" saving={team.saving} isNew={detailId === freshId} onclose={closeDetails} onsave={team.saveEmployee} />
    {/if}
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
