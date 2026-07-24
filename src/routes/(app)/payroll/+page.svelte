<script lang="ts">
  import { friendlyError } from '$lib/api/error-messages';
  import { t } from '$lib/i18n/i18n.svelte';
  import { personInitials } from '$lib/ui/person';
  import { buildEmployeeColorMap } from '$lib/ui/position-color';
  import { toasts } from '$lib/ui/toast.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import ClassicStat from '$lib/classic/ClassicStat.svelte';
  import ClassicStatus from '$lib/classic/ClassicStatus.svelte';
  import ClassicTeamPage from '$lib/classic/ClassicTeamPage.svelte';
  import EmployeeEditDialog from '$lib/classic/EmployeeEditDialog.svelte';
  import { teamDraft } from '$lib/classic/classic-team.svelte';
  import type { EmployeeDraft } from '$lib/team/team-model';

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

  const TERMS_STATUS: Record<string, { label: string; tone: 'ok' | 'attention' | 'problem' }> = {
    verified: { label: 'Verified', tone: 'ok' },
    complete: { label: 'Recorded', tone: 'ok' },
    recorded: { label: 'Needs review', tone: 'attention' },
    migrated_unverified: { label: 'Needs owner review', tone: 'problem' }
  };

  function payrollGaps(employee: EmployeeDraft): string[] {
    const missing: string[] = [];
    if (!employee.payrollEmployeeId) missing.push('Payroll ID');
    if (!employee.nationalRegistryNumber) missing.push('National registry number');
    if (!employee.iban) missing.push('IBAN');
    if (!employee.cp302ReferenceFunctionCode) missing.push('CP 302 function');
    if (!employee.workerStatus) missing.push('Worker status');
    if (!employee.salaryBasis) missing.push('Salary basis');
    return missing;
  }

  function matches(employee: EmployeeDraft, contractName: Map<string, string>, jobName: Map<string, string>): boolean {
    const term = search.trim().toLowerCase();
    if (!employee.active) return false;
    if (!term) return true;
    return `${employee.displayName} ${employee.payrollEmployeeId} ${contractName.get(employee.contractTypeId) ?? ''} ${employee.jobFunctionIds.map((id) => jobName.get(id) ?? '').join(' ')}`
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

  async function saveEmployee(employee: EmployeeDraft) {
    const role = workspace.effectiveRole;
    if (!workspace.activeId || !role) return;
    saving = true;
    try {
      teamDraft.update(employee.id, employee);
      await teamDraft.save(workspace.activeId, role);
      detailId = '';
      toasts.show(t('Payroll details saved.'), 'success');
    } catch (error) {
      toasts.show(friendlyError(error), 'danger');
    } finally {
      saving = false;
    }
  }
</script>

<svelte:head><title>{t('Payroll')} &middot; restogogo</title></svelte:head>

{#snippet pageActions()}
  <input class="cl-field topbar-search" type="search" placeholder={t('Search employees')} bind:value={search} />
  <select class="cl-field" aria-label={t('Group employees')} bind:value={groupBy}>
    <option value="contract">{t('Group by contract')}</option>
    <option value="position">{t('Group by position')}</option>
    <option value="none">{t('No grouping')}</option>
  </select>
{/snippet}

<ClassicTeamPage actions={pageActions}>
  {#snippet children(team)}
    {@const rows = team.employees.filter((employee) => matches(employee, team.contractName, team.jobName))}
    {@const blocked = rows.filter((employee) => payrollGaps(employee).length).length}
    {@const groups = grouped(rows, team.contractName, team.jobName)}

    {#if teamDraft.supplementaryLoading}
      <div class="cl-notice" role="status">{t('Loading payroll configuration…')}</div>
    {:else if teamDraft.supplementaryError}
      <div class="cl-notice" role="alert">{teamDraft.supplementaryError}</div>
    {/if}

    <div class="cl-stats">
      <ClassicStat label="Active employees" value={rows.length} accent="var(--cl-mod-payroll)" mutedZero={false} />
      <ClassicStat label="Ready for payroll" value={rows.length - blocked} tone={rows.length - blocked === rows.length && rows.length ? 'ok' : undefined} accent="var(--cl-ok)" mutedZero={false} />
      <ClassicStat label="Not ready for payroll" value={blocked} tone={blocked ? 'problem' : 'ok'} />
    </div>

    <div class="cl-tablewrap">
      <table class="cl-table">
        <thead><tr><th>{t('Name')}</th><th>{t('Payroll ID')}</th><th>{t('Worker status')}</th><th class="is-num">{t('CP 302 category')}</th><th>{t('Salary basis')}</th><th>{t('Terms')}</th><th>{t('Status')}</th><th></th></tr></thead>
        {#if !rows.length}
          <tbody><tr><td colspan="8"><div class="cl-empty"><strong>{t('No active employees')}</strong></div></td></tr></tbody>
        {:else}
          {#each groups as group (group.key)}
            <tbody>
              {#if groupBy !== 'none'}<tr class="cl-group-row"><td colspan="8">{group.label}<span class="cl-group-row__count">{t('{count} people', { count: group.employees.length })}</span></td></tr>{/if}
              {#each group.employees as employee (employee.id)}
                {@const missing = payrollGaps(employee)}
                {@const terms = TERMS_STATUS[employee.employmentSourceStatus]}
                <tr class:is-problem={missing.length > 0}>
                  <td><span class="cl-table__name"><span class="cl-avatar" style="--avatar-color:{employeeColor.get(employee.id) ?? 'var(--cl-muted)'}">{personInitials(employee.displayName)}</span>{employee.displayName}</span></td>
                  <td class="is-quiet">{employee.payrollEmployeeId || '—'}</td>
                  <td class="is-quiet">{employee.workerStatus ? t(employee.workerStatus === 'blue_collar' ? 'Blue-collar worker' : 'White-collar employee') : '—'}</td>
                  <td class="is-num">{employee.cp302Category || '—'}</td>
                  <td class="is-quiet">{employee.salaryBasis ? t(employee.salaryBasis === 'monthly' ? 'Monthly' : 'Hourly') : '—'}</td>
                  <td class="is-quiet">{t(terms?.label ?? employee.employmentSourceStatus)}</td>
                  <td>
                    {#if missing.length}
                      <ClassicStatus label={missing.length === 1 ? '1 detail missing' : '{count} details missing'} params={{ count: missing.length }} tone="problem" />
                      <span class="missing">{missing.map((item) => t(item)).join(', ')}</span>
                    {:else}<ClassicStatus label="Ready for payroll" tone="ok" />{/if}
                  </td>
                  <td class="is-num"><button class="cl-btn edit" type="button" disabled={!team.owner || !team.editable || teamDraft.supplementaryLoading} onclick={() => (detailId = employee.id)}>{t('Edit')}</button></td>
                </tr>
              {/each}
            </tbody>
          {/each}
        {/if}
      </table>
    </div>

    <EmployeeEditDialog open={Boolean(detailId)} employeeId={detailId} mode="payroll" {saving} onclose={() => (detailId = '')} onsave={saveEmployee} />
  {/snippet}
</ClassicTeamPage>

<style>
  .missing { display: block; color: var(--cl-muted); font-size: 13px; }
  .edit { min-height: 30px; padding: 4px 10px; font-size: 13px; }
</style>
