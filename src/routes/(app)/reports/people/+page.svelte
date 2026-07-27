<script lang="ts">
  import { formatHours } from '$lib/calendar/date';
  import { t } from '$lib/i18n/i18n.svelte';
  import { regimeLabel } from '$lib/dashboard/dashboard-model';
  import { personInitials } from '$lib/ui/person';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { buildEmployeeColorMap } from '$lib/ui/position-color';
  import ClassicMeter from '$lib/classic/ClassicMeter.svelte';
  import ClassicReportsPage from '$lib/classic/ClassicReportsPage.svelte';

  const employeeColor = $derived(
    workspace.operations
      ? buildEmployeeColorMap(
          workspace.operations.job_functions,
          workspace.operations.employee_job_functions,
          workspace.operations.work_areas,
          workspace.operations.job_function_areas
        )
      : new Map<string, string>()
  );

  function percent(value: number | null): string {
    return value === null ? '—' : `${Math.round(value * 100)}%`;
  }
</script>

<svelte:head><title>{t('People')} &middot; restogogo</title></svelte:head>

<ClassicReportsPage>
  {#snippet children(view)}
    {@const rows = [...view.employees].sort((left, right) => right.worked - left.worked)}

    <div class="cl-tablewrap">
      <table class="cl-table">
        <thead>
          <tr>
            <th>{t('Name')}</th>
            <th>{t('Position')}</th>
            <th>{t('Work regime')}</th>
            <th class="is-num">{t('Shifts')}</th>
            <th class="is-num">{t('Planned')}</th>
            <th class="is-num">{t('Worked')}</th>
            <th class="is-num">{t('Adherence')}</th>
            <th class="is-num">{t('Late starts')}</th>
            <th class="is-num">{t('Missing badge')}</th>
            <th class="is-num">{t('Corrections')}</th>
          </tr>
        </thead>
        <tbody>
          {#each rows as employee (employee.id)}
            <tr>
              <td>
                <span class="cl-table__name">
                  <span class="cl-avatar" style="--avatar-color:{employeeColor.get(employee.id) ?? 'var(--cl-muted)'}">{personInitials(employee.name)}</span>
                  {employee.name}
                </span>
              </td>
              <td class="is-quiet">{employee.role}</td>
              <td class="is-quiet">{t(regimeLabel[employee.regime])}</td>
              <td class="is-num">{employee.shifts}</td>
              <td class="is-num">{formatHours(employee.planned)}</td>
              <td class="is-num">{formatHours(employee.worked)}</td>
              <td class="meter-cell"><ClassicMeter value={employee.adherence} label={percent(employee.adherence)} /></td>
              <td class="is-num">{employee.lateCount}</td>
              <td class="is-num">{employee.missingBadges}</td>
              <td class="is-num">{employee.corrections}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/snippet}
</ClassicReportsPage>

<style>
  .meter-cell {
    min-width: 128px;
  }
</style>
