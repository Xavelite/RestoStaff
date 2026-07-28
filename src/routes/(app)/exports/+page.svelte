<script lang="ts">
  import { getManagerOperationsReadModel } from '$lib/api/workspace';
  import type { ManagerOperationsReadModel } from '$lib/api/workspace-snapshot';
  import { addDays, addMonths, dateForWeekday, mondayFor, monthStart, todayInTimezone, weekday } from '$lib/calendar/date';
  import ClassicPage from '$lib/classic/ClassicPage.svelte';
  import { previewSocialSecretariatCsv } from '$lib/exports/export-api';
  import {
    getExportOperationsReadModel,
    MAX_EXPORT_DAYS
  } from '$lib/exports/export-read-model';
  import { planningPeriodCsv, workedTimeCsv } from '$lib/exports/export-recipes';
  import { downloadCsv } from '$lib/exports/csv';
  import { t } from '$lib/i18n/i18n.svelte';
  import { toasts } from '$lib/ui/toast.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';

  type PeriodPreset = 'this_week' | 'previous_week' | 'this_month' | 'custom';
  type DownloadKind = 'planning' | 'worked' | 'social' | '';

  const initialToday = todayInTimezone(
    workspace.bootstrap?.restaurant_settings.timezone || 'Europe/Brussels'
  );
  let periodPreset = $state<PeriodPreset>('this_week');
  let fromDate = $state(mondayFor(initialToday));
  let toDate = $state(addDays(mondayFor(initialToday), 6));
  let snapshot = $state<ManagerOperationsReadModel | null>(null);
  let loading = $state(false);
  let errorMessage = $state('');
  let downloading = $state<DownloadKind>('');

  const timezone = $derived(
    workspace.bootstrap?.restaurant_settings.timezone || 'Europe/Brussels'
  );
  const today = $derived(todayInTimezone(timezone));
  const owner = $derived(workspace.effectiveRole === 'owner');
  const validDates = $derived(Boolean(fromDate && toDate && fromDate <= toDate));
  const rangeDays = $derived.by(() => {
    if (!validDates) return 0;
    return (
      Math.round(
        (new Date(`${toDate}T00:00:00Z`).getTime() -
          new Date(`${fromDate}T00:00:00Z`).getTime()) /
          86_400_000
      ) + 1
    );
  });
  const validRange = $derived(validDates && rangeDays <= MAX_EXPORT_DAYS);
  const planningCount = $derived(
    snapshot?.planned_shifts.filter((shift) => {
      const date = dateForWeekday(shift.week_start, shift.weekday);
      return date >= fromDate && date <= toDate;
    }).length ?? 0
  );
  const workedCount = $derived(
    snapshot?.time_entries.filter(
      (entry) =>
        entry.status !== 'cancelled' &&
        entry.business_date >= fromDate &&
        entry.business_date <= toDate
    ).length ?? 0
  );
  const completeWeeks = $derived.by(() => {
    if (!validRange || weekday(fromDate) !== 1 || weekday(toDate) !== 7) return false;
    const days =
      Math.round(
        (new Date(`${toDate}T00:00:00Z`).getTime() -
          new Date(`${fromDate}T00:00:00Z`).getTime()) /
          86_400_000
      ) + 1;
    return days > 0 && days <= 371 && days % 7 === 0;
  });

  $effect(() => {
    const restaurantId = workspace.activeId;
    const from = fromDate;
    const to = toDate;
    if (!restaurantId || !from || !to || from > to || rangeDays > MAX_EXPORT_DAYS) {
      snapshot = null;
      errorMessage = '';
      loading = false;
      return;
    }
    let cancelled = false;
    loading = true;
    errorMessage = '';
    getExportOperationsReadModel(
      restaurantId,
      from,
      to,
      getManagerOperationsReadModel
    )
      .then((model) => {
        if (!cancelled) snapshot = model;
      })
      .catch((error) => {
        if (!cancelled) {
          snapshot = null;
          errorMessage = error instanceof Error ? error.message : String(error);
        }
      })
      .finally(() => {
        if (!cancelled) loading = false;
      });
    return () => {
      cancelled = true;
    };
  });

  function applyPreset(event: Event) {
    const value = (event.currentTarget as HTMLSelectElement).value as PeriodPreset;
    periodPreset = value;
    if (value === 'custom') return;
    if (value === 'this_month') {
      fromDate = monthStart(today);
      toDate = addDays(addMonths(fromDate, 1), -1);
      return;
    }
    const currentWeek = mondayFor(today);
    fromDate = value === 'previous_week' ? addDays(currentWeek, -7) : currentWeek;
    toDate = addDays(fromDate, 6);
  }

  function markCustom() {
    periodPreset = 'custom';
  }

  function downloadPlanning() {
    if (!snapshot || downloading) return;
    const file = planningPeriodCsv({
      snapshot,
      range: { from: fromDate, to: toDate },
      translate: t
    });
    downloadCsv(file.filename, file.headers, file.rows);
  }

  function downloadWorkedTime() {
    if (!snapshot || downloading) return;
    const file = workedTimeCsv({
      snapshot,
      range: { from: fromDate, to: toDate },
      timezone,
      translate: t
    });
    downloadCsv(file.filename, file.headers, file.rows);
  }

  async function downloadSocialSecretariat() {
    const restaurantId = workspace.activeId;
    if (!restaurantId || !owner || !completeWeeks || downloading) return;
    downloading = 'social';
    try {
      const file = await previewSocialSecretariatCsv({
        restaurantId,
        periodStart: fromDate,
        periodEnd: toDate
      });
      downloadCsv(file.filename, file.headers, file.rows);
      if (!file.approved) {
        toasts.show(
          t('Draft payroll export downloaded. It has no official lineage until every included week is approved.'),
          'info'
        );
      }
    } catch (error) {
      toasts.show(error instanceof Error ? error.message : String(error), 'danger');
    } finally {
      downloading = '';
    }
  }
