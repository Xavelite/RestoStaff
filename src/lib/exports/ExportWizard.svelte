<script lang="ts">
  import {
    ArrowLeft,
    ArrowRight,
    Check,
    Columns3,
    Download,
    Eye,
    EyeOff,
    FileSpreadsheet,
    FileText,
    GripVertical,
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

  let format = $state<ExportFormat>('xlsx');
  let selectedIndexes = $state<number[]>([]);
  let columnOrder = $state<number[]>([]);
  let downloading = $state(false);
  let draggingIndex = $state<number | null>(null);
  let dropIndex = $state<number | null>(null);
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
    format = 'xlsx';
    selectedIndexes = currentFile.headers.map((_, index) => index);
    columnOrder = currentFile.headers.map((_, index) => index);
    downloading = false;
    draggingIndex = null;
    dropIndex = null;
  });

  function toggleColumn(index: number): void {
    selectedIndexes = selectedIndexes.includes(index)
      ? selectedIndexes.filter((value) => value !== index)
      : [...selectedIndexes, index];
  }

  function moveColumn(index: number, direction: -1 | 1): void {
    const current = columnOrder.indexOf(index);
    const target = current + direction;
    if (current < 0 || target < 0 || target >= columnOrder.length) return;
    const next = [...columnOrder];
    [next[current], next[target]] = [next[target], next[current]];
    columnOrder = next;
  }

  function placeColumn(index: number, beforeIndex: number): void {
    if (index === beforeIndex) return;
    const next = columnOrder.filter((value) => value !== index);
    const target = next.indexOf(beforeIndex);
    next.splice(target < 0 ? next.length : target, 0, index);
    columnOrder = next;
  }

  function startDrag(event: DragEvent, index: number): void {
    draggingIndex = index;
    dropIndex = index;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(index));
    }
  }

  function dragOver(event: DragEvent, index: number): void {
    event.preventDefault();
    dropIndex = index;
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }

  function finishDrop(event: DragEvent, index: number): void {
    event.preventDefault();
    const source =
      draggingIndex ??
      Number.parseInt(event.dataTransfer?.getData('text/plain') ?? '', 10);
    if (Number.isInteger(source)) placeColumn(source, index);
    draggingIndex = null;
    dropIndex = null;
  }

  function finishDrag(): void {
    draggingIndex = null;
    dropIndex = null;
  }

  function resetColumns(): void {
    if (!file) return;
    selectedIndexes = file.headers.map((_, index) => index);
    columnOrder = file.headers.map((_, index) => index);
  }

  async function finishDownload(): Promise<void> {
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
  title={file?.title ?? t('Export')}
  description={file ? `${file.periodLabel} · ${file.rows.length} ${t('records')}` : ''}
  onclose={() => !downloading && onclose()}
>
  {#if file && projectedFile}
    <div class="export-workspace">
      <section class="format-section" aria-labelledby="format-heading">
        <div class="section-copy">
          <strong id="format-heading">{t('File format')}</strong>
          <span>{t('Choose how you want to use the file.')}</span>
        </div>
        <div class="format-switch" role="radiogroup" aria-label={t('File format')}>
          {#each formatOptions as option}
            <button
              type="button"
              class:is-selected={format === option.value}
              role="radio"
              aria-checked={format === option.value}
              title={t(option.detail)}
              onclick={() => (format = option.value)}
            >
              <option.icon size={16} aria-hidden="true" />
              <span>{t(option.label)}</span>
              {#if format === option.value}<Check size={13} aria-hidden="true" />{/if}
            </button>
          {/each}
        </div>
      </section>

      <section class="columns-section" aria-labelledby="columns-heading">
        <header>
          <div class="section-copy">
            <strong id="columns-heading">{t('Columns and order')}</strong>
            <span>
              {selectedIndexes.length} / {file.headers.length} {t('columns selected')}
              · {t('Drag columns into the order you need.')}
            </span>
          </div>
          <div class="column-actions">
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
            <button type="button" onclick={resetColumns}>
              <RotateCcw size={13} aria-hidden="true" />
              {t('Reset')}
            </button>
          </div>
        </header>

        <div class="column-strip" role="list" aria-label={t('Export columns')}>
          {#each columnOrder as index, position (index)}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="column-chip"
              class:is-selected={selectedIndexes.includes(index)}
              class:is-dragging={draggingIndex === index}
              class:is-drop-target={dropIndex === index && draggingIndex !== index}
              role="listitem"
              draggable="true"
              ondragstart={(event) => startDrag(event, index)}
              ondragover={(event) => dragOver(event, index)}
              ondrop={(event) => finishDrop(event, index)}
              ondragend={finishDrag}
            >
              <GripVertical class="drag-grip" size={15} aria-hidden="true" />
              <button
                class="visibility-button"
                type="button"
                aria-pressed={selectedIndexes.includes(index)}
                aria-label={t(selectedIndexes.includes(index) ? 'Hide column' : 'Show column')}
                title={t(selectedIndexes.includes(index) ? 'Hide column' : 'Show column')}
                onclick={() => toggleColumn(index)}
              >
                {#if selectedIndexes.includes(index)}
                  <Eye size={14} aria-hidden="true" />
                {:else}
                  <EyeOff size={14} aria-hidden="true" />
                {/if}
              </button>
              <span title={file.headers[index]}>{file.headers[index]}</span>
              <div class="move-buttons">
                <button
                  type="button"
                  title={t('Move column left')}
                  aria-label={t('Move column left')}
                  disabled={position === 0}
                  onclick={() => moveColumn(index, -1)}
                ><ArrowLeft size={13} aria-hidden="true" /></button>
                <button
                  type="button"
                  title={t('Move column right')}
                  aria-label={t('Move column right')}
                  disabled={position === columnOrder.length - 1}
                  onclick={() => moveColumn(index, 1)}
                ><ArrowRight size={13} aria-hidden="true" /></button>
              </div>
            </div>
          {/each}
        </div>
      </section>

      <section class="preview-block" aria-labelledby="preview-heading">
        <header>
          <div>
            <strong id="preview-heading">{t('File preview')}</strong>
            <span>
              {projectedFile.headers.length} {t('columns')} ·
              {projectedFile.rows.length} {t('records')}
            </span>
          </div>
          <span class="filetype">.{format}</span>
        </header>
        {#if orderedSelection.length}
          <div class="preview-scroll">
            <table>
              <thead>
                <tr>{#each projectedFile.headers as header}<th>{header}</th>{/each}</tr>
              </thead>
              <tbody>
                {#each projectedFile.rows.slice(0, 8) as row}
                  <tr>{#each row as value}<td>{value}</td>{/each}</tr>
                {/each}
              </tbody>
            </table>
            {#if projectedFile.rows.length === 0}
              <div class="no-preview">{t('There are no records in this period.')}</div>
            {/if}
          </div>
          {#if projectedFile.rows.length > 8}
            <footer>{t('Showing the first 8 records. The download includes all records.')}</footer>
          {/if}
        {:else}
          <div class="no-columns">
            <Columns3 size={22} aria-hidden="true" />
            <strong>{t('Choose at least one column')}</strong>
            <span>{t('Visible columns appear here in their export order.')}</span>
          </div>
        {/if}
      </section>
    </div>
  {/if}

  {#snippet footer()}
    <div class="wizard-footer">
      <span class="footer-note">
        {t('The preview uses real records from the selected period.')}
      </span>
      <div>
        <ActionButton label="Cancel" disabled={downloading} onclick={onclose} />
        <button
          class="download-button"
          type="button"
          disabled={downloading || !projectedFile?.rows.length || !orderedSelection.length}
          onclick={finishDownload}
        >
          <Download size={15} aria-hidden="true" />
          {downloading ? t('Creating file…') : `${t('Download')} ${format.toUpperCase()}`}
        </button>
      </div>
    </div>
  {/snippet}
</Dialog>

<style>
  .export-workspace {
    min-height: 500px;
    display: grid;
    align-content: start;
    gap: 18px;
  }
  .format-section,
  .columns-section > header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
  }
  .format-section {
    padding-bottom: 16px;
    border-bottom: 1px solid var(--rst-ui-divider-soft);
  }
  .section-copy {
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  .section-copy strong {
    color: var(--rst-ui-text);
    font-size: 12.5px;
  }
  .section-copy span {
    color: var(--rst-ui-muted);
    font-size: 10.5px;
    line-height: 1.35;
  }
  .format-switch {
    display: inline-flex;
    gap: 3px;
    padding: 3px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    background: var(--rst-ui-surface-field);
  }
  .format-switch button {
    min-width: 96px;
    min-height: 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 6px 10px;
    border: 0;
    border-radius: 5px;
    color: var(--rst-ui-muted);
    background: transparent;
    font: inherit;
    font-size: 11.5px;
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
  }
  .format-switch button:hover {
    color: var(--rst-ui-text);
    background: var(--rst-ui-hover-bg);
  }
  .format-switch button.is-selected {
    color: var(--rst-ui-action);
    background: var(--rst-ui-surface-panel);
    box-shadow: 0 1px 3px rgb(15 23 42 / .1);
  }
  .columns-section {
    display: grid;
    gap: 10px;
  }
  .column-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .column-actions button {
    min-height: 28px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 7px;
    border: 0;
    border-radius: 5px;
    color: var(--rst-ui-muted);
    background: transparent;
    font: inherit;
    font-size: 10.5px;
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
  }
  .column-actions button:hover {
    color: var(--rst-ui-text);
    background: var(--rst-ui-hover-bg);
  }
  .column-strip {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }
  .column-chip {
    min-width: 0;
    min-height: 38px;
    display: grid;
    grid-template-columns: auto auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 5px;
    padding: 4px 5px;
    border: 1px solid var(--rst-ui-line);
    border-radius: 6px;
    color: var(--rst-ui-muted);
    background: var(--rst-ui-surface-panel);
    transition:
      border-color 120ms ease,
      background 120ms ease,
      opacity 120ms ease;
  }
  .column-chip.is-selected {
    border-color: rgba(var(--rst-ui-action-rgb), .3);
    color: var(--rst-ui-text);
    background: rgba(var(--rst-ui-action-rgb), .035);
  }
  .column-chip.is-dragging { opacity: .45; }
  .column-chip.is-drop-target {
    border-color: var(--rst-ui-action);
    box-shadow: inset 3px 0 0 var(--rst-ui-action);
  }
  :global(.drag-grip) {
    color: var(--rst-ui-muted);
    cursor: grab;
  }
  .column-chip:active :global(.drag-grip) { cursor: grabbing; }
  .column-chip > span {
    overflow: hidden;
    font-size: 10.5px;
    font-weight: var(--rst-fw-bold);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .visibility-button,
  .move-buttons button {
    width: 25px;
    height: 25px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 4px;
    color: var(--rst-ui-muted);
    background: transparent;
    cursor: pointer;
  }
  .column-chip.is-selected .visibility-button { color: var(--rst-ui-action); }
  .visibility-button:hover,
  .move-buttons button:hover:not(:disabled) {
    color: var(--rst-ui-text);
    background: var(--rst-ui-hover-bg);
  }
  .move-buttons {
    display: flex;
  }
  .move-buttons button {
    width: 22px;
  }
  .move-buttons button:disabled {
    opacity: .2;
    cursor: default;
  }
  .preview-block {
    overflow: hidden;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    background: var(--rst-ui-surface-panel);
  }
  .preview-block > header {
    min-height: 46px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 7px 12px;
    border-bottom: 1px solid var(--rst-ui-line);
    background: var(--rst-ui-surface-panel-head);
  }
  .preview-block > header > div {
    display: grid;
    gap: 1px;
  }
  .preview-block > header strong {
    color: var(--rst-ui-text);
    font-size: 12px;
  }
  .preview-block > header span {
    color: var(--rst-ui-muted);
    font-size: 10.5px;
  }
  .filetype {
    padding: 4px 7px;
    border-radius: 4px;
    color: var(--rst-ui-action) !important;
    background: rgba(var(--rst-ui-action-rgb), .1);
    font-weight: var(--rst-fw-bold);
    text-transform: uppercase;
  }
  .preview-scroll {
    min-height: 205px;
    max-height: 270px;
    overflow: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10.5px;
    white-space: nowrap;
  }
  th,
  td {
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
    color: var(--rst-on-dark-text, #fff);
    background: #172033;
    font-weight: var(--rst-fw-bold);
  }
  .preview-block > footer {
    padding: 7px 12px;
    color: var(--rst-ui-muted);
    background: var(--rst-ui-surface-panel-head);
    font-size: 10.5px;
  }
  .no-preview,
  .no-columns {
    min-height: 180px;
    display: grid;
    place-items: center;
    color: var(--rst-ui-muted);
    font-size: 12px;
  }
  .no-columns {
    align-content: center;
    gap: 5px;
  }
  .no-columns strong {
    color: var(--rst-ui-text);
  }
  .no-columns span {
    font-size: 10.5px;
  }
  .wizard-footer {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .wizard-footer > div {
    display: flex;
    gap: 8px;
  }
  .footer-note {
    color: var(--rst-ui-muted);
    font-size: 10.5px;
  }
  .download-button {
    min-height: 38px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 8px 14px;
    border: 1px solid var(--rst-ui-action);
    border-radius: var(--rst-ui-radius-md);
    color: var(--rst-on-accent-text);
    background: var(--rst-ui-action);
    font: inherit;
    font-size: 12.5px;
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
  }
  .download-button:disabled {
    opacity: .5;
    cursor: default;
  }
  @media (max-width: 760px) {
    .export-workspace { min-height: 0; }
    .format-section {
      display: grid;
      align-items: stretch;
    }
    .format-switch {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .format-switch button { min-width: 0; }
    .columns-section > header {
      align-items: flex-start;
    }
    .column-strip { grid-template-columns: minmax(0, 1fr); }
    .move-buttons { display: none; }
    .wizard-footer { justify-content: flex-end; }
    .footer-note { display: none; }
    .wizard-footer > div { width: 100%; }
    .wizard-footer :global(button) { flex: 1; }
  }
</style>
