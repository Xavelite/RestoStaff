<script lang="ts">
  import {
    ArrowLeft,
    ArrowRight,
    Check,
    Columns3,
    Download,
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
  let columnPickerOpen = $state(false);
  let columnPickerRoot = $state<HTMLElement | null>(null);

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
    columnPickerOpen = false;
  });

  $effect(() => {
    if (!columnPickerOpen) return;
    const closeOutside = (event: MouseEvent) => {
      if (columnPickerRoot && !columnPickerRoot.contains(event.target as Node)) {
        columnPickerOpen = false;
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') columnPickerOpen = false;
    };
    window.addEventListener('click', closeOutside, true);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('click', closeOutside, true);
      window.removeEventListener('keydown', closeOnEscape);
    };
  });

  function toggleColumn(index: number): void {
    selectedIndexes = selectedIndexes.includes(index)
      ? selectedIndexes.filter((value) => value !== index)
      : [...selectedIndexes, index];
  }

  function moveColumn(index: number, direction: -1 | 1): void {
    const visible = columnOrder.filter((value) => selectedIndexes.includes(value));
    const visiblePosition = visible.indexOf(index);
    const targetIndex = visible[visiblePosition + direction];
    if (visiblePosition < 0 || targetIndex === undefined) return;
    const current = columnOrder.indexOf(index);
    const target = columnOrder.indexOf(targetIndex);
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
              <span class="format-icon is-{option.value}">
                <option.icon size={18} aria-hidden="true" />
              </span>
              <span>{t(option.label)}</span>
              {#if format === option.value}<Check size={13} aria-hidden="true" />{/if}
            </button>
          {/each}
        </div>
      </section>

      <section class="preview-block" aria-labelledby="preview-heading">
        <header>
          <div>
            <strong id="preview-heading">{t('File preview')}</strong>
            <span>
              {projectedFile.headers.length} {t('columns')} ·
              {projectedFile.rows.length} {t('records')} ·
              {t('Drag a header to reorder it.')}
            </span>
          </div>
          <div class="preview-actions">
            <div class="column-picker" class:is-open={columnPickerOpen} bind:this={columnPickerRoot}>
              <button
                class="column-picker__trigger"
                type="button"
                aria-haspopup="menu"
                aria-expanded={columnPickerOpen}
                onclick={() => (columnPickerOpen = !columnPickerOpen)}
              >
                <Columns3 size={14} aria-hidden="true" />
                {t('Columns')} ({selectedIndexes.length}/{file.headers.length})
              </button>
              {#if columnPickerOpen}
                <div class="column-picker__menu" role="menu">
                  {#each columnOrder as index (index)}
                    <label>
                      <input
                        type="checkbox"
                        checked={selectedIndexes.includes(index)}
                        onchange={() => toggleColumn(index)}
                      />
                      <span>{file.headers[index]}</span>
                    </label>
                  {/each}
                </div>
              {/if}
            </div>
            <button class="reset-button" type="button" title={t('Reset columns')} aria-label={t('Reset columns')} onclick={resetColumns}>
              <RotateCcw size={14} aria-hidden="true" />
            </button>
            <span class="filetype is-{format}">.{format}</span>
          </div>
        </header>
        {#if orderedSelection.length}
          <div class="preview-scroll">
            <table>
              <thead>
                <tr>
                  {#each orderedSelection as index, position (index)}
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <th
                      class:is-dragging={draggingIndex === index}
                      class:is-drop-target={dropIndex === index && draggingIndex !== index}
                      draggable="true"
                      ondragstart={(event) => startDrag(event, index)}
                      ondragover={(event) => dragOver(event, index)}
                      ondrop={(event) => finishDrop(event, index)}
                      ondragend={finishDrag}
                    >
                      <span class="preview-column">
                        <GripVertical class="drag-grip" size={14} aria-hidden="true" />
                        <span title={file.headers[index]}>{file.headers[index]}</span>
                        <span class="preview-column__actions">
                          <button
                            type="button"
                            title={t('Move column left')}
                            aria-label={t('Move column left')}
                            disabled={position === 0}
                            onclick={() => moveColumn(index, -1)}
                          ><ArrowLeft size={12} aria-hidden="true" /></button>
                          <button
                            type="button"
                            title={t('Move column right')}
                            aria-label={t('Move column right')}
                            disabled={position === orderedSelection.length - 1}
                            onclick={() => moveColumn(index, 1)}
                          ><ArrowRight size={12} aria-hidden="true" /></button>
                          <button
                            type="button"
                            title={t('Hide column')}
                            aria-label={t('Hide column')}
                            onclick={() => toggleColumn(index)}
                          ><EyeOff size={12} aria-hidden="true" /></button>
                        </span>
                      </span>
                    </th>
                  {/each}
                </tr>
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
  .format-section {
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
    min-width: 104px;
    min-height: 40px;
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
  .format-icon {
    width: 28px;
    height: 28px;
    display: grid;
    flex: 0 0 28px;
    place-items: center;
    border: 1px solid currentcolor;
    border-radius: 5px;
    color: #475569;
    background: color-mix(in srgb, currentcolor 8%, var(--rst-ui-surface-panel));
  }
  .format-icon.is-xlsx { color: #18864b; }
  .format-icon.is-pdf { color: #d13b3b; }
  .format-icon.is-csv { color: #2563a9; }
  .preview-actions {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
  }
  .column-picker {
    position: relative;
  }
  .column-picker__trigger,
  .reset-button {
    min-height: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 5px 8px;
    border: 1px solid var(--rst-ui-line);
    border-radius: 5px;
    color: var(--rst-ui-muted);
    background: var(--rst-ui-surface-panel);
    font: inherit;
    font-size: 10.5px;
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
  }
  .column-picker__trigger:hover,
  .column-picker.is-open .column-picker__trigger,
  .reset-button:hover {
    color: var(--rst-ui-text);
    background: var(--rst-ui-hover-bg);
  }
  .column-picker__menu {
    position: absolute;
    z-index: var(--rst-z-popover, 120);
    top: calc(100% + 6px);
    right: 0;
    width: min(270px, calc(100vw - 32px));
    max-height: 280px;
    overflow: auto;
    display: grid;
    gap: 2px;
    padding: 7px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    background: var(--rst-ui-surface-panel);
    box-shadow: 0 14px 34px rgb(15 23 42 / .16);
  }
  .column-picker label {
    min-height: 32px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 7px;
    border-radius: 4px;
    color: var(--rst-ui-text);
    font-size: 11px;
    cursor: pointer;
  }
  .column-picker label:hover { background: var(--rst-ui-hover-bg); }
  .column-picker label span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .column-picker input { accent-color: var(--rst-ui-action); }
  .reset-button {
    width: 30px;
    padding: 0;
  }
  .filetype {
    min-width: 45px;
    padding: 5px 7px;
    border: 1px solid currentcolor;
    border-radius: 4px;
    color: #2563a9 !important;
    background: color-mix(in srgb, currentcolor 8%, var(--rst-ui-surface-panel));
    font-weight: var(--rst-fw-bold);
    text-align: center;
    text-transform: uppercase;
  }
  .filetype.is-xlsx { color: #18864b !important; }
  .filetype.is-pdf { color: #d13b3b !important; }
  .preview-column {
    min-width: 112px;
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .preview-column > span:nth-child(2) {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .preview-column__actions {
    display: inline-flex;
    opacity: 0;
    transition: opacity 120ms ease;
  }
  th:hover .preview-column__actions,
  th:focus-within .preview-column__actions { opacity: 1; }
  .preview-column__actions button {
    width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 3px;
    color: color-mix(in srgb, var(--rst-on-dark-text, #fff) 68%, transparent);
    background: transparent;
    cursor: pointer;
  }
  .preview-column__actions button:hover:not(:disabled) {
    color: var(--rst-on-dark-text, #fff);
    background: rgb(255 255 255 / .14);
  }
  .preview-column__actions button:disabled {
    opacity: .2;
    cursor: default;
  }
  :global(.drag-grip) {
    flex: 0 0 auto;
    color: color-mix(in srgb, var(--rst-on-dark-text, #fff) 58%, transparent);
    cursor: grab;
  }
  th:active :global(.drag-grip) { cursor: grabbing; }
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
  .preview-block > header > div:first-child {
    min-width: 0;
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
    cursor: grab;
    transition:
      opacity 120ms ease,
      box-shadow 120ms ease,
      background 120ms ease;
  }
  th.is-dragging { opacity: .48; }
  th.is-drop-target {
    background: #233656;
    box-shadow: inset 3px 0 0 #60a5fa;
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
    .format-switch button {
      min-width: 0;
      padding-inline: 5px;
    }
    .preview-block > header {
      align-items: flex-start;
      flex-wrap: wrap;
    }
    .preview-actions {
      width: 100%;
      justify-content: flex-start;
    }
    .preview-column__actions { opacity: 1; }
    .wizard-footer { justify-content: flex-end; }
    .footer-note { display: none; }
    .wizard-footer > div { width: 100%; }
    .wizard-footer :global(button) { flex: 1; }
  }
</style>
