<script lang="ts">
  import {
    ArrowRight,
    CalendarDays,
    Clock3,
    FileLock2,
    LoaderCircle,
    ShieldCheck
  } from '@lucide/svelte';
  import { getManagerOperationsReadModel } from '$lib/api/workspace';
  import type { ManagerOperationsReadModel } from '$lib/api/workspace-snapshot';
  import {
    addDays,
    addMonths,
    dateForWeekday,
    mondayFor,
    monthStart,
    todayInTimezone,
    weekday
  } from '$lib/calendar/date';
  import WorkspacePage from '$lib/workspace-ui/WorkspacePage.svelte';
  import ExportWizard from '$lib/exports/ExportWizard.svelte';
  import { previewSocialSecretariatCsv } from '$lib/exports/export-api';
  import type { PreparedExport } from '$lib/exports/export-download';
  import {
    getExportOperationsReadModel,
    MAX_EXPORT_DAYS
  } from '$lib/exports/export-read-model';
  import { planningPeriodCsv, workedTimeCsv } from '$lib/exports/export-recipes';
  import { t } from '$lib/i18n/i18n.svelte';
  import { toasts } from '$lib/ui/toast.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';

  type PeriodPreset = 'this_week' | 'previous_week' | 'this_month' | 'custom';
  type ExportKind = 'planning' | 'worked' | 'social';

  const initialToday = todayInTimezone(
    workspace.bootstrap?.restaurant_settings.timezone || 'Europe/Brussels'
  );
  let periodPreset = $state<PeriodPreset>('this_week');
  let fromDate = $state(mondayFor(initialToday));
  let toDate = $state(addDays(mondayFor(initialToday), 6));
  let snapshot = $state<ManagerOperationsReadModel | null>(null);
  let loading = $state(false);
  let errorMessage = $state('');
  let preparing = $state<ExportKind | ''>('');
  let wizardFile = $state<PreparedExport | null>(null);
  let wizardOpen = $state(false);

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
  const periodLabel = $derived(`${fromDate} → ${toDate}`);
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

  function openWizard(file: PreparedExport) {
    wizardFile = file;
    wizardOpen = true;
  }

  async function configureExport(kind: ExportKind) {
    if (preparing || !validRange) return;
    preparing = kind;
    try {
      if (kind === 'planning') {
        if (!snapshot) return;
        openWizard({
          ...planningPeriodCsv({
            snapshot,
            range: { from: fromDate, to: toDate },
            translate: t
          }),
          title: t('Schedule export'),
          periodLabel
        });
        return;
      }
      if (kind === 'worked') {
        if (!snapshot) return;
        openWizard({
          ...workedTimeCsv({
            snapshot,
            range: { from: fromDate, to: toDate },
            timezone,
            translate: t
          }),
          title: t('Time export'),
          periodLabel
        });
        return;
      }

      const restaurantId = workspace.activeId;
      if (!restaurantId || !owner || !completeWeeks) return;
      const file = await previewSocialSecretariatCsv({
        restaurantId,
        periodStart: fromDate,
        periodEnd: toDate
      });
      openWizard({
        ...file,
        title: t('Social-secretariat export'),
        periodLabel
      });
      if (!file.approved) {
        toasts.show(
          t('This is a draft because one or more included weeks are not approved.'),
          'info'
        );
      }
    } catch (error) {
      toasts.show(error instanceof Error ? error.message : String(error), 'danger');
    } finally {
      preparing = '';
    }
  }
</script>

<svelte:head><title>{t('Exports')} &middot; restogogo</title></svelte:head>