</script>

<svelte:head><title>{t('Exports')} &middot; restogogo</title></svelte:head>

{#snippet pageActions()}
  <label class="period-control">
    <span>{t('Period')}</span>
    <select class="cl-field" value={periodPreset} onchange={applyPreset}>
      <option value="this_week">{t('This week')}</option>
      <option value="previous_week">{t('Previous week')}</option>
      <option value="this_month">{t('This month')}</option>
      <option value="custom">{t('Custom')}</option>
    </select>
  </label>
  <span class="period-divider" aria-hidden="true"></span>
  <label class="date-control">
    <span>{t('From')}</span>
    <input class="cl-field" type="date" bind:value={fromDate} onchange={markCustom} />
  </label>
  <span class="date-arrow" aria-hidden="true">&rarr;</span>
  <label class="date-control">
    <span>{t('To')}</span>
    <input class="cl-field" type="date" bind:value={toDate} onchange={markCustom} />
  </label>
  {#if loading}<span class="load-state">{t('Refreshing…')}</span>{/if}
{/snippet}

<ClassicPage actions={pageActions}>
  {#if !validDates}
    <div class="cl-card">
      <div class="cl-empty">
        <strong>{t('Choose a valid date range')}</strong>
        <span>{t('The end date must be on or after the start date.')}</span>
      </div>
    </div>
  {:else if !validRange}
    <div class="cl-card">
      <div class="cl-empty">
        <strong>{t('Choose a shorter export period')}</strong>
        <span>{t('Exports can cover at most 53 weeks.')}</span>
      </div>
    </div>
  {:else}
    <section class="exports-panel" aria-label={t('Available exports')}>
      <header class="exports-panel__head">
        <div>
          <strong>{t('Operational files')}</strong>
          <span>{t('Choose the file you need. Every export uses the selected period.')}</span>
        </div>
        <span class="range-label">{fromDate} &rarr; {toDate}</span>
      </header>

      {#if errorMessage}
        <div class="operational-error" role="alert">
          <strong>{t('Operational exports unavailable')}</strong>
          <span>{errorMessage}</span>
          {#if owner}
            <span>{t('The social-secretariat file remains available because it is prepared separately on the server.')}</span>
          {/if}
        </div>
      {/if}

      <div class="cl-tablewrap is-unbounded">
        <table class="cl-table export-table">
          <thead>
            <tr>
              <th>{t('File')}</th>
              <th>{t('Includes')}</th>
              <th class="is-num">{t('Records')}</th>
              <th class="action-col"><span class="sr-only">{t('Action')}</span></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <div class="recipe-title">
                  <span class="recipe-icon is-planning" aria-hidden="true">
                    <svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 9.5h16M9 3v4M15 3v4M8 14h3M13 14h3M8 17h5"/></svg>
                  </span>
                  <span><strong>{t('Schedule CSV')}</strong><small>{t('Current saved schedule')}</small></span>
                </div>
              </td>
              <td>{t('Employees, services, times, areas and positions.')}</td>
              <td class="is-num"><span class="record-count">{loading ? '…' : planningCount}</span></td>
              <td class="action-col">
                <button
                  class="cl-btn"
                  type="button"
                  disabled={!snapshot || loading || planningCount === 0 || Boolean(downloading)}
                  onclick={downloadPlanning}
                >{t('Download CSV')}</button>
              </td>
            </tr>
            <tr>
              <td>
                <div class="recipe-title">
                  <span class="recipe-icon is-worked" aria-hidden="true">
                    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 1.8M8 19.2l1.1-2.4M16 19.2l-1.1-2.4"/></svg>
                  </span>
                  <span><strong>{t('Worked-time CSV')}</strong><small>{t('Badge and corrected time')}</small></span>
                </div>
              </td>
              <td>{t('Clock times, breaks, net hours and actual assignments.')}</td>
              <td class="is-num"><span class="record-count">{loading ? '…' : workedCount}</span></td>
              <td class="action-col">
                <button
                  class="cl-btn"
                  type="button"
                  disabled={!snapshot || loading || workedCount === 0 || Boolean(downloading)}
                  onclick={downloadWorkedTime}
                >{t('Download CSV')}</button>
              </td>
            </tr>
            {#if owner}
              <tr>
                <td>
                  <div class="recipe-title">
                    <span class="recipe-icon is-payroll" aria-hidden="true">
                      <svg viewBox="0 0 24 24"><path d="M5 3.8h11l3 3V20H5zM15.5 3.8V8H19M8 12h8M8 15h8M8 18h5"/></svg>
                    </span>
                    <span><strong>{t('Social-secretariat CSV')}</strong><small>{t('Owner-only draft')}</small></span>
                  </div>
                </td>
                <td>
                  {#if completeWeeks}
                    {t('Payroll identities and worked-time handoff.')}
                  {:else}
                    <span class="requirement">{t('Select complete Monday-to-Sunday weeks.')}</span>
                  {/if}
                </td>
                <td class="is-num"><span class="record-count is-neutral">—</span></td>
                <td class="action-col">
                  <button
                    class="cl-btn"
                    type="button"
                    disabled={!completeWeeks || Boolean(downloading)}
                    onclick={downloadSocialSecretariat}
                  >{downloading === 'social' ? t('Preparing…') : t('Download CSV')}</button>
                </td>
              </tr>
            {/if}
          </tbody>
        </table>
      </div>
    </section>
  {/if}
</ClassicPage>

<style>
  .period-control,
  .date-control {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: var(--cl-muted);
    font-size: 11px;
    font-weight: var(--rst-fw-bold);
  }
  .period-control .cl-field { width: 136px; }
  .date-control .cl-field { width: 142px; font-variant-numeric: tabular-nums; }
  .period-divider { width: 1px; height: 20px; margin-inline: 3px; background: var(--cl-line); }
  .date-arrow { color: var(--cl-line-strong); font-size: 13px; }
  .load-state {
    margin-left: auto;
    color: var(--cl-muted);
    font-size: 11px;
    font-weight: var(--rst-fw-medium);
  }
  .exports-panel {
    display: grid;
    gap: 10px;
  }
  .exports-panel__head {
    min-height: 40px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  .exports-panel__head > div { display: grid; gap: 2px; }
  .exports-panel__head strong { color: var(--cl-ink); font-size: 14px; }
  .exports-panel__head span { color: var(--cl-muted); font-size: 12px; }
  .operational-error {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px 10px;
    padding: 9px 12px;
    border: 1px solid color-mix(in srgb, var(--cl-problem) 32%, var(--cl-line));
    border-radius: var(--cl-radius);
    background: color-mix(in srgb, var(--cl-problem) 4%, var(--cl-surface));
    color: var(--cl-muted);
    font-size: 11.5px;
  }
  .operational-error strong { color: var(--cl-problem); }
  .range-label {
    padding: 5px 8px;
    border: 1px solid var(--cl-line);
    border-radius: 6px;
    background: var(--cl-surface);
    color: var(--cl-muted) !important;
    font-size: 11px !important;
    font-variant-numeric: tabular-nums;
    font-weight: var(--rst-fw-medium);
  }
  .export-table td { height: 68px; vertical-align: middle; }
  .export-table td:nth-child(2) { color: var(--cl-muted); }
  .export-table .action-col { width: 146px; text-align: right; }
  .recipe-title {
    display: flex;
    align-items: center;
    gap: 11px;
    min-width: 220px;
  }
  .recipe-title > span:last-child { display: grid; gap: 2px; }
  .recipe-title strong { color: var(--cl-ink); font-size: 13px; }
  .recipe-title small { color: var(--cl-muted); font-size: 10.5px; }
  .recipe-icon {
    --recipe-color: var(--cl-muted);
    width: 34px;
    height: 34px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--recipe-color) 24%, var(--cl-line));
    border-radius: 8px;
    background: color-mix(in srgb, var(--recipe-color) 8%, var(--cl-surface));
    color: var(--recipe-color);
  }
  .recipe-icon svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.65;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .recipe-icon.is-planning { --recipe-color: var(--cl-mod-schedule); }
  .recipe-icon.is-worked { --recipe-color: var(--cl-mod-time); }
  .recipe-icon.is-payroll { --recipe-color: var(--cl-mod-payroll); }
  .record-count {
    display: inline-grid;
    min-width: 28px;
    height: 24px;
    place-items: center;
    padding-inline: 7px;
    border-radius: 999px;
    background: var(--cl-surface-muted);
    color: var(--cl-ink);
    font-size: 12px;
    font-weight: var(--rst-fw-bold);
    font-variant-numeric: tabular-nums;
  }
  .record-count.is-neutral { color: var(--cl-muted); }
  .requirement { color: var(--cl-attention); font-weight: var(--rst-fw-medium); }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  @media (max-width: 760px) {
    .exports-panel__head { align-items: flex-start; }
    .range-label { display: none; }
    .export-table td:nth-child(2), .export-table th:nth-child(2) { display: none; }
  }
</style>
