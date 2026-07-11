<script lang="ts">
  import type { Snippet } from 'svelte';
  import ActionButton from '$lib/components/ActionButton.svelte';
  import Dialog from '$lib/components/Dialog.svelte';

  type Field = { key: string; label: string };
  type Preview = {
    headers: string[];
    rows: Array<Array<string | number | boolean | null>>;
    rowCount?: number;
    loading?: boolean;
    error?: string;
    note?: string;
  };

  let {
    open,
    title,
    description = '',
    formatLabel,
    status = null,
    controls,
    fields,
    columns = $bindable<string[]>([]),
    fieldLabel,
    exporting = false,
    exportLabel = 'Export',
    onexport,
    onclose,
    canSaveDefault = false,
    savingDefault = false,
    onsavedefault,
    preview = null
  }: {
    open: boolean;
    title: string;
    description?: string;
    formatLabel: string;
    status?: { tone: 'info' | 'success' | 'warning'; text: string } | null;
    controls?: Snippet;
    fields: ReadonlyArray<Field>;
    columns?: string[];
    fieldLabel: (key: string) => string;
    exporting?: boolean;
    exportLabel?: string;
    onexport: () => void;
    onclose: () => void;
    canSaveDefault?: boolean;
    savingDefault?: boolean;
    onsavedefault?: () => void;
    preview?: Preview | null;
  } = $props();

  const available = $derived(fields.filter((field) => !columns.includes(field.key)));
  const previewHeaders = $derived(preview?.headers?.length ? preview.headers : columns.map(fieldLabel));
  const previewRows = $derived((preview?.rows ?? []).slice(0, 8));
  const previewCount = $derived(preview?.rowCount ?? preview?.rows.length ?? 0);

  function move(index: number, delta: number) {
    const next = index + delta;
    if (next < 0 || next >= columns.length) return;
    const updated = [...columns];
    [updated[index], updated[next]] = [updated[next], updated[index]];
    columns = updated;
  }

  function remove(key: string) {
    if (columns.length <= 1) return;
    columns = columns.filter((column) => column !== key);
  }

  function add(key: string) {
    if (key && fields.some((field) => field.key === key) && !columns.includes(key)) {
      columns = [...columns, key];
    }
  }
</script>

