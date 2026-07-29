<script lang="ts">
  import {
    ArrowDown,
    ArrowLeft,
    ArrowRight,
    ArrowUp,
    Check,
    Columns3,
    Download,
    FileSpreadsheet,
    FileText,
    RotateCcw
  } from '@lucide/svelte';
  import ActionButton from '$lib/components/ActionButton.svelte';
  import Dialog from '$lib/components/Dialog.svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import { toasts } from '$lib/ui/toast.svelte';
  import {
    downloadExport,
    projectExportColumns,
    type ExportFormat,
    type PreparedExport
  } from './export-download';

  let {
    open,
    file,
    onclose
  }: {
    open: boolean;
    file: PreparedExport | null;
    onclose: () => void;
  } = $props();

  let step = $state<1 | 2>(1);
  let format = $state<ExportFormat>('xlsx');
  let selectedIndexes = $state<number[]>([]);
  let columnOrder = $state<number[]>([]);
  let downloading = $state(false);
  let openSignature = $state('');

  const orderedSelection = $derived(
    columnOrder.filter((index) => selectedIndexes.includes(index))
  );
  const projectedFile = $derived(
    file ? projectExportColumns(file, orderedSelection) : null
  );

  $effect(() => {
    const signature = open && file ? `${file.filename}:${file.headers.join('|')}` : '';
    if (!signature || signature === openSignature) return;
    const currentFile = file;
    if (!currentFile) return;
    openSignature = signature;
    step = 1;
    format = 'xlsx';
    selectedIndexes = currentFile.headers.map((_, index) => index);
    columnOrder = currentFile.headers.map((_, index) => index);
    downloading = false;
  });

  function toggleColumn(index: number) {
    selectedIndexes = selectedIndexes.includes(index)
      ? selectedIndexes.filter((value) => value !== index)
      : [...selectedIndexes, index];
  }

  function moveColumn(index: number, direction: -1 | 1) {
    const current = columnOrder.indexOf(index);
    const target = current + direction;
    if (current < 0 || target < 0 || target >= columnOrder.length) return;
    const next = [...columnOrder];
    [next[current], next[target]] = [next[target], next[current]];
    columnOrder = next;
  }

  function resetColumns() {
    if (!file) return;
    selectedIndexes = file.headers.map((_, index) => index);
    columnOrder = file.headers.map((_, index) => index);
  }

  async function finishDownload() {
    if (!file || !projectedFile || !orderedSelection.length || downloading) return;
    downloading = true;
    try {
      await downloadExport(
        {
          ...projectedFile,
          title: file.title,
          periodLabel: file.periodLabel
        },
        format
      );
      toasts.show(t('Your export is ready.'), 'success');
      onclose();
    } catch (error) {
      toasts.show(
        error instanceof Error ? error.message : t('The export could not be created.'),
        'danger'
      );
    } finally {
      downloading = false;
    }
  }

  const formatOptions: Array<{
    value: ExportFormat;
    label: string;
    detail: string;
    icon: typeof FileSpreadsheet;
  }> = [
    {
      value: 'xlsx',
      label: 'Excel',
      detail: 'Editable spreadsheet with styled headers.',
      icon: FileSpreadsheet
    },
    {
      value: 'pdf',
      label: 'PDF',
      detail: 'Polished document for printing or sharing.',
      icon: FileText
    },
    {
      value: 'csv',
      label: 'CSV',
      detail: 'Universal data file for other systems.',
      icon: Columns3
    }
  ];
</script>

<Dialog
  {open}
  size="large"
  title={file?.title ?? 'Configure export'}
  description={file ? `${file.periodLabel} · ${file.rows.length} ${t('records')}` : ''}
  onclose={() => !downloading && onclose()}
