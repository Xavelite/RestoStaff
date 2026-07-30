<script lang="ts">
  import { FileSpreadsheet, FileText } from '@lucide/svelte';
  import Dialog from '$lib/components/Dialog.svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import { toasts } from '$lib/ui/toast.svelte';
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

    {#if file}
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
  .format-picker strong { font-size: 12px; }
  .format-picker small { color: var(--cl-muted); font-size: 10px; }
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
    font-size: 9px;
  }
  .preview > header strong { font-size: 11px; }
  .preview > header span { color: var(--cl-muted); font-size: 9px; }
  .preview > div { overflow: auto; }
  table {
    min-width: 760px;
    width: 100%;
    border-spacing: 0;
    border-collapse: separate;
    table-layout: fixed;
    font-size: 9px;
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

  @media (max-width: 520px) {
    .format-picker { grid-template-columns: 1fr; }
  }
</style>
