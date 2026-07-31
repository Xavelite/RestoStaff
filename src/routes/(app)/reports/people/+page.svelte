<script lang="ts">
  import { formatHours } from '$lib/calendar/date';
  import { t } from '$lib/i18n/i18n.svelte';
  import { regimeLabel } from '$lib/dashboard/dashboard-model';
  import { personInitials } from '$lib/ui/person';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { buildEmployeeColorMap } from '$lib/ui/position-color';
  import WorkspaceMeter from '$lib/workspace-ui/WorkspaceMeter.svelte';
  import WorkspaceReportsPage from '$lib/workspace-ui/WorkspaceReportsPage.svelte';
  import type { Regime } from '$lib/dashboard/dashboard-model';

  let workforceFilter = $state<'all' | Regime>('all');

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

<WorkspaceReportsPage>
  {#snippet children(view)}
    {@const allRows = [...view.employees].sort((left, right) => right.worked - left.worked)}
    {@const rows = allRows.filter((employee) => workforceFilter === 'all' || employee.regime === workforceFilter)}
    {@const workforce = [
      { key: 'flexi' as const, label: 'Flexi', hours: view.flexiHours },
      { key: 'fixed' as const, label: 'Fixed', hours: view.fixedHours },
      { key: 'manager' as const, label: 'Manager', hours: view.managerHours }
    ]}
    {@const maxHours = Math.max(1, ...workforce.map((item) => item.hours))}

    <section class="workforce-lens">
      <header>
        <div>
          <strong>{t('Workforce mix')}</strong>
          <span>{t('Worked hours by scheduling regime.')}</span>
        </div>
        <div class="workforce-filter" aria-label={t('Work regime')}>
          {#each [{ key: 'all', label: 'All' }, ...workforce] as option (option.key)}
            <button class:is-active={workforceFilter === option.key} type="button" onclick={() => (workforceFilter = option.key as 'all' | Regime)}>{t(option.label)}</button>
          {/each}
        </div>
      </header>
      <div class="workforce-bars">
        {#each workforce as item (item.key)}
          <button class:is-active={workforceFilter === item.key} type="button" onclick={() => (workforceFilter = workforceFilter === item.key ? 'all' : item.key)}>
            <span><strong>{t(item.label)}</strong><em>{formatHours(item.hours)}</em></span>
            <i><b style={`width:${Math.max(2, Math.round(item.hours / maxHours * 100))}%`}></b></i>
          </button>
        {/each}
      </div>
    </section>

    <div class="cl-tablewrap">
      <table class="cl-table cl-mobile-rows">
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
              <td class="cl-mobile-primary">
                <span class="cl-table__name">
                  <span class="cl-avatar" style="--avatar-color:{employeeColor.get(employee.id) ?? 'var(--cl-muted)'}">{personInitials(employee.name)}</span>
                  {employee.name}
                </span>
                <span class="cl-mobile-summary">
                  <span>{employee.role}</span>
                  <span>{t(regimeLabel[employee.regime])}</span>
                  <span>{formatHours(employee.worked)} {t('worked')}</span>
                  {#if employee.lateCount}<span>{employee.lateCount} {t('late')}</span>{/if}
                </span>
              </td>
              <td class="is-quiet">{employee.role}</td>
              <td class="is-quiet">{t(regimeLabel[employee.regime])}</td>
              <td class="is-num">{employee.shifts}</td>
              <td class="is-num">{formatHours(employee.planned)}</td>
              <td class="is-num">{formatHours(employee.worked)}</td>
              <td class="meter-cell"><WorkspaceMeter value={employee.adherence} label={percent(employee.adherence)} /></td>
              <td class="is-num">{employee.lateCount}</td>
              <td class="is-num">{employee.missingBadges}</td>
              <td class="is-num">{employee.corrections}</td>
            </tr>
          {:else}
            <tr class="cl-mobile-empty"><td colspan="10"><div class="cl-empty"><strong>{t('No employees in this group')}</strong><span>{t('Choose another workforce filter.')}</span></div></td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/snippet}
</WorkspaceReportsPage>

<style>
  .meter-cell {
    min-width: 128px;
  }
  .workforce-lens {
    display: grid;
    gap: 14px;
    padding: 16px;
    border: 1px solid var(--cl-line);
    border-radius: var(--cl-radius-surface);
    background: var(--cl-surface);
  }
  .workforce-lens header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }
  .workforce-lens header > div:first-child { display: grid; gap: 3px; }
  .workforce-lens header strong { color: var(--cl-ink); font-size: var(--rst-fs-body); }
  .workforce-lens header span { color: var(--cl-muted); font-size: var(--rst-fs-caption); }
  .workforce-filter {
    display: flex;
    padding: 3px;
    border: 1px solid var(--cl-line);
    border-radius: 7px;
    background: var(--cl-surface-muted);
  }
  .workforce-filter button {
    min-height: 28px;
    padding: 4px 9px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--cl-muted);
    font: inherit;
    font-size: var(--rst-fs-caption);
    cursor: pointer;
  }
  .workforce-filter button.is-active { background: var(--cl-surface); color: var(--cl-accent); font-weight: var(--rst-fw-bold); box-shadow: 0 1px 2px rgba(17,24,39,.06); }
  .workforce-bars { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
  .workforce-bars button {
    min-width: 0;
    display: grid;
    gap: 8px;
    padding: 10px;
    border: 1px solid var(--cl-line);
    border-radius: 6px;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .workforce-bars button:hover,
  .workforce-bars button.is-active { border-color: var(--cl-accent-line); background: var(--cl-accent-wash); }
  .workforce-bars button > span { display: flex; justify-content: space-between; gap: 8px; }
  .workforce-bars em { color: var(--cl-muted); font-size: var(--rst-fs-label); font-style: normal; }
  .workforce-bars i { height: 6px; overflow: hidden; border-radius: 3px; background: var(--cl-surface-muted); }
  .workforce-bars b { height: 100%; display: block; border-radius: inherit; background: var(--cl-info); }
  @media (max-width: 760px) {
    .workforce-lens { padding: 13px 12px; }
    .workforce-lens header { align-items: stretch; flex-direction: column; }
    .workforce-filter { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .workforce-filter button { min-width: 0; padding-inline: 4px; }
    .workforce-bars { grid-template-columns: minmax(0, 1fr); gap: 7px; }
  }
</style>