>
  <div class="wizard">
    <nav class="steps" aria-label={t('Export steps')}>
      <button
        type="button"
        class:is-active={step === 1}
        class:is-complete={step === 2}
        onclick={() => (step = 1)}
      >
        <span>{step === 2 ? '✓' : '1'}</span>
        <span><strong>{t('Choose columns')}</strong><small>{t('Content and order')}</small></span>
      </button>
      <span class="step-line" aria-hidden="true"></span>
      <button type="button" class:is-active={step === 2} disabled={!orderedSelection.length}>
        <span>2</span>
        <span><strong>{t('Format and preview')}</strong><small>{t('Check the final file')}</small></span>
      </button>
    </nav>

    {#if step === 1 && file}
      <section class="wizard-step" aria-labelledby="columns-heading">
        <div class="step-heading">
          <div>
            <h3 id="columns-heading">{t('What should the file include?')}</h3>
            <p>{t('Choose the columns to export and arrange them in the order you need.')}</p>
          </div>
          <button class="reset-button" type="button" onclick={resetColumns}>
            <RotateCcw size={14} aria-hidden="true" />
            {t('Reset')}
          </button>
        </div>

        <div class="selection-summary">
          <span class="summary-icon"><Columns3 size={17} aria-hidden="true" /></span>
          <span>
            <strong>{selectedIndexes.length} / {file.headers.length} {t('columns selected')}</strong>
            <small>{file.rows.length} {t('records in the selected period')}</small>
          </span>
          <button
            type="button"
            onclick={() =>
              (selectedIndexes =
                selectedIndexes.length === file.headers.length
                  ? []
                  : file.headers.map((_, index) => index))}
          >
            {selectedIndexes.length === file.headers.length ? t('Clear all') : t('Select all')}
          </button>
        </div>

        <div class="column-list">
          {#each columnOrder as index, position (index)}
            <div class="column-row" class:is-selected={selectedIndexes.includes(index)}>
              <label>
                <input
                  type="checkbox"
                  checked={selectedIndexes.includes(index)}
                  onchange={() => toggleColumn(index)}
                />
                <span class="checkmark" aria-hidden="true"><Check size={13} /></span>
                <span>
                  <strong>{file.headers[index]}</strong>
                  <small>{t('Column')} {position + 1}</small>
                </span>
              </label>
              <div class="reorder-actions">
                <button
                  type="button"
                  title={t('Move column up')}
                  aria-label={t('Move column up')}
                  disabled={position === 0}
                  onclick={() => moveColumn(index, -1)}
                ><ArrowUp size={15} /></button>
                <button
                  type="button"
                  title={t('Move column down')}
                  aria-label={t('Move column down')}
                  disabled={position === columnOrder.length - 1}
                  onclick={() => moveColumn(index, 1)}
                ><ArrowDown size={15} /></button>
              </div>
            </div>
          {/each}
        </div>
      </section>
    {:else if file && projectedFile}
      <section class="wizard-step" aria-labelledby="format-heading">
        <div class="step-heading">
          <div>
            <h3 id="format-heading">{t('How will you use this file?')}</h3>
            <p>{t('Choose a format, then review a sample before downloading.')}</p>
          </div>
        </div>

        <div class="format-grid">
          {#each formatOptions as option}
            <button
              type="button"
              class:is-selected={format === option.value}
              aria-pressed={format === option.value}
              onclick={() => (format = option.value)}
            >
              <span class="format-icon"><option.icon size={20} aria-hidden="true" /></span>
              <span><strong>{t(option.label)}</strong><small>{t(option.detail)}</small></span>
              <span class="format-check" aria-hidden="true"><Check size={13} /></span>
            </button>
          {/each}
        </div>

        <div class="preview-block">
          <header>
            <div>
              <strong>{t('File preview')}</strong>
              <span>{projectedFile.headers.length} {t('columns')} · {projectedFile.rows.length} {t('records')}</span>
            </div>
            <span class="filetype">.{format}</span>
          </header>
          <div class="preview-scroll">
            <table>
              <thead>
                <tr>{#each projectedFile.headers as header}<th>{header}</th>{/each}</tr>
              </thead>
              <tbody>
                {#each projectedFile.rows.slice(0, 6) as row}
                  <tr>{#each row as value}<td>{value}</td>{/each}</tr>
                {/each}
              </tbody>
            </table>
            {#if projectedFile.rows.length === 0}
              <div class="no-preview">{t('There are no records in this period.')}</div>
            {/if}
          </div>
          {#if projectedFile.rows.length > 6}
            <footer>{t('Showing the first 6 records. The download includes all records.')}</footer>
          {/if}
        </div>
      </section>
    {/if}
  </div>

  {#snippet footer()}
    <div class="wizard-footer">
      <span class="footer-note">
        {#if step === 1}
          {t('Nothing is downloaded until the final step.')}
        {:else}
          {t('Ready to create')} .{format}
        {/if}
      </span>
      <div>
        <ActionButton label="Cancel" disabled={downloading} onclick={onclose} />
        {#if step === 2}
          <button class="footer-button" type="button" disabled={downloading} onclick={() => (step = 1)}>
            <ArrowLeft size={15} aria-hidden="true" />{t('Back')}
          </button>
        {/if}
        {#if step === 1}
          <button
            class="footer-button is-primary"
            type="button"
            disabled={!orderedSelection.length}
            onclick={() => (step = 2)}
          >
            {t('Continue')}<ArrowRight size={15} aria-hidden="true" />
          </button>
        {:else}
          <button
            class="footer-button is-primary"
            type="button"
            disabled={downloading || !projectedFile?.rows.length}
            onclick={finishDownload}
          >
            <Download size={15} aria-hidden="true" />
            {downloading ? t('Creating file…') : t('Download file')}
          </button>
        {/if}
      </div>
    </div>
  {/snippet}
</Dialog>

<style>
  .wizard {
    min-height: 500px;
  }
  .steps {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 44px minmax(0, 1fr);
    align-items: center;
    padding: 0 0 18px;
    border-bottom: 1px solid var(--rst-ui-divider-soft);
  }
  .steps button {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0;
    border: 0;
    color: var(--rst-ui-muted);
    background: transparent;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .steps button:disabled { cursor: default; }
  .steps button > span:first-child {
    width: 28px;
    height: 28px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    border: 1px solid var(--rst-ui-line-strong);
    border-radius: 50%;
    background: var(--rst-ui-surface-field);
    font-size: 12px;
    font-weight: var(--rst-fw-bold);
  }
  .steps button > span:last-child { min-width: 0; display: grid; gap: 1px; }
  .steps strong { color: inherit; font-size: 12.5px; }
  .steps small { color: var(--rst-ui-muted); font-size: 10.5px; }
  .steps button.is-active { color: var(--rst-ui-text); }
  .steps button.is-active > span:first-child {
    border-color: var(--rst-ui-action);
    color: var(--rst-on-accent-text);
    background: var(--rst-ui-action);
    box-shadow: 0 0 0 3px rgba(var(--rst-ui-action-rgb), .12);
  }
  .steps button.is-complete > span:first-child {
    border-color: var(--rst-state-success-border);
    color: var(--rst-state-success-text);
    background: var(--rst-state-success-bg);
  }
  .step-line { height: 1px; background: var(--rst-ui-line); }
  .wizard-step { padding-top: 20px; }
  .step-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 16px;
  }
  .step-heading h3, .step-heading p { margin: 0; }
  .step-heading h3 { color: var(--rst-ui-text); font-size: 16px; }
  .step-heading p {
    margin-top: 3px;
    color: var(--rst-ui-muted);
    font-size: 12px;
    line-height: 1.45;
  }
  .reset-button {
    min-height: 30px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 8px;
    border: 0;
    color: var(--rst-ui-muted);
    background: transparent;
    font: inherit;
    font-size: 11px;
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
  }
  .reset-button:hover { color: var(--rst-ui-text); }
  .selection-summary {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    padding: 11px 12px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    background: var(--rst-ui-surface-field);
  }
  .summary-icon {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border-radius: 6px;
    color: var(--rst-ui-action);
    background: rgba(var(--rst-ui-action-rgb), .1);
  }
  .selection-summary > span:nth-child(2) { display: grid; gap: 1px; }
  .selection-summary strong { color: var(--rst-ui-text); font-size: 12px; }
  .selection-summary small { color: var(--rst-ui-muted); font-size: 10.5px; }
  .selection-summary button {
    border: 0;
    color: var(--rst-ui-action);
    background: transparent;
    font: inherit;
    font-size: 11px;
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
  }
  .column-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 7px;
    margin-top: 10px;
  }
  .column-row {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 52px;
    padding: 7px 8px 7px 10px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    background: var(--rst-ui-surface-panel);
    transition: border-color 140ms ease, background 140ms ease;
  }
  .column-row.is-selected {
    border-color: rgba(var(--rst-ui-action-rgb), .36);
    background: rgba(var(--rst-ui-action-rgb), .035);
  }
  .column-row label {
    min-width: 0;
    flex: 1;
    display: flex;
    align-items: center;
    gap: 9px;
    cursor: pointer;
  }
  .column-row input { position: absolute; opacity: 0; pointer-events: none; }
  .checkmark {
    width: 19px;
    height: 19px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    border: 1px solid var(--rst-ui-line-strong);
    border-radius: 4px;
    color: transparent;
    background: var(--rst-ui-surface-field);
  }
  .column-row input:checked + .checkmark {
    border-color: var(--rst-ui-action);
    color: var(--rst-on-accent-text);
    background: var(--rst-ui-action);
  }
  .column-row input:focus-visible + .checkmark {
    outline: 3px solid rgba(var(--rst-ui-action-rgb), .2);
    outline-offset: 1px;
  }
  .column-row label > span:last-child { min-width: 0; display: grid; gap: 1px; }
  .column-row strong {
    overflow: hidden;
    color: var(--rst-ui-text);
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .column-row small { color: var(--rst-ui-muted); font-size: 10px; }
  .reorder-actions { display: flex; gap: 2px; }
  .reorder-actions button {
    width: 27px;
    height: 27px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 5px;
    color: var(--rst-ui-muted);
    background: transparent;
    cursor: pointer;
  }
  .reorder-actions button:hover:not(:disabled) {
    color: var(--rst-ui-text);
    background: var(--rst-ui-hover-bg);
  }
  .reorder-actions button:disabled { opacity: .25; cursor: default; }
  .format-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }
  .format-grid > button {
    position: relative;
    min-width: 0;
    min-height: 92px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    gap: 10px;
    padding: 13px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    color: var(--rst-ui-muted);
    background: var(--rst-ui-surface-panel);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .format-grid > button:hover { border-color: var(--rst-ui-line-strong); }
  .format-grid > button.is-selected {
    border-color: var(--rst-ui-action);
    background: rgba(var(--rst-ui-action-rgb), .04);
    box-shadow: inset 0 0 0 1px rgba(var(--rst-ui-action-rgb), .16);
  }
  .format-icon {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border-radius: 6px;
    color: var(--rst-ui-action);
    background: rgba(var(--rst-ui-action-rgb), .1);
  }
  .format-grid button > span:nth-child(2) { min-width: 0; display: grid; gap: 3px; }
  .format-grid strong { color: var(--rst-ui-text); font-size: 12.5px; }
  .format-grid small { font-size: 10.5px; line-height: 1.35; }
  .format-check {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 18px;
    height: 18px;
    display: none;
    place-items: center;
    border-radius: 50%;
    color: var(--rst-on-accent-text);
    background: var(--rst-ui-action);
  }
  .format-grid button.is-selected .format-check { display: grid; }
  .preview-block {
    margin-top: 14px;
    overflow: hidden;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    background: var(--rst-ui-surface-panel);
  }
  .preview-block > header {
    min-height: 48px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--rst-ui-line);
    background: var(--rst-ui-surface-panel-head);
  }
  .preview-block > header > div { display: grid; gap: 1px; }
  .preview-block > header strong { color: var(--rst-ui-text); font-size: 12px; }
  .preview-block > header span { color: var(--rst-ui-muted); font-size: 10.5px; }
  .filetype {
    padding: 4px 7px;
    border-radius: 4px;
    color: var(--rst-ui-action) !important;
    background: rgba(var(--rst-ui-action-rgb), .1);
    font-weight: var(--rst-fw-bold);
    text-transform: uppercase;
  }
  .preview-scroll { min-height: 165px; overflow: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 10.5px; white-space: nowrap; }
  th, td {
    max-width: 180px;
    padding: 7px 9px;
    overflow: hidden;
    border-right: 1px solid var(--rst-ui-divider-soft);
    border-bottom: 1px solid var(--rst-ui-divider-soft);
    color: var(--rst-ui-muted);
    text-align: left;
    text-overflow: ellipsis;
  }
  th {
    position: sticky;
    top: 0;
    color: var(--rst-ui-text);
    background: var(--rst-ui-surface-field);
    font-weight: var(--rst-fw-bold);
  }
  .preview-block > footer {
    padding: 7px 12px;
    color: var(--rst-ui-muted);
    background: var(--rst-ui-surface-panel-head);
    font-size: 10.5px;
  }
  .no-preview {
    min-height: 140px;
    display: grid;
    place-items: center;
    color: var(--rst-ui-muted);
    font-size: 12px;
  }
  .wizard-footer {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .wizard-footer > div { display: flex; gap: 8px; }
  .footer-note { color: var(--rst-ui-muted); font-size: 10.5px; }
  .footer-button {
    min-height: 38px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 8px 14px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    color: var(--rst-ui-text);
    background: var(--rst-ui-surface-field-strong);
    font: inherit;
    font-size: 13px;
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
  }
  .footer-button.is-primary {
    border-color: var(--rst-ui-action);
    color: var(--rst-on-accent-text);
    background: var(--rst-ui-action);
  }
  .footer-button:disabled { opacity: .5; cursor: default; }
  @media (max-width: 760px) {
    .wizard { min-height: 0; }
    .steps { grid-template-columns: minmax(0, 1fr) 24px minmax(0, 1fr); }
    .steps small { display: none; }
    .column-list, .format-grid { grid-template-columns: minmax(0, 1fr); }
    .format-grid > button { min-height: 70px; }
    .wizard-footer { justify-content: flex-end; }
    .footer-note { display: none; }
    .wizard-footer > div { width: 100%; }
    .wizard-footer :global(button) { flex: 1; }
  }
</style>
