<script lang="ts">
  import { onMount } from 'svelte';
  import {
    createPayrollExportRun,
    getPayrollExportRun,
    previewPayrollExport,
    setPayrollExportColumns
  } from '$lib/api/mutations';
  import { friendlyError } from '$lib/api/error-messages';
  import { addDays, mondayFor, todayInTimezone } from '$lib/calendar/date';
  import ClassicPage from '$lib/classic/ClassicPage.svelte';
  import ClassicStat from '$lib/classic/ClassicStat.svelte';
  import ClassicStatus from '$lib/classic/ClassicStatus.svelte';
  import { downloadCsv } from '$lib/export/csv';
  import { i18n, t } from '$lib/i18n/i18n.svelte';
  import {
    PAYROLL_EXPORT_FIELDS,
    normalizePayrollColumns
  } from '$lib/payroll/payroll-export-columns';
  import { isCompletePayrollPeriod, payrollColumnsFromSettings } from '$lib/payroll/payroll-export';
  import { unsavedChanges } from '$lib/navigation/unsaved-changes.svelte';
  import { toasts } from '$lib/ui/toast.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';

  const snapshot = $derived(workspace.operations);
  const timezone = $derived(
    snapshot?.restaurant_settings.timezone ||
      workspace.bootstrap?.restaurant_settings.timezone ||
      'Europe/Brussels'
  );
  const today = $derived(todayInTimezone(timezone));
  const previousWeekStart = $derived(addDays(mondayFor(today), -7));
  const previousWeekEnd = $derived(addDays(previousWeekStart, 6));

  let periodStart = $state('');
  let periodEnd = $state('');
  let columns = $state<string[]>([]);
  let initializedFor = $state('');
  let baselineColumns = $state<string[]>([]);
  let busy = $state(false);
  let savingColumns = $state(false);

  $effect(() => {
    if (!periodStart) periodStart = previousWeekStart;
    if (!periodEnd) periodEnd = previousWeekEnd;
  });

  $effect(() => {
    if (!workspace.activeId || !periodStart || !periodEnd) return;
    void workspace.loadOperations(periodStart, periodEnd).catch(() => undefined);
  });

  $effect(() => {
    if (!workspace.activeId || !snapshot || initializedFor === workspace.activeId) return;
    columns = payrollColumnsFromSettings(snapshot.restaurant_settings);
    baselineColumns = [...columns];
    initializedFor = workspace.activeId;
  });

  const columnsDirty = $derived(JSON.stringify(columns) !== JSON.stringify(baselineColumns));
  // The saved order is part of the payroll-export contract. Keep the array's
  // order rather than rebuilding it from the allowlist, otherwise a restaurant
  // would silently lose its social-secretariat template order.
  const orderedColumns = $derived(normalizePayrollColumns(columns));
  const availableColumns = $derived(
    PAYROLL_EXPORT_FIELDS.filter((field) => !orderedColumns.includes(field.key))
  );
  const validPeriod = $derived(isCompletePayrollPeriod(periodStart, periodEnd));
  const runs = $derived(
    (snapshot?.payroll_export_runs ?? [])
      .filter((run) => run.period_end >= periodStart && run.period_start <= periodEnd)
      .toSorted((left, right) => right.created_at.localeCompare(left.created_at))
  );
  const totalRows = $derived(runs.reduce((sum, run) => sum + run.row_count, 0));


  function discardColumns(): void {
    columns = [...baselineColumns];
  }

  onMount(() =>
    unsavedChanges.register({
      id: 'payroll-export-columns',
      label: 'Payroll export columns',
      isDirty: () => columnsDirty,
      save: saveDefaults,
      discard: discardColumns
    })
  );

  function addColumn(key: string): void {
    if (!columns.includes(key)) columns = [...columns, key];
  }

  function removeColumn(key: string): void {
    if (columns.length === 1) {
      toasts.show(t('Keep at least one export column.'), 'warning');
      return;
    }
    columns = columns.filter((item) => item !== key);
  }

  function moveColumn(key: string, direction: -1 | 1): void {
    const index = columns.indexOf(key);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= columns.length) return;
    const next = [...columns];
    [next[index], next[target]] = [next[target], next[index]];
    columns = next;
  }

  async function saveDefaults(): Promise<void> {
    if (!workspace.activeId || savingColumns) return;
    savingColumns = true;
    try {
      const normalized = normalizePayrollColumns(orderedColumns);
      await setPayrollExportColumns(workspace.activeId, normalized);
      columns = normalized;
      baselineColumns = [...normalized];
      await workspace.reloadOperations();
      toasts.show(t('Payroll export columns saved.'), 'success');
    } catch (error) {
      toasts.show(friendlyError(error), 'danger');
    } finally {
      savingColumns = false;
    }
  }

  async function exportPeriod(): Promise<void> {
    if (!workspace.activeId || busy || !validPeriod || !orderedColumns.length) return;
    busy = true;
    try {
      const preview = await previewPayrollExport({
        restaurantId: workspace.activeId,
        periodStart,
        periodEnd,
        columns: orderedColumns
      });
      if (preview.approved) {
        const run = await createPayrollExportRun({
          restaurantId: workspace.activeId,
          periodStart,
          periodEnd,
          columns: orderedColumns
        });
        downloadCsv(run.filename, run.headers, run.rows);
        await workspace.reloadOperations();
        toasts.show(
          t('Approved payroll export recorded: {rows} rows.', { rows: run.rowCount }),
          'success'
        );
      } else {
        downloadCsv(preview.filename, preview.headers, preview.rows);
        toasts.show(
          t('Draft payroll export downloaded. It has no official lineage until every included week is approved.'),
          'warning'
        );
      }
    } catch (error) {
      toasts.show(friendlyError(error), 'danger');
    } finally {
      busy = false;
    }
  }

  async function downloadRun(runId: string): Promise<void> {
    if (!workspace.activeId || busy) return;
    busy = true;
    try {
      const run = await getPayrollExportRun(workspace.activeId, runId);
      downloadCsv(run.filename, run.headers, run.rows);
    } catch (error) {
      toasts.show(friendlyError(error), 'danger');
    } finally {
      busy = false;
    }
  }

  function stamp(value: string): string {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return new Intl.DateTimeFormat(i18n.intlLocale, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(date);
  }
</script>

<svelte:head><title>{t('Payroll exports')} &middot; restogogo</title></svelte:head>

{#snippet pageActions()}
  <label class="range-field"><span>{t('From')}</span><input class="cl-field" type="date" bind:value={periodStart} /></label>
  <label class="range-field"><span>{t('To')}</span><input class="cl-field" type="date" bind:value={periodEnd} /></label>
  <span class="cl-toolbar__grow"></span>
  <button class="cl-btn is-primary" type="button" disabled={busy || !validPeriod || !orderedColumns.length} onclick={exportPeriod}>
    {t(busy ? 'Preparing…' : 'Export CSV')}
  </button>
{/snippet}

<ClassicPage actions={pageActions}>
  {#if !validPeriod}
    <div class="cl-notice" role="alert">
      {t('Payroll exports must contain complete Monday-to-Sunday weeks.')}
    </div>
  {/if}

  <div class="cl-stats">
    <ClassicStat label="Columns" value={orderedColumns.length} accent="var(--cl-mod-payroll)" mutedZero={false} />
    <ClassicStat label="Official exports" value={runs.length} tone={runs.length ? 'ok' : undefined} />
    <ClassicStat label="Exported rows" value={totalRows} mutedZero={false} />
  </div>

  <section class="cl-card">
    <div class="cl-card__head">
      <div>
        <h2>{t('Export columns')}</h2>
        <p>{t('Choose the social-secretariat fields included in new files. The server validates the same allowlist.')}</p>
      </div>
      <div class="column-actions">
        <button class="cl-btn" type="button" disabled={savingColumns || !columnsDirty} onclick={discardColumns}>{t('Discard')}</button>
        <button class="cl-btn" type="button" disabled={savingColumns || !columnsDirty} onclick={saveDefaults}>
          {t(savingColumns ? 'Saving…' : 'Save as default')}
        </button>
      </div>
    </div>
    <div class="column-builder">
      <div class="selected-columns" aria-label={t('Selected columns')}>
        {#each orderedColumns as key, index (key)}
          {@const field = PAYROLL_EXPORT_FIELDS.find((item) => item.key === key)}
          <div class="column-row">
            <span class="column-row__index">{index + 1}</span>
            <strong>{t(field?.label ?? key)}</strong>
            <span class="column-row__actions">
              <button
                class="cl-icon-btn"
                type="button"
                aria-label={t('Move column up')}
                title={t('Move column up')}
                disabled={index === 0}
                onclick={() => moveColumn(key, -1)}
              >↑</button>
              <button
                class="cl-icon-btn"
                type="button"
                aria-label={t('Move column down')}
                title={t('Move column down')}
                disabled={index === orderedColumns.length - 1}
                onclick={() => moveColumn(key, 1)}
              >↓</button>
              <button
                class="cl-btn"
                type="button"
                disabled={orderedColumns.length === 1}
                onclick={() => removeColumn(key)}
              >{t('Remove')}</button>
            </span>
          </div>
        {/each}
      </div>

      <div class="available-columns">
        <h3>{t('Available columns')}</h3>
        {#if availableColumns.length}
          <div class="available-columns__grid">
            {#each availableColumns as field (field.key)}
              <button class="column-add" type="button" onclick={() => addColumn(field.key)}>
                <span aria-hidden="true">+</span>{t(field.label)}
              </button>
            {/each}
          </div>
        {:else}
          <p>{t('All available columns are in use.')}</p>
        {/if}
      </div>
    </div>
  </section>

  <section class="cl-section">
    <div class="section-heading">
      <div>
        <h2 class="cl-section__title">{t('Official export history')}</h2>
        <p class="cl-section__note">{t('Approved exports are immutable and can be downloaded again with the same fingerprint.')}</p>
      </div>
      <ClassicStatus label={runs.length ? 'Lineage available' : 'No official export yet'} tone={runs.length ? 'ok' : 'attention'} />
    </div>
    <div class="cl-tablewrap">
      <table class="cl-table export-table">
        <thead>
          <tr>
            <th>{t('Created')}</th>
            <th>{t('Period')}</th>
            <th>{t('Filename')}</th>
            <th class="is-num">{t('Rows')}</th>
            <th class="is-num">{t('Hours')}</th>
            <th>{t('Fingerprint')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#if !runs.length}
            <tr><td colspan="7"><div class="cl-empty"><strong>{t('No official payroll exports')}</strong><span>{t('Approve the included timesheet weeks, then export this period.')}</span></div></td></tr>
          {:else}
            {#each runs as run (run.id)}
              <tr>
                <td class="is-quiet">{stamp(run.created_at)}</td>
                <td>{run.period_start} → {run.period_end}</td>
                <td>{run.filename}</td>
                <td class="is-num">{run.row_count}</td>
                <td class="is-num">{(run.total_net_minutes / 60).toFixed(2)}h</td>
                <td><code>{run.payload_sha256.slice(0, 16)}</code></td>
                <td class="is-num"><button class="cl-btn" type="button" disabled={busy} onclick={() => downloadRun(run.id)}>{t('Download')}</button></td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  </section>
</ClassicPage>

<style>
  .range-field {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: var(--cl-muted);
    font-size: 13px;
  }
  .cl-card__head p {
    margin: 5px 0 0;
    color: var(--cl-muted);
    font-size: 13px;
    line-height: 1.5;
  }
  .column-builder {
    border-top: 1px solid var(--cl-line);
  }
  .selected-columns {
    display: grid;
  }
  .column-row {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    min-height: 52px;
    padding: 7px 14px;
    border-bottom: 1px solid var(--cl-line);
  }
  .column-row__index {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border: 1px solid var(--cl-line);
    border-radius: 50%;
    color: var(--cl-muted);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .column-row strong {
    font-size: 13px;
  }
  .column-row__actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .available-columns {
    padding: 14px;
    background: var(--cl-surface-muted);
  }
  .available-columns h3,
  .available-columns p {
    margin: 0;
  }
  .available-columns h3 {
    margin-bottom: 10px;
    font-size: 12px;
    text-transform: uppercase;
  }
  .available-columns p {
    color: var(--cl-muted);
    font-size: 13px;
  }
  .available-columns__grid {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }
  .column-add {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-height: 34px;
    padding: 6px 10px;
    border: 1px solid var(--cl-line);
    border-radius: var(--cl-radius);
    color: var(--cl-ink);
    background: var(--cl-surface);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .column-add:hover {
    border-color: var(--cl-line-strong);
  }
  .section-heading {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
  }
  .export-table {
    min-width: 980px;
  }
  code {
    font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
    font-size: 12px;
  }
  @media (max-width: 760px) {
    .section-heading {
      align-items: stretch;
      flex-direction: column;
    }
    .column-row {
      grid-template-columns: 28px minmax(0, 1fr);
    }
    .column-row__actions {
      grid-column: 2;
      justify-content: flex-start;
    }
  }
  .column-actions { display: flex; gap: 8px; flex-wrap: wrap; }
</style>
