<script lang="ts">
  import { t } from '$lib/i18n/i18n.svelte';
  import { personInitials } from '$lib/ui/person';
  import { buildEmployeeColorMap } from '$lib/ui/position-color';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import ClassicStat from '$lib/classic/ClassicStat.svelte';
  import ClassicStatus from '$lib/classic/ClassicStatus.svelte';
  import ClassicTeamPage from '$lib/classic/ClassicTeamPage.svelte';
  import EmployeeInlineEditor from '$lib/classic/EmployeeInlineEditor.svelte';
  import { teamDraft } from '$lib/classic/classic-team.svelte';
  import type { EmployeeDraft } from '$lib/team/team-model';

  type GroupBy = 'contract' | 'position' | 'none';
  type Group = { key: string; label: string; employees: EmployeeDraft[] };

  let search = $state('');
  let groupBy = $state<GroupBy>('contract');
  let detailId = $state('');

  const employeeColor = $derived(
    workspace.team
      ? buildEmployeeColorMap(workspace.team.job_functions, workspace.team.employee_job_functions)
      : new Map<string, string>()
  );
  const referenceFunctions = $derived(
    teamDraft.payrollCatalogue?.referenceFunctions.filter((item) => item.status === 'effective' || item.status === 'verified') ?? []
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

  function setReferenceFunction(employee: EmployeeDraft, code: string) {
    const reference = referenceFunctions.find((item) => item.code === code);
    teamDraft.update(employee.id, {
      cp302ReferenceFunctionCode: code,
      cp302Category: reference?.category ?? '',
      workerStatus: reference?.default_worker_status ?? ''
    });
  }

</script>

<svelte:head><title>{t('Payroll')} &middot; restogogo</title></svelte:head>

{#snippet pageActions()}
  <input class="cl-field toolbar-search" type="search" placeholder={t('Search employees')} bind:value={search} />
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
      <table class="cl-table payroll-table">
        <thead><tr><th>{t('Name')}</th><th>{t('Payroll ID')}</th><th>{t('CP 302 function')}</th><th>{t('Worker status')}</th><th>{t('Salary basis')}</th><th>{t('Rate')}</th><th>{t('Status')}</th><th></th></tr></thead>
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
                  <td><input class="cl-field payrollid" value={employee.payrollEmployeeId} disabled={!team.owner || !team.editable} oninput={(event) => teamDraft.update(employee.id, { payrollEmployeeId: event.currentTarget.value })} /></td>
                  <td>
                    <select class="cl-field functionfield" value={employee.cp302ReferenceFunctionCode} disabled={!team.owner || !team.editable || teamDraft.supplementaryLoading} onchange={(event) => setReferenceFunction(employee, event.currentTarget.value)}>
                      <option value="">{t('Not set')}</option>
                      {#each referenceFunctions as item (item.id)}<option value={item.code}>{item.code} · {item.name_en || item.name_fr || item.name_nl}</option>{/each}
                    </select>
                  </td>
                  <td class="is-quiet">{employee.workerStatus ? t(employee.workerStatus === 'blue_collar' ? 'Blue-collar worker' : 'White-collar employee') : '—'}</td>
                  <td><select class="cl-field basisfield" value={employee.salaryBasis} disabled={!team.owner || !team.editable} onchange={(event) => teamDraft.update(employee.id, { salaryBasis: event.currentTarget.value as EmployeeDraft['salaryBasis'] })}><option value="">{t('Not set')}</option><option value="hourly">{t('Hourly')}</option><option value="monthly">{t('Monthly')}</option></select></td>
                  <td>
                    {#if employee.salaryBasis === 'monthly'}
                      <input class="cl-field ratefield" inputmode="decimal" value={employee.contractualMonthlySalary} disabled={!team.owner || !team.editable} oninput={(event) => teamDraft.update(employee.id, { contractualMonthlySalary: event.currentTarget.value })} />
                    {:else}
                      <input class="cl-field ratefield" inputmode="decimal" value={employee.contractualHourlyRate} disabled={!team.owner || !team.editable} oninput={(event) => teamDraft.update(employee.id, { contractualHourlyRate: event.currentTarget.value })} />
                    {/if}
                  </td>
                  <td>
                    {#if missing.length}
                      <ClassicStatus label={missing.length === 1 ? '1 detail missing' : '{count} details missing'} params={{ count: missing.length }} tone="problem" />
                      <span class="missing">{missing.map((item) => t(item)).join(', ')}</span>
                    {:else}<ClassicStatus label={terms?.label ?? 'Ready for payroll'} tone={terms?.tone ?? 'ok'} />{/if}
                  </td>
                  <td class="is-num"><button class="cl-btn edit" type="button" disabled={!team.owner || !team.editable || teamDraft.supplementaryLoading} onclick={() => (detailId = employee.id)}>{t('Details')}</button></td>
                </tr>
              {/each}
            </tbody>
          {/each}
        {/if}
      </table>
    </div>

    {#if detailId}
      <EmployeeInlineEditor employeeId={detailId} mode="payroll" saving={team.saving} onclose={() => (detailId = '')} onsave={team.saveEmployee} />
    {/if}
  {/snippet}
</ClassicTeamPage>

<style>
  .missing { display: block; color: var(--cl-muted); font-size: 12px; }
  .edit { min-height: 30px; padding: 4px 10px; font-size: 13px; }
  .payrollid { min-width: 120px; height: 34px; }
  .functionfield { min-width: 210px; max-width: 280px; height: 34px; }
  .basisfield { min-width: 108px; height: 34px; }
  .ratefield { width: 105px; height: 34px; }
</style>
