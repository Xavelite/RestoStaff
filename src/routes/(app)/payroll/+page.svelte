<script lang="ts">
  import { t } from '$lib/i18n/i18n.svelte';
  import { personInitials } from '$lib/ui/person';
  import { buildEmployeeColorMap } from '$lib/ui/position-color';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import ClassicStat from '$lib/classic/ClassicStat.svelte';
  import ClassicStatus from '$lib/classic/ClassicStatus.svelte';
  import ClassicTeamPage from '$lib/classic/ClassicTeamPage.svelte';
  import type { EmployeeDraft } from '$lib/team/team-model';

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

  /** What payroll cannot run without. Naming each gap beats one red badge. */
  function payrollGaps(employee: EmployeeDraft): string[] {
    const missing: string[] = [];
    if (!employee.payrollEmployeeId) missing.push('Payroll ID');
    if (!employee.nationalRegistryNumber) missing.push('National registry number');
    if (!employee.iban) missing.push('IBAN');
    if (!employee.cp302Category) missing.push('CP 302 category');
    if (!employee.workerStatus) missing.push('Worker status');
    return missing;
  }
</script>

<svelte:head><title>{t('Payroll')} &middot; restogogo</title></svelte:head>

<!-- Employment terms are per employee, so this reads the same roster the Team
     module edits rather than loading a second copy. -->
<ClassicTeamPage title="Payroll" subtitle="Employment terms">
  {#snippet children(team)}
    {@const rows = team.employees.filter((employee) => employee.active)}
    {@const blocked = rows.filter((employee) => payrollGaps(employee).length).length}

    <div class="cl-stats">
      <ClassicStat label="Active employees" value={rows.length} accent="var(--cl-mod-payroll)" mutedZero={false} />
      <ClassicStat label="Ready for payroll" value={rows.length - blocked} tone={rows.length - blocked === rows.length && rows.length ? 'ok' : undefined} accent="var(--cl-ok)" mutedZero={false} />
      <ClassicStat label="Not ready for payroll" value={blocked} tone={blocked ? 'problem' : 'ok'} />
    </div>

    <div class="cl-tablewrap">
      <table class="cl-table">
        <thead>
          <tr>
            <th>{t('Name')}</th>
            <th>{t('Payroll ID')}</th>
            <th>{t('Worker status')}</th>
            <th class="is-num">{t('CP 302 category')}</th>
            <th>{t('Salary basis')}</th>
            <th>{t('Terms')}</th>
            <th>{t('Status')}</th>
          </tr>
        </thead>
        <tbody>
          {#if !rows.length}
            <tr>
              <td colspan="7">
                <div class="cl-empty"><strong>{t('No active employees')}</strong></div>
              </td>
            </tr>
          {:else}
            {#each rows as employee (employee.id)}
              {@const missing = payrollGaps(employee)}
              {@const terms = TERMS_STATUS[employee.employmentSourceStatus]}
              <tr class:is-problem={missing.length > 0}>
                <td>
                  <span class="cl-table__name">
                    <span class="cl-avatar" style="--avatar-color:{employeeColor.get(employee.id) ?? 'var(--cl-muted)'}">{personInitials(employee.displayName)}</span>
                    {employee.displayName}
                  </span>
                </td>
                <td class="is-quiet">{employee.payrollEmployeeId || '—'}</td>
                <td class="is-quiet">
                  {employee.workerStatus
                    ? t(employee.workerStatus === 'blue_collar' ? 'Blue-collar worker' : 'White-collar employee')
                    : '—'}
                </td>
                <td class="is-num">{employee.cp302Category || '—'}</td>
                <td class="is-quiet">
                  {employee.salaryBasis ? t(employee.salaryBasis === 'monthly' ? 'Monthly' : 'Hourly') : '—'}
                </td>
                <td class="is-quiet">{t(terms?.label ?? employee.employmentSourceStatus)}</td>
                <td>
                  {#if missing.length}
                    <ClassicStatus
                      label={missing.length === 1 ? '1 detail missing' : '{count} details missing'}
                      params={{ count: missing.length }}
                      tone="problem"
                    />
                    <span class="missing">{missing.map((item) => t(item)).join(', ')}</span>
                  {:else}
                    <ClassicStatus label="Ready for payroll" tone="ok" />
                  {/if}
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  {/snippet}
</ClassicTeamPage>

<style>
  .missing {
    display: block;
    color: var(--cl-muted);
    font-size: 13px;
  }
</style>