{#snippet footer()}
  <ActionButton label="Cancel" disabled={exporting} onclick={onclose} />
  <ActionButton
    label={exporting ? 'Exporting…' : exportLabel}
    tone="primary"
    disabled={exporting || !columns.length}
    onclick={onexport}
  />
{/snippet}

<Dialog {open} {title} {description} size="large" {onclose} {footer}>
  <div class="export">
    <div class={preview ? 'export__layout has-preview' : 'export__layout'}>
      {#if preview}
        <div class="export__preview" aria-live="polite">
          <header>
            <div>
              <span class="export__eyebrow">Spreadsheet preview</span>
              <strong>This is what will be exported</strong>
              <small>
                {#if preview.loading}
                  Preparing the export preview…
                {:else if preview.error}
                  Preview unavailable
                {:else}
                  Showing {previewRows.length} of {previewCount} rows in the selected column order.
                {/if}
              </small>
            </div>
            {#if preview.note}<span>{preview.note}</span>{/if}
          </header>

          {#if preview.error}
            <p class="export__preview-error">{preview.error}</p>
          {:else if preview.loading}
            <div class="export__preview-state">
              <span class="spinner" aria-hidden="true"></span>
              <p>Preparing preview…</p>
            </div>
          {:else}
            <div class="export__sheet" role="region" aria-label="Export spreadsheet preview">
              <table>
                <thead>
                  <tr>
                    <th aria-label="Row number"></th>
                    {#each previewHeaders as header, index (`${index}-${header}`)}
                      <th>{header}</th>
                    {/each}
                  </tr>
                </thead>
                <tbody>
                  {#each previewRows as row, rowIndex (rowIndex)}
                    <tr>
                      <th>{rowIndex + 1}</th>
                      {#each previewHeaders as _header, cellIndex (cellIndex)}
                        <td>{row[cellIndex] ?? ''}</td>
                      {/each}
                    </tr>
                  {:else}
                    <tr>
                      <th>1</th>
                      <td colspan={Math.max(previewHeaders.length, 1)}>No rows match this export period yet.</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>
      {/if}

      <div class="export__setup">
        <div class="export__setup-title">
          <span class="export__eyebrow">Export setup</span>
          <strong>Choose the file shape</strong>
          <small>Change columns here and the preview updates to match.</small>
        </div>

        <div class="export__format">
          <span class="export__format-tag">Format</span>
          <strong>{formatLabel}</strong>
          {#if status}<span class="export__status export__status--{status.tone}">{status.text}</span>{/if}
        </div>

        {#if controls}<div class="export__controls">{@render controls()}</div>{/if}

        <div class="export__columns">
          <header>
            <strong>Columns</strong>
            <small>Order left to right is the column order in the file.</small>
          </header>
          <div class="col-chips">
            {#each columns as column, index (column)}
              <div class="col-chip">
                <span class="col-chip__n">{index + 1}</span>
                <span class="col-chip__label">{fieldLabel(column)}</span>
                <div class="col-chip__actions">
                  <button type="button" aria-label="Move left" disabled={index === 0 || exporting} onclick={() => move(index, -1)}>‹</button>
                  <button type="button" aria-label="Move right" disabled={index === columns.length - 1 || exporting} onclick={() => move(index, 1)}>›</button>
                  <button type="button" class="col-chip__remove" aria-label="Remove column" disabled={columns.length <= 1 || exporting} onclick={() => remove(column)}>×</button>
                </div>
              </div>
            {/each}
          </div>
          <div class="export__add">
            {#if available.length}
              <select
                disabled={exporting}
                onchange={(event) => { add(event.currentTarget.value); event.currentTarget.value = ''; }}
              >
                <option value="">Add a column…</option>
                {#each available as field (field.key)}
                  <option value={field.key}>{field.label}</option>
                {/each}
              </select>
            {:else}
              <small>All available columns are in use.</small>
            {/if}
            {#if canSaveDefault && onsavedefault}
              <ActionButton
                label={savingDefault ? 'Saving…' : 'Save as default'}
                disabled={savingDefault || exporting}
                onclick={onsavedefault}
              />
            {/if}
          </div>
        </div>
      </div>
    </div>
  </div>
</Dialog>

<style>
  .export { display: grid; gap: 16px; }
  .export__layout { display: grid; gap: 16px; }
  .export__layout.has-preview {
    grid-template-columns: minmax(0, 1.3fr) minmax(260px, 0.7fr);
    align-items: start;
  }

  .export__setup { min-width: 0; display: grid; gap: 12px; }
  .export__setup-title { display: grid; gap: 2px; padding: 2px 0 0; }
  .export__setup-title strong { font-size: 13px; }
  .export__setup-title small,
  .export__eyebrow { color: var(--rst-ui-muted); font-size: 11px; }
  .export__eyebrow {
    font-weight: var(--rst-fw-bold);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .export__format {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    background: var(--rst-ui-surface-field);
  }

  .export__format-tag {
    color: var(--rst-ui-muted);
    font-size: 10px;
    font-weight: var(--rst-fw-bold);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .export__format strong { font-size: 14px; }
  .export__status {
    margin-left: auto;
    padding: 3px 8px;
    border-radius: var(--rst-ui-radius-sm);
    font-size: 10px;
    font-weight: var(--rst-fw-bold);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .export__status--success { color: var(--rst-ui-text); background: var(--rst-tone-success-soft, rgba(45, 160, 100, 0.18)); }
  .export__status--warning { color: var(--rst-ui-text); background: var(--rst-tone-warning-soft, rgba(210, 150, 40, 0.20)); }
  .export__status--info { color: var(--rst-ui-muted); background: var(--rst-ui-surface-field-strong); }
  .export__controls { display: grid; gap: 12px; }
  .export__columns { display: grid; gap: 8px; }
  .export__columns header { display: grid; gap: 2px; }
  .export__columns header strong { font-size: 12px; }
  .export__columns header small { color: var(--rst-ui-muted); font-size: 11px; }

  .col-chips {
    display: grid;
    gap: 8px;
    max-height: 320px;
    overflow: auto;
    scrollbar-gutter: stable;
  }

  .col-chip {
    min-width: 0;
    width: 100%;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    padding: 6px 6px 6px 8px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-pill);
    background: var(--rst-ui-surface-field);
    box-shadow: 0 1px 3px rgba(31, 22, 15, 0.06);
    animation: rst-pop-in 0.28s var(--rst-ease-spring) backwards;
  }

  .col-chip__n {
    width: 18px;
    height: 18px;
    display: grid;
    place-items: center;
    border-radius: var(--rst-ui-radius-round);
    color: #fff;
    background: var(--rst-ui-action);
    font-size: 10px;
    font-weight: var(--rst-fw-display);
  }

  .col-chip__label {
    min-width: 0;
    overflow: hidden;
    font-size: 12px;
    font-weight: var(--rst-fw-bold);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .col-chip__actions {
    display: inline-flex;
    gap: 2px;
    justify-self: end;
  }

  .col-chip__actions button {
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: var(--rst-ui-radius-round);
    color: var(--rst-ui-muted);
    background: transparent;
    font: inherit;
    font-size: 15px;
    line-height: 1;
    cursor: pointer;
    transition: background-color 0.14s ease, color 0.14s ease;
  }

  .col-chip__actions button:hover:not(:disabled) {
    color: var(--rst-ui-text);
    background: var(--rst-ui-surface-field-strong);
  }

  .col-chip__remove:hover:not(:disabled) {
    color: var(--rst-state-danger-text) !important;
    background: var(--rst-state-danger-bg) !important;
  }

  .col-chip__actions button:disabled { cursor: default; opacity: 0.3; }
  .export__add { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .export__add select {
    min-height: 38px;
    padding: 8px 10px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    color: var(--rst-ui-text);
    background: var(--rst-ui-surface-field-strong);
    font: inherit;
  }
  .export__add small { color: var(--rst-ui-muted); font-size: 11px; }

  .export__preview {
    display: grid;
    gap: 10px;
    padding: 12px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-lg);
    background: var(--rst-ui-surface-field);
  }
  .export__preview header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }
  .export__preview header > div { display: grid; gap: 2px; }
  .export__preview header strong { font-size: 15px; }
  .export__preview header small { color: var(--rst-ui-muted); font-size: 11px; }
  .export__preview header > span {
    flex: 0 0 auto;
    padding: 4px 8px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-pill);
    color: var(--rst-ui-muted);
    background: var(--rst-ui-surface-field-strong);
    font-size: 10px;
    font-weight: var(--rst-fw-bold);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .export__sheet {
    max-height: 460px;
    overflow: auto;
    border: 1px solid var(--rst-ui-divider-soft);
    border-radius: var(--rst-ui-radius-md);
    background: var(--rst-ui-surface-panel);
  }
  table { min-width: 100%; border-collapse: collapse; font-size: 12px; white-space: nowrap; }
  th, td {
    max-width: 220px;
    padding: 8px 10px;
    border: 1px solid var(--rst-ui-divider-soft);
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: left;
  }
  thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    color: var(--rst-ui-muted);
    background: var(--rst-ui-surface-panel-head);
    font-size: 10px;
    font-weight: var(--rst-fw-bold);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  tbody th {
    position: sticky;
    left: 0;
    width: 38px;
    color: var(--rst-ui-muted);
    background: var(--rst-ui-surface-panel-head);
    text-align: right;
  }
  tbody td { color: var(--rst-ui-text); background: var(--rst-ui-surface-panel); }
  tbody tr:nth-child(even) td { background: var(--rst-ui-surface-field); }
  tbody tr:hover td { background: rgba(var(--rst-ui-action-rgb), 0.07); }
  .export__preview-error {
    margin: 0;
    padding: 10px 12px;
    border: 1px solid var(--rst-state-danger-border);
    border-radius: var(--rst-ui-radius-md);
    color: var(--rst-state-danger-text);
    background: var(--rst-state-danger-bg);
    font-size: 12px;
  }
  .export__preview-state {
    min-height: 90px;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 8px;
    color: var(--rst-ui-muted);
    font-size: 12px;
  }
  .export__preview-state p { margin: 0; }

  @media (max-width: 760px) {
    .export__layout.has-preview {
      grid-template-columns: 1fr;
    }

    .export__format,
    .export__add,
    .export__preview header {
      align-items: stretch;
      flex-direction: column;
    }
  }
</style>
