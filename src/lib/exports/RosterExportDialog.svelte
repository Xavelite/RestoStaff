<script lang="ts">
  import { FileSpreadsheet, FileText } from '@lucide/svelte';
  import Dialog from '$lib/components/Dialog.svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import { toasts } from '$lib/ui/toast.svelte';
  import { formatHours } from '$lib/calendar/date';
  import {
    downloadExport,
    type ExportFormat,
    type PreparedExport
  } from '$lib/exports/export-download';

  let {
    open,
    file,
    onclose
  }: {
    open: boolean;
    file: PreparedExport | null;
    onclose: () => void;
  } = $props();

  let format = $state<Extract<ExportFormat, 'pdf' | 'xlsx'>>('pdf');
  let downloading = $state(false);

  async function download(): Promise<void> {
    if (!file || downloading) return;
    downloading = true;
    try {
      await downloadExport(file, format);
      onclose();
    } catch (error) {
      toasts.show(error instanceof Error ? error.message : String(error), 'danger');
    } finally {
      downloading = false;
    }
  }
</script>

{#snippet footer()}
  <button class="cl-btn" type="button" disabled={downloading} onclick={onclose}>{t('Cancel')}</button>
  <button class="cl-btn is-primary" type="button" disabled={!file || downloading} onclick={() => void download()}>
    {t(downloading ? 'Preparing...' : 'Download')} {format === 'xlsx' ? 'XLSX' : 'PDF'}
  </button>
{/snippet}

<Dialog
  {open}
  title={file?.title ?? t('Export roster')}
  description={file?.periodLabel ?? ''}
  size="large"
  {footer}
  {onclose}
>
  <div class="export-flow">
    <div class="format-picker" aria-label={t('File format')}>
      <button class="is-pdf" type="button" class:is-active={format === 'pdf'} onclick={() => (format = 'pdf')}>
        <span><FileText size={19} strokeWidth={1.7} aria-hidden="true" /></span>
        <strong>PDF</strong>
        <small>{t('Ready to print or share')}</small>
      </button>
      <button class="is-xlsx" type="button" class:is-active={format === 'xlsx'} onclick={() => (format = 'xlsx')}>
        <span><FileSpreadsheet size={19} strokeWidth={1.7} aria-hidden="true" /></span>
        <strong>Excel</strong>
        <small>{t('Editable weekly roster')}</small>
      </button>
    </div>

    {#if file?.roster}
      {@const roster = file.roster}
      <div class="preview roster-preview">
        <header>
          <div>
            <strong>{t('Roster preview')}</strong>
            <span>{file.periodLabel}</span>
          </div>
          <span>{t('{count} shifts', { count: roster.shiftCount })} · {formatHours(roster.totalHours)}</span>
        </header>
        <div>
          <table>
            <thead>
              <tr class="day-head">
                <th rowspan="2" class="employee-head">{roster.employeeLabel}</th>
                {#each roster.days as day}
                  <th colspan={roster.services.length}>
                    <strong>{day.label}</strong>
                    <small>{day.staffCount} {t('staff')} · {formatHours(day.totalHours)}</small>
                  </th>
                {/each}
                <th rowspan="2" class="total-head">{roster.totalLabel}</th>
              </tr>
              <tr class="service-head">
                {#each roster.days as _day}
                  {#each roster.services as service, serviceIndex}
                    <th class:is-day-start={serviceIndex === 0} data-tone={serviceIndex % 4}>{service.label}</th>
                  {/each}
                {/each}
              </tr>
            </thead>
            <tbody>
              {#each roster.rows.slice(0, 7) as row}
                <tr>
                  <td class="employee-cell"><strong>{row.employeeName}</strong></td>
                  {#each row.cells as cell, cellIndex}
                    <td
                      class="roster-cell"
                      class:is-empty={!cell.shifts.length}
                      data-tone={cellIndex % roster.services.length % 4}
                    >
                      {#each cell.shifts as shift}
                        <span class="shift">
                          <strong>{shift.startsAt}–{shift.endsAt}</strong>
                          {#if shift.position}<small>{shift.position}</small>{/if}
                        </span>
                      {/each}
                    </td>
                  {/each}
                  <td class="total-cell">{formatHours(row.totalHours)}</td>
                </tr>
              {/each}
            </tbody>
            <tfoot>
              <tr class="staff-total">
                <th>{roster.staffLabel}</th>
                {#each roster.staffCounts as count, index}
                  <td data-tone={index % roster.services.length % 4}>{count}</td>
                {/each}
                <td>{roster.rows.filter((row) => row.totalHours > 0).length}</td>
              </tr>
              <tr class="hours-total">
                <th>{roster.hoursLabel}</th>
                {#each roster.serviceHours as hours}
                  <td>{formatHours(hours)}</td>
                {/each}
                <td>{formatHours(roster.totalHours)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {#if roster.rows.length > 7}
          <footer>{t('+{count} more employees in the exported file', { count: roster.rows.length - 7 })}</footer>
        {/if}
      </div>
    {:else if file}
      <div class="preview">
        <header>
          <strong>{t('File preview')}</strong>
          <span>{t('{count} employees', { count: file.rows.length })}</span>
        </header>
        <div>
          <table>
            <thead><tr>{#each file.headers as header}<th>{header}</th>{/each}</tr></thead>
            <tbody>
              {#each file.rows.slice(0, 5) as row}
                <tr>{#each row as value}<td>{value}</td>{/each}</tr>
              {/each}
            </tbody>
          </table>
        </div>
        {#if file.rows.length > 5}
          <footer>{t('+{count} more rows in the exported file', { count: file.rows.length - 5 })}</footer>
        {/if}
      </div>
    {/if}
  </div>
</Dialog>

<style>
  .export-flow { display: grid; gap: 16px; }
  .format-picker {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .format-picker button {
    min-width: 0;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 2px 10px;
    padding: 11px 12px;
    border: 1px solid var(--cl-line);
    border-radius: var(--cl-radius);
    color: var(--cl-ink);
    background: var(--cl-surface);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .format-picker button:hover {
    border-color: color-mix(in srgb, var(--cl-accent) 40%, var(--cl-line));
  }
  .format-picker button.is-active {
    border-color: var(--cl-accent);
    background: color-mix(in srgb, var(--cl-accent) 6%, var(--cl-surface));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--cl-accent) 24%, transparent);
  }
  .format-picker button > span {
    grid-row: 1 / 3;
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    border-radius: 6px;
    color: var(--format-color);
    background: color-mix(in srgb, var(--format-color) 9%, transparent);
  }
  .format-picker button.is-pdf { --format-color: #c43b3b; }
  .format-picker button.is-xlsx { --format-color: #18864b; }
  .format-picker strong { font-size: var(--rst-fs-control); }
  .format-picker small { color: var(--cl-muted); font-size: var(--rst-fs-caption); }
  .preview {
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--cl-line);
    border-radius: var(--cl-radius);
  }
  .preview > header,
  .preview > footer {
    min-height: 38px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 7px 10px;
    background: var(--cl-surface-muted);
  }
  .preview > header { border-bottom: 1px solid var(--cl-line); }
  .preview > footer {
    justify-content: center;
    border-top: 1px solid var(--cl-line);
    color: var(--cl-muted);
    font-size: var(--rst-fs-micro);
  }
  .preview > header strong { font-size: var(--rst-fs-label); }
  .preview > header span { color: var(--cl-muted); font-size: var(--rst-fs-micro); }
  .roster-preview > header > div { display: grid; gap: 1px; }
  .preview > div { overflow: auto; }
  table {
    min-width: 760px;
    width: 100%;
    border-spacing: 0;
    border-collapse: separate;
    table-layout: fixed;
    font-size: var(--rst-fs-micro);
  }
  th, td {
    min-width: 0;
    padding: 6px 7px;
    overflow: hidden;
    border-bottom: 1px solid var(--cl-grid-line);
    text-align: left;
    text-overflow: ellipsis;
    white-space: pre-line;
  }
  th {
    color: var(--rst-on-accent-text);
    background: var(--cl-ink);
    font-weight: var(--rst-fw-bold);
  }
  th:first-child,
  td:first-child { width: 120px; }
  tbody tr:last-child td { border-bottom: 0; }
  tbody tr:nth-child(even) td { background: var(--cl-surface-muted); }

  .roster-preview table {
    min-width: 860px;
    table-layout: fixed;
    font-size: var(--rst-fs-caption);
  }
  .roster-preview th,
  .roster-preview td {
    padding: 5px;
    border-right: 1px solid var(--cl-grid-line);
    vertical-align: middle;
    text-align: center;
    white-space: normal;
  }
  .roster-preview th:last-child,
  .roster-preview td:last-child { border-right: 0; }
  .roster-preview .day-head th {
    height: 42px;
    color: var(--cl-ink);
    background: color-mix(in srgb, var(--cl-surface-muted) 74%, var(--cl-accent) 3%);
  }
  .roster-preview .day-head th:not(.employee-head, .total-head) {
    border-left: 1px solid var(--cl-line-strong);
  }
  .roster-preview .day-head strong,
  .roster-preview .day-head small { display: block; }
  .roster-preview .day-head strong { font-size: var(--rst-fs-micro); }
  .roster-preview .day-head small {
    margin-top: 2px;
    color: var(--cl-muted);
    font-weight: var(--rst-fw-medium);
    font-size: var(--rst-fs-micro);
  }
  .roster-preview .employee-head,
  .roster-preview .total-head {
    color: #fff !important;
    background: #25324a !important;
  }
  .roster-preview .employee-head { width: 128px; text-align: left; }
  .roster-preview .total-head { width: 48px; }
  .roster-preview .service-head th {
    height: 28px;
    color: var(--service-ink);
    background: var(--service-head);
    font-size: var(--rst-fs-micro);
    text-align: center;
  }
  .roster-preview .service-head th.is-day-start {
    border-left-color: var(--cl-line-strong);
  }
  .roster-preview [data-tone='0'] {
    --service-head: #dbeafe;
    --service-body: #f4f8ff;
    --service-ink: #1d4ed8;
  }
  .roster-preview [data-tone='1'] {
    --service-head: #e0e7ff;
    --service-body: #f6f7ff;
    --service-ink: #4338ca;
  }
  .roster-preview [data-tone='2'] {
    --service-head: #ccfbf1;
    --service-body: #f0fdfa;
    --service-ink: #0f766e;
  }
  .roster-preview [data-tone='3'] {
    --service-head: #fef3c7;
    --service-body: #fffbeb;
    --service-ink: #a16207;
  }
  .roster-preview tbody tr { height: 48px; }
  .roster-preview tbody tr:nth-child(even) td { background: transparent; }
  .roster-preview .employee-cell {
    padding-left: 9px;
    background: var(--cl-surface) !important;
    color: var(--cl-ink);
    text-align: left;
  }
  .roster-preview .roster-cell {
    background: var(--service-body);
    color: var(--cl-ink);
  }
  .roster-preview .roster-cell.is-empty {
    background-color: color-mix(in srgb, var(--cl-surface-muted) 60%, white);
    background-image: repeating-linear-gradient(
      135deg,
      transparent 0,
      transparent 7px,
      color-mix(in srgb, var(--cl-line) 48%, transparent) 7px,
      color-mix(in srgb, var(--cl-line) 48%, transparent) 8px
    );
  }
  .roster-preview .shift { display: grid; gap: 1px; }
  .roster-preview .shift + .shift {
    margin-top: 4px;
    padding-top: 4px;
    border-top: 1px dashed color-mix(in srgb, var(--service-ink) 20%, transparent);
  }
  .roster-preview .shift strong {
    color: var(--cl-ink);
    font-size: var(--rst-fs-micro);
    white-space: nowrap;
  }
  .roster-preview .shift small {
    overflow: hidden;
    color: var(--service-ink);
    font-size: var(--rst-fs-micro);
    font-weight: var(--rst-fw-bold);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .roster-preview .total-cell {
    background: #eef2f7 !important;
    color: var(--cl-ink);
    font-weight: var(--rst-fw-bold);
  }
  .roster-preview tfoot th,
  .roster-preview tfoot td { font-weight: var(--rst-fw-bold); }
  .roster-preview .staff-total th,
  .roster-preview .staff-total td:last-child { background: #e8edf5; color: var(--cl-ink); }
  .roster-preview .staff-total td:not(:last-child) {
    background: var(--service-head);
    color: var(--service-ink);
  }
  .roster-preview .staff-total th,
  .roster-preview .hours-total th { padding-left: 9px; text-align: left; }
  .roster-preview .hours-total th,
  .roster-preview .hours-total td { background: #25324a; color: #fff; }

  @media (max-width: 520px) {
    .format-picker { grid-template-columns: 1fr; }
  }
</style>
