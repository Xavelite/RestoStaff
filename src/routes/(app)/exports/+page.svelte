<script lang="ts">
  import {
    ArrowRight,
    CalendarDays,
    Clock3,
    FileLock2,
    FileSpreadsheet,
    FileText,
    TableProperties
  } from '@lucide/svelte';
  import { getManagerOperationsReadModel } from '$lib/api/workspace';
  import type { ManagerOperationsReadModel } from '$lib/api/workspace-snapshot';
  import {
    addDays,
    addMonths,
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
  let snapshotRange = $state('');
  let loading = $state(false);
  let errorMessage = $state('');
  let preparing = $state<ExportKind | ''>('');
  let wizardFile = $state<PreparedExport | null>(null);
  let wizardFileKey = $state('');
  let wizardOpen = $state(false);
  let wizardKind = $state<ExportKind | ''>('');
  let wizardRequest = 0;
  let socialAttemptKey = $state('');

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
    snapshot = null;
    snapshotRange = '';
    errorMessage = '';
    getExportOperationsReadModel(
      restaurantId,
      from,
      to,
      getManagerOperationsReadModel
    )
      .then((model) => {
        if (!cancelled) {
          snapshot = model;
          snapshotRange = `${from}|${to}`;
        }
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

  function applyPreset(value: PeriodPreset) {
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

  function openExport(kind: ExportKind) {
    wizardKind = kind;
    wizardFile = null;
    wizardFileKey = '';
    socialAttemptKey = '';
    wizardOpen = true;
  }

  async function prepareSocialExport(signature: string): Promise<void> {
    const request = ++wizardRequest;
    socialAttemptKey = signature;
    preparing = 'social';
    try {
      const restaurantId = workspace.activeId;
      if (!restaurantId || !owner || !completeWeeks) return;
      const file = await previewSocialSecretariatCsv({
        restaurantId,
        periodStart: fromDate,
        periodEnd: toDate
      });
      if (
        request !== wizardRequest ||
        signature !== `${fromDate}|${toDate}` ||
        !wizardOpen ||
        wizardKind !== 'social'
      ) return;
      wizardFile = {
        ...file,
        title: t('Social-secretariat export'),
        periodLabel
      };
      wizardFileKey = `social|${signature}`;
      if (!file.approved) {
        toasts.show(
          t('This is a draft because one or more included weeks are not approved.'),
          'info'
        );
      }
    } catch (error) {
      toasts.show(error instanceof Error ? error.message : String(error), 'danger');
    } finally {
      if (request === wizardRequest) preparing = '';
    }
  }

  $effect(() => {
    const kind = wizardKind;
    const rangeSignature = `${fromDate}|${toDate}`;
    if (!wizardOpen || !kind || !validRange) {
      wizardFile = null;
      wizardFileKey = '';
      return;
    }
    if (kind === 'planning' || kind === 'worked') {
      if (!snapshot || snapshotRange !== rangeSignature) {
        wizardFile = null;
        wizardFileKey = '';
        return;
      }
      wizardFile = kind === 'planning'
        ? {
            ...planningPeriodCsv({
              snapshot,
              range: { from: fromDate, to: toDate },
              translate: t
            }),
            title: t('Schedule export'),
            periodLabel
          }
        : {
            ...workedTimeCsv({
              snapshot,
              range: { from: fromDate, to: toDate },
              timezone,
              translate: t
            }),
            title: t('Time export'),
            periodLabel
          };
      wizardFileKey = `${kind}|${rangeSignature}`;
      return;
    }
    if (wizardFile && wizardFileKey === `social|${rangeSignature}`) return;
    wizardFile = null;
    wizardFileKey = '';
    if (!completeWeeks || preparing === 'social' || socialAttemptKey === rangeSignature) return;
    void prepareSocialExport(rangeSignature);
  });
</script>

<svelte:head><title>{t('Exports')} &middot; restogogo</title></svelte:head>

{#snippet formatTags()}
  <div class="format-tags" aria-label={t('Available formats')}>
    <span class="is-xlsx"><FileSpreadsheet size={12} aria-hidden="true" />XLSX</span>
    <span class="is-pdf"><FileText size={12} aria-hidden="true" />PDF</span>
    <span class="is-csv"><TableProperties size={12} aria-hidden="true" />CSV</span>
  </div>
{/snippet}

<WorkspacePage>
  <section class="export-studio" aria-label={t('Export workspace')}>
    <div class="export-catalog">
      <header class="catalog-heading">
        <div>
          <h2>{t('Choose a file')}</h2>
          <p>{t('Choose the period, format and columns together before downloading.')}</p>
        </div>
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
            </div>
            <p>{t('Employees, service times, areas, positions and planned hours.')}</p>
            {@render formatTags()}
          </div>
          <button
            class="configure-button"
            type="button"
            disabled={!workspace.activeId}
            onclick={() => openExport('planning')}
          >
            {t('Export')}<ArrowRight size={15} aria-hidden="true" />
          </button>
        </article>

        <article class="recipe">
          <span class="recipe-icon is-worked"><Clock3 size={20} aria-hidden="true" /></span>
          <div class="recipe-copy">
            <div class="recipe-title">
              <strong>{t('Time')}</strong>
            </div>
            <p>{t('Clock times, breaks, net hours and actual assignments.')}</p>
            {@render formatTags()}
          </div>
          <button
            class="configure-button"
            type="button"
            disabled={!workspace.activeId}
            onclick={() => openExport('worked')}
          >
            {t('Export')}<ArrowRight size={15} aria-hidden="true" />
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
                {t('Payroll identities and worked-time handoff for complete approved weeks.')}
              </p>
              {@render formatTags()}
            </div>
            <button
              class="configure-button"
              type="button"
              onclick={() => openExport('social')}
            >
              {t('Export')}<ArrowRight size={15} aria-hidden="true" />
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
  kind={wizardKind}
  {periodPreset}
  {fromDate}
  {toDate}
  {rangeDays}
  {validDates}
  {validRange}
  {completeWeeks}
  loading={loading || Boolean(preparing)}
  onpresetchange={applyPreset}
  onfromchange={(value) => {
    fromDate = value;
    markCustom();
  }}
  ontochange={(value) => {
    toDate = value;
    markCustom();
  }}
  onclose={() => {
    wizardOpen = false;
    wizardFile = null;
    wizardFileKey = '';
    wizardKind = '';
    wizardRequest += 1;
    preparing = '';
    socialAttemptKey = '';
  }}
/>

<style>
  .export-studio {
    min-height: min(650px, calc(100dvh - 148px));
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    overflow: hidden;
    border: 1px solid var(--cl-line);
    border-radius: var(--cl-radius);
    background: var(--cl-surface);
  }
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
  .catalog-heading h2 { color: var(--cl-ink); font-size: var(--rst-fs-title); }
  .catalog-heading p { margin-top: 4px; color: var(--cl-muted); font-size: var(--rst-fs-control); }
  .operational-error {
    display: grid;
    gap: 4px;
    padding: 10px 12px;
    border: 1px solid color-mix(in srgb, var(--cl-problem) 30%, var(--cl-line));
    border-radius: var(--cl-radius);
    background: color-mix(in srgb, var(--cl-problem) 4%, var(--cl-surface));
    color: var(--cl-muted);
    font-size: var(--rst-fs-label);
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
  .recipe-title strong { color: var(--cl-ink); font-size: var(--rst-fs-body-lg); }
  .recipe-copy p {
    margin: 0;
    color: var(--cl-muted);
    font-size: var(--rst-fs-control);
    line-height: 1.4;
  }
  .owner-tag {
    color: var(--cl-muted);
    font-size: var(--rst-fs-caption);
    font-weight: var(--rst-fw-bold);
  }
  .owner-tag {
    padding: 2px 6px;
    border-radius: 4px;
    color: var(--cl-mod-payroll);
    background: color-mix(in srgb, var(--cl-mod-payroll) 9%, var(--cl-surface));
  }
  .format-tags { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 3px; }
  .format-tags span {
    min-width: 51px;
    min-height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 3px 6px;
    border: 1px solid color-mix(in srgb, currentColor 22%, var(--cl-line));
    border-radius: 4px;
    background: var(--cl-surface);
    font-size: var(--rst-fs-micro);
    font-weight: var(--rst-fw-bold);
  }
  .format-tags span.is-xlsx { color: #18864b; background: color-mix(in srgb, #18864b 5%, var(--cl-surface)); }
  .format-tags span.is-pdf { color: #c43b3b; background: color-mix(in srgb, #c43b3b 5%, var(--cl-surface)); }
  .format-tags span.is-csv { color: #2563a9; background: color-mix(in srgb, #2563a9 5%, var(--cl-surface)); }
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
    font-size: var(--rst-fs-control);
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
  }
  @media (max-width: 760px) {
    .export-studio {
      min-height: 0;
      margin: -8px;
      overflow: visible;
      border: 0;
      background: transparent;
    }
    .export-catalog { gap: 12px; padding: 16px 4px 0; }
    .catalog-heading h2 { font-size: var(--rst-fs-title-sm); }
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
