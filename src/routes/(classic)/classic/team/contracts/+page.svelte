<script lang="ts">
  import { t } from '$lib/i18n/i18n.svelte';
  import { personInitials } from '$lib/ui/person';
  import { buildEmployeeColorMap } from '$lib/ui/position-color';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import type { EmployeeDraft } from '$lib/team/team-model';
  import ClassicStat from '$lib/classic/ClassicStat.svelte';
  import ClassicStatus from '$lib/classic/ClassicStatus.svelte';
  import ClassicTeamPage from '$lib/classic/ClassicTeamPage.svelte';

  const employeeColor = $derived(
    workspace.team
      ? buildEmployeeColorMap(workspace.team.job_functions, workspace.team.employee_job_functions)
      : new Map<string, string>()
  );

  const REGIME_LABEL: Record<string, string> = {
    weekly_availability: 'Weekly availability',
    fixed_schedule: 'Fixed schedule',
    manager: 'Manager'
  };

  /**
   * What has to be true before someone can be planned and paid. Listing the
   * missing pieces by name beats a single "incomplete" badge.
   */
  function gaps(employee: EmployeeDraft): string[] {
    const missing: string[] = [];
    if (!employee.contractTypeId) missing.push('Contract type');
    if (!employee.contractStart) missing.push('Start date');
    if (!Number(employee.weeklyContractHours)) missing.push('Weekly hours');
    if (!employee.workerStatus) missing.push('Worker status');
    return missing;
  }
</script>

<svelte:head><title>{t('Contracts')} &middot; restogogo</title></svelte:head>

<ClassicTeamPage subtitle="Contracts">
  {#snippet children(team)}
    {@const rows = team.employees.filter((employee) => employee.active)}
    {@const incomplete = rows.filter((employee) => gaps(employee).length).length}

    <div class="cl-stats">
      <ClassicStat label="Active employees" value={rows.length} accent="var(--cl-mod-team)" mutedZero={false} />
      <ClassicStat label="Incomplete contracts" value={incomplete} tone={incomplete ? 'attention' : 'ok'} />
    </div>

    <div class="cl-tablewrap">
      <table class="cl-table">
        <thead>
          <tr>
            <th>{t('Name')}</th>
            <th>{t('Contract')}</th>
            <th>{t('Work regime')}</th>
            <th>{t('Start')}</th>
            <th>{t('End')}</th>
            <th class="is-num">{t('Weekly hours')}</th>
            <th>{t('Status')}</th>
          </tr>
        </thead>
        <tbody>
          {#if !rows.length}
            <tr>
              <td colspan="7">
                <div class="cl-empty">
                  <strong>{t('No active employees')}</strong>
                  <span>{t('Add someone on the People page first.')}</span>
                </div>
              </td>
            </tr>
          {:else}
            {#each rows as employee (employee.id)}
              {@const missing = gaps(employee)}
              <tr class:is-attention={missing.length > 0}>
                <td>
                  <span class="cl-table__name">
                    <span class="cl-avatar" style="--avatar-color:{employeeColor.get(employee.id) ?? 'var(--cl-muted)'}">{personInitials(employee.displayName)}</span>
                    {employee.displayName}
                  </span>
                </td>
                <td class="is-quiet">{team.contractName.get(employee.contractTypeId) ?? '—'}</td>
                <td class="is-quiet">{t(REGIME_LABEL[employee.workRegime] ?? employee.workRegime)}</td>
                <td class="is-quiet">{employee.contractStart || '—'}</td>
                <td class="is-quiet">{employee.contractEnd || '—'}</td>
                <td class="is-num">{employee.weeklyContractHours || '—'}</td>
                <td>
                  {#if missing.length}
                    <ClassicStatus
                      label={missing.length === 1 ? '1 detail missing' : '{count} details missing'}
                      params={{ count: missing.length }}
                      tone="attention"
                    />
                    <span class="missing">{missing.map((item) => t(item)).join(', ')}</span>
                  {:else}
                    <ClassicStatus label="Complete" tone="ok" />
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