<WorkspacePage>
  <section class="export-studio" aria-label={t('Export workspace')}>
    <aside class="scope-panel">
      <div class="scope-heading">
        <span class="scope-icon"><CalendarDays size={18} aria-hidden="true" /></span>
        <div>
          <strong>{t('Export period')}</strong>
          <span>{t('One date range applies to every file.')}</span>
        </div>
      </div>

      <label class="scope-field quick-range">
        <span>{t('Quick range')}</span>
        <select class="cl-field" value={periodPreset} onchange={applyPreset}>
          <option value="this_week">{t('This week')}</option>
          <option value="previous_week">{t('Previous week')}</option>
          <option value="this_month">{t('This month')}</option>
          <option value="custom">{t('Custom')}</option>
        </select>
      </label>

      <div class="date-pair">
        <label class="scope-field">
          <span>{t('From')}</span>
          <input class="cl-field" type="date" bind:value={fromDate} onchange={markCustom} />
        </label>
        <label class="scope-field">
          <span>{t('To')}</span>
          <input class="cl-field" type="date" bind:value={toDate} onchange={markCustom} />
        </label>
      </div>

      <div class="range-summary" class:is-invalid={!validRange}>
        {#if !validDates}
          <strong>{t('Check the dates')}</strong>
          <span>{t('The end date must follow the start date.')}</span>
        {:else if !validRange}
          <strong>{t('Range too long')}</strong>
          <span>{t('Exports can cover at most 53 weeks.')}</span>
        {:else}
          <strong>{periodLabel}</strong>
          <span>{rangeDays} {rangeDays === 1 ? t('day') : t('days')} {t('selected')}</span>
        {/if}
      </div>

      <div class="scope-note">
        <ShieldCheck size={15} aria-hidden="true" />
        <span>{t('Files are created on your device and are not stored by Restogogo.')}</span>
      </div>
    </aside>

    <div class="export-catalog">
      <header class="catalog-heading">
        <div>
          <h2>{t('Choose a file')}</h2>
          <p>{t('Review the format, column order and real file preview before downloading.')}</p>
        </div>
        {#if loading}
          <span class="refreshing"><LoaderCircle size={14} aria-hidden="true" />{t('Refreshing…')}</span>
        {/if}
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

      <div class="recipe-list">
        <article class="recipe">
          <span class="recipe-icon is-planning"><CalendarDays size={20} aria-hidden="true" /></span>
          <div class="recipe-copy">
            <div class="recipe-title">
              <strong>{t('Schedule')}</strong>
              <span class="record-count">{loading ? '…' : planningCount} {t('records')}</span>
            </div>
            <p>{t('Employees, service times, areas, positions and planned hours.')}</p>
            <div class="format-tags" aria-label={t('Available formats')}>
              <span>XLSX</span><span>PDF</span><span>CSV</span>
            </div>
          </div>
          <button
            class="configure-button"
            type="button"
            disabled={!snapshot || loading || planningCount === 0 || !validRange || Boolean(preparing)}
            onclick={() => configureExport('planning')}
          >
            {preparing === 'planning' ? t('Preparing…') : t('Export')}
            {#if preparing === 'planning'}<LoaderCircle class="spin" size={15} aria-hidden="true" />{:else}<ArrowRight size={15} aria-hidden="true" />{/if}
          </button>
        </article>

        <article class="recipe">
          <span class="recipe-icon is-worked"><Clock3 size={20} aria-hidden="true" /></span>
          <div class="recipe-copy">
            <div class="recipe-title">
              <strong>{t('Time')}</strong>
              <span class="record-count">{loading ? '…' : workedCount} {t('records')}</span>
            </div>
            <p>{t('Clock times, breaks, net hours and actual assignments.')}</p>
            <div class="format-tags" aria-label={t('Available formats')}>
              <span>XLSX</span><span>PDF</span><span>CSV</span>
            </div>
          </div>
          <button
            class="configure-button"
            type="button"
            disabled={!snapshot || loading || workedCount === 0 || !validRange || Boolean(preparing)}
            onclick={() => configureExport('worked')}
          >
              {preparing === 'worked' ? t('Preparing…') : t('Export')}
            {#if preparing === 'worked'}<LoaderCircle class="spin" size={15} aria-hidden="true" />{:else}<ArrowRight size={15} aria-hidden="true" />{/if}
          </button>
        </article>

        {#if owner}
          <article class="recipe">
            <span class="recipe-icon is-payroll"><FileLock2 size={20} aria-hidden="true" /></span>
            <div class="recipe-copy">
              <div class="recipe-title">
                <strong>{t('Social secretariat')}</strong>
                <span class="owner-tag">{t('Owner only')}</span>
              </div>
              <p>
                {#if completeWeeks}
                  {t('Payroll identities and worked-time handoff for complete approved weeks.')}
                {:else}
                  <span class="requirement">{t('Select complete Monday-to-Sunday weeks to prepare this file.')}</span>
                {/if}
              </p>
              <div class="format-tags" aria-label={t('Available formats')}>
                <span>XLSX</span><span>PDF</span><span>CSV</span>
              </div>
            </div>
            <button
              class="configure-button"
              type="button"
              disabled={!completeWeeks || Boolean(preparing)}
              onclick={() => configureExport('social')}
            >
              {preparing === 'social' ? t('Preparing…') : t('Export')}
              {#if preparing === 'social'}<LoaderCircle class="spin" size={15} aria-hidden="true" />{:else}<ArrowRight size={15} aria-hidden="true" />{/if}
            </button>
          </article>
        {/if}
      </div>
    </div>
  </section>
</WorkspacePage>

<ExportWizard
  open={wizardOpen}
  file={wizardFile}
  onclose={() => {
    wizardOpen = false;
    wizardFile = null;
  }}
/>

<style>
  .export-studio {
    min-height: min(650px, calc(100dvh - 148px));
    display: grid;
    grid-template-columns: minmax(240px, 278px) minmax(0, 1fr);
    overflow: hidden;
    border: 1px solid var(--cl-line);
    border-radius: var(--cl-radius);
    background: var(--cl-surface);
  }
  .scope-panel {
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding: 24px 20px;
    border-right: 1px solid var(--cl-line);
    background: color-mix(in srgb, var(--cl-surface-muted) 62%, var(--cl-surface));
  }
  .scope-heading {
    display: flex;
    align-items: center;
    gap: 10px;
    padding-bottom: 4px;
  }
  .scope-icon {
    width: 36px;
    height: 36px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    border-radius: 7px;
    color: var(--cl-accent);
    background: color-mix(in srgb, var(--cl-accent) 10%, var(--cl-surface));
  }
  .scope-heading > div { display: grid; gap: 2px; }
  .scope-heading strong { color: var(--cl-ink); font-size: 13px; }
  .scope-heading span { color: var(--cl-muted); font-size: 10.5px; line-height: 1.35; }
  .scope-field { display: grid; gap: 6px; }
  .scope-field > span {
    color: var(--cl-muted);
    font-size: 10.5px;
    font-weight: var(--rst-fw-bold);
    text-transform: uppercase;
  }
  .scope-field .cl-field { width: 100%; min-width: 0; font-size: 12.5px; }
  .date-pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .date-pair .cl-field { padding-inline: 8px; font-size: 11.5px; }
  .range-summary {
    display: grid;
    gap: 3px;
    padding: 11px 12px;
    border-left: 3px solid var(--cl-accent);
    background: color-mix(in srgb, var(--cl-accent) 5%, var(--cl-surface));
  }
  .range-summary strong {
    color: var(--cl-ink);
    font-size: 11.5px;
    font-variant-numeric: tabular-nums;
  }
  .range-summary span { color: var(--cl-muted); font-size: 10.5px; }
  .range-summary.is-invalid {
    border-left-color: var(--cl-problem);
    background: color-mix(in srgb, var(--cl-problem) 5%, var(--cl-surface));
  }
  .scope-note {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin-top: auto;
    padding-top: 16px;
    border-top: 1px solid var(--cl-line);
    color: var(--cl-muted);
    font-size: 10.5px;
    line-height: 1.45;
  }
  .scope-note :global(svg) { flex: 0 0 auto; margin-top: 1px; color: var(--cl-positive); }
  .export-catalog {
    min-width: 0;
    display: grid;
    align-content: start;
    gap: 18px;
    padding: 26px 28px;
  }
  .catalog-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }
  .catalog-heading h2, .catalog-heading p { margin: 0; }
  .catalog-heading h2 { color: var(--cl-ink); font-size: 17px; }
  .catalog-heading p { margin-top: 4px; color: var(--cl-muted); font-size: 12px; }
  .refreshing {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--cl-muted);
    font-size: 10.5px;
  }
  .refreshing :global(svg), :global(.spin) { animation: spin 800ms linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .operational-error {
    display: grid;
    gap: 4px;
    padding: 10px 12px;
    border: 1px solid color-mix(in srgb, var(--cl-problem) 30%, var(--cl-line));
    border-radius: var(--cl-radius);
    background: color-mix(in srgb, var(--cl-problem) 4%, var(--cl-surface));
    color: var(--cl-muted);
    font-size: 11px;
  }
  .operational-error strong { color: var(--cl-problem); }
  .recipe-list { border-top: 1px solid var(--cl-line); }
  .recipe {
    min-width: 0;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 14px;
    min-height: 126px;
    padding: 18px 2px;
    border-bottom: 1px solid var(--cl-line);
  }
  .recipe-icon {
    --recipe-color: var(--cl-muted);
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--recipe-color) 20%, var(--cl-line));
    border-radius: 8px;
    color: var(--recipe-color);
    background: color-mix(in srgb, var(--recipe-color) 7%, var(--cl-surface));
  }
  .recipe-icon.is-planning { --recipe-color: var(--cl-mod-schedule); }
  .recipe-icon.is-worked { --recipe-color: var(--cl-mod-time); }
  .recipe-icon.is-payroll { --recipe-color: var(--cl-mod-payroll); }
  .recipe-copy { min-width: 0; display: grid; gap: 5px; }
  .recipe-title { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .recipe-title strong { color: var(--cl-ink); font-size: 14px; }
  .recipe-copy p {
    margin: 0;
    color: var(--cl-muted);
    font-size: 11.5px;
    line-height: 1.4;
  }
  .record-count, .owner-tag {
    color: var(--cl-muted);
    font-size: 10px;
    font-weight: var(--rst-fw-bold);
  }
  .record-count::before { content: '·'; margin-right: 8px; color: var(--cl-line-strong); }
  .owner-tag {
    padding: 2px 6px;
    border-radius: 4px;
    color: var(--cl-mod-payroll);
    background: color-mix(in srgb, var(--cl-mod-payroll) 9%, var(--cl-surface));
  }
  .format-tags { display: flex; gap: 5px; margin-top: 3px; }
  .format-tags span {
    padding: 2px 5px;
    border: 1px solid var(--cl-line);
    border-radius: 3px;
    color: var(--cl-muted);
    background: var(--cl-surface);
    font-size: 8.5px;
    font-weight: var(--rst-fw-bold);
  }
  .requirement { color: var(--cl-attention); font-weight: var(--rst-fw-medium); }
  .configure-button {
    min-height: 36px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 7px 11px;
    border: 1px solid var(--cl-line-strong);
    border-radius: var(--cl-radius);
    color: var(--cl-ink);
    background: var(--cl-surface);
    font: inherit;
    font-size: 11.5px;
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
  }
  .configure-button:hover:not(:disabled) {
    border-color: var(--cl-accent);
    color: var(--cl-accent);
    background: color-mix(in srgb, var(--cl-accent) 4%, var(--cl-surface));
  }
  .configure-button:disabled {
    border-color: var(--cl-line);
    color: var(--cl-muted);
    background: var(--cl-surface-muted);
    cursor: default;
  }
  @media (max-width: 980px) {
    .export-studio { grid-template-columns: minmax(0, 1fr); }
    .scope-panel {
      display: grid;
      grid-template-columns: minmax(180px, 1.2fr) minmax(150px, .8fr) minmax(260px, 1.2fr);
      align-items: end;
      padding: 16px;
      border-right: 0;
      border-bottom: 1px solid var(--cl-line);
    }
    .scope-heading { align-self: center; }
    .scope-note, .range-summary { display: none; }
  }
  @media (max-width: 760px) {
    .export-studio {
      min-height: 0;
      margin: -8px;
      overflow: visible;
      border: 0;
      background: transparent;
    }
    .scope-panel {
      grid-template-columns: minmax(0, 1fr);
      gap: 12px;
      padding: 14px;
      border: 1px solid var(--cl-line);
      border-radius: var(--cl-radius);
    }
    .scope-heading { padding-bottom: 2px; }
    .scope-field.quick-range { display: none; }
    .date-pair { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .range-summary { display: grid; }
    .export-catalog { gap: 12px; padding: 20px 4px 0; }
    .catalog-heading h2 { font-size: 15px; }
    .recipe {
      grid-template-columns: auto minmax(0, 1fr);
      gap: 10px;
      min-height: 0;
      padding: 16px 2px;
    }
    .recipe-icon { width: 38px; height: 38px; }
    .configure-button {
      grid-column: 1 / -1;
      width: 100%;
      justify-content: center;
    }
  }
</style>
