<script lang="ts">
  import { FileText, LockKeyhole, UploadCloud, X } from '@lucide/svelte';
  import ActionButton from '$lib/components/ActionButton.svelte';
  import Dialog from '$lib/components/Dialog.svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import { toasts } from '$lib/ui/toast.svelte';
  import { uploadRestaurantDocument } from './document-api';
  import {
    DOCUMENT_ACCEPT,
    DOCUMENT_CATEGORIES,
    formatBytes,
    titleFromFilename,
    validateDocumentFile,
    type DocumentAccessScope,
    type DocumentCategory,
    type DocumentEmployee,
    type DocumentQuota
  } from './document-model';

  let {
    open,
    restaurantId,
    employees,
    quota,
    owner,
    onclose,
    onuploaded
  }: {
    open: boolean;
    restaurantId: string;
    employees: DocumentEmployee[];
    quota: DocumentQuota;
    owner: boolean;
    onclose: () => void;
    onuploaded: () => void | Promise<void>;
  } = $props();

  let fileInput = $state<HTMLInputElement>();
  let file = $state<File | null>(null);
  let title = $state('');
  let category = $state<DocumentCategory>('employee');
  let employeeId = $state('');
  let documentDate = $state('');
  let expiresOn = $state('');
  let accessScope = $state<DocumentAccessScope>('management');
  let note = $state('');
  let saving = $state(false);
  let dragActive = $state(false);
  let opened = false;

  const remainingBytes = $derived(Math.max(0, quota.totalLimitBytes - quota.usedBytes));
  const fileError = $derived(file
    ? validateDocumentFile(file, quota.maxFileBytes, remainingBytes)
    : null);
  const dateError = $derived(
    documentDate && expiresOn && expiresOn < documentDate
      ? t('Expiry date cannot be before the document date.')
      : ''
  );
  const canUpload = $derived(Boolean(
    file
    && !fileError
    && !dateError
    && title.trim()
    && !saving
    && restaurantId
  ));

  $effect(() => {
    if (open && !opened) reset();
    opened = open;
  });

  function reset() {
    file = null;
    title = '';
    category = 'employee';
    employeeId = '';
    documentDate = '';
    expiresOn = '';
    accessScope = 'management';
    note = '';
    dragActive = false;
    if (fileInput) fileInput.value = '';
  }

  function choose(nextFile: File | null) {
    file = nextFile;
    if (nextFile && !title.trim()) title = titleFromFilename(nextFile.name);
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    dragActive = false;
    choose(event.dataTransfer?.files[0] ?? null);
  }

  function removeFile() {
    choose(null);
    if (fileInput) fileInput.value = '';
  }

  function close() {
    if (!saving) onclose();
  }

  async function upload() {
    if (!canUpload || !file) return;
    saving = true;
    try {
      await uploadRestaurantDocument({
        restaurantId,
        file,
        title,
        category,
        employeeId: category === 'employee' && employeeId ? employeeId : null,
        documentDate: documentDate || null,
        expiresOn: expiresOn || null,
        accessScope,
        note: note.trim() || null,
        maxFileBytes: quota.maxFileBytes,
        remainingBytes
      });
      await onuploaded();
      toasts.show(t('Document uploaded securely.'), 'success');
      onclose();
    } catch (error) {
      toasts.show(error instanceof Error ? error.message : String(error), 'danger');
    } finally {
      saving = false;
    }
  }
</script>

<Dialog
  {open}
  title="Upload document"
  description="Add one private file and its useful restaurant context."
  size="large"
  onclose={close}
>
  <div class="upload-layout">
    <section class="file-step">
      <div
        class="drop-zone"
        class:is-active={dragActive}
        class:has-file={Boolean(file)}
        role="button"
        tabindex="0"
        aria-label={t('Choose a document')}
        ondragover={(event) => {
          event.preventDefault();
          dragActive = true;
        }}
        ondragleave={() => (dragActive = false)}
        ondrop={handleDrop}
        onkeydown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') fileInput?.click();
        }}
        onclick={() => !file && fileInput?.click()}
      >
        {#if file}
          <span class="file-icon"><FileText size={23} strokeWidth={1.7} aria-hidden="true" /></span>
          <div class="file-copy">
            <strong>{file.name}</strong>
            <span>{formatBytes(file.size)} · {file.type}</span>
          </div>
          <button
            type="button"
            title={t('Remove selected file')}
            aria-label={t('Remove selected file')}
            onclick={(event) => {
              event.stopPropagation();
              removeFile();
            }}
          ><X size={17} aria-hidden="true" /></button>
        {:else}
          <span class="upload-icon"><UploadCloud size={27} strokeWidth={1.6} aria-hidden="true" /></span>
          <strong>{t('Drop a file here')}</strong>
          <span>{t('or choose from this device')}</span>
        {/if}
      </div>
      <input
        class="file-input"
        bind:this={fileInput}
        type="file"
        accept={DOCUMENT_ACCEPT}
        onchange={(event) => choose(event.currentTarget.files?.[0] ?? null)}
      />
      <div class="limits">
        <span>{t('PDF, Word, Excel, CSV, text or image')}</span>
        <strong>{t('{limit} per file', { limit: formatBytes(quota.maxFileBytes) })}</strong>
      </div>
      {#if fileError}<p class="field-error">{t(fileError)}</p>{/if}
    </section>

    <section class="details-step">
      <div class="field-grid">
        <label class="is-wide">
          <span>{t('Document title')}</span>
          <input class="cl-field" maxlength="160" bind:value={title} placeholder={t('What should the team find this as?')} />
        </label>
        <label>
          <span>{t('Category')}</span>
          <select class="cl-field" bind:value={category}>
            {#each DOCUMENT_CATEGORIES as item (item.key)}
              <option value={item.key}>{t(item.label)}</option>
            {/each}
          </select>
        </label>
        {#if category === 'employee'}
          <label>
            <span>{t('Employee')} <small>{t('optional')}</small></span>
            <select class="cl-field" bind:value={employeeId}>
              <option value="">{t('No employee linked')}</option>
              {#each employees as employee (employee.id)}
                <option value={employee.id}>{employee.name}{employee.active ? '' : ` · ${t('Archived')}`}</option>
              {/each}
            </select>
          </label>
        {:else}
          <div class="category-note">
            <strong>{t(DOCUMENT_CATEGORIES.find((item) => item.key === category)?.label ?? 'Other')}</strong>
            <span>{t(DOCUMENT_CATEGORIES.find((item) => item.key === category)?.description ?? '')}</span>
          </div>
        {/if}
        <label>
          <span>{t('Document date')} <small>{t('optional')}</small></span>
          <input class="cl-field" type="date" bind:value={documentDate} />
        </label>
        <label>
          <span>{t('Expiry date')} <small>{t('optional')}</small></span>
          <input class="cl-field" type="date" min={documentDate || undefined} bind:value={expiresOn} />
        </label>
        <label class="is-wide">
          <span>{t('Internal note')} <small>{t('optional')}</small></span>
          <textarea class="cl-field" rows="3" maxlength="2000" bind:value={note} placeholder={t('Renewal details, reference number or useful context')}></textarea>
        </label>
      </div>
      {#if owner}
        <label class="access-toggle">
          <input
            type="checkbox"
            checked={accessScope === 'owner'}
            onchange={(event) => (accessScope = event.currentTarget.checked ? 'owner' : 'management')}
          />
          <span class="toggle-track"><i></i></span>
          <span class="access-icon"><LockKeyhole size={16} aria-hidden="true" /></span>
          <span>
            <strong>{t('Owner only')}</strong>
            <small>{t('Hide this file from managers.')}</small>
          </span>
        </label>
      {/if}
      {#if dateError}<p class="field-error">{dateError}</p>{/if}
    </section>
  </div>

  {#snippet footer()}
    <span class="storage-left">{formatBytes(remainingBytes)} {t('available')}</span>
    <ActionButton label="Cancel" disabled={saving} onclick={close} />
    <ActionButton label={saving ? 'Uploading...' : 'Upload document'} tone="primary" disabled={!canUpload} onclick={upload} />
  {/snippet}
</Dialog>

<style>
  .upload-layout {
    display: grid;
    grid-template-columns: minmax(250px, .72fr) minmax(0, 1.28fr);
    gap: 22px;
  }
  .file-step,
  .details-step { min-width: 0; display: grid; align-content: start; gap: 12px; }
  .drop-zone {
    min-height: 184px;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 7px;
    padding: 24px;
    border: 1px dashed var(--rst-ui-line-strong);
    border-radius: var(--rst-ui-radius-lg);
    color: var(--rst-ui-muted);
    background: var(--rst-ui-surface-field);
    text-align: center;
    cursor: pointer;
    transition: border-color .16s ease, background .16s ease;
  }
  .drop-zone:hover,
  .drop-zone.is-active {
    border-color: var(--rst-ui-action);
    background: rgba(var(--rst-ui-action-rgb), .05);
  }
  .drop-zone.has-file {
    min-height: 104px;
    grid-template-columns: auto minmax(0, 1fr) auto;
    place-items: center start;
    text-align: left;
    cursor: default;
  }
  .upload-icon,
  .file-icon {
    width: 48px;
    height: 48px;
    display: grid;
    place-items: center;
    border-radius: 8px;
    color: var(--rst-ui-action);
    background: rgba(var(--rst-ui-action-rgb), .1);
  }
  .file-icon { width: 40px; height: 40px; }
  .drop-zone > strong { color: var(--rst-ui-text); font-size: 13px; }
  .drop-zone > span:not(.upload-icon):not(.file-icon) { font-size: 11px; }
  .file-copy { min-width: 0; display: grid; gap: 4px; }
  .file-copy strong,
  .file-copy span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .file-copy strong { color: var(--rst-ui-text); font-size: 12px; }
  .file-copy span { font-size: 10px; }
  .drop-zone button {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 6px;
    color: var(--rst-ui-muted);
    background: transparent;
    cursor: pointer;
  }
  .drop-zone button:hover { color: var(--rst-ui-text); background: var(--rst-ui-hover-bg); }
  .file-input { position: absolute; width: 1px; height: 1px; overflow: hidden; opacity: 0; pointer-events: none; }
  .limits {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    color: var(--rst-ui-muted);
    font-size: 10px;
  }
  .limits strong { color: var(--rst-ui-text-soft); }
  .field-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  label { min-width: 0; display: grid; gap: 6px; }
  label > span:first-child { font-size: 11px; font-weight: var(--rst-fw-bold); }
  label small { color: var(--rst-ui-muted); font-size: 9px; font-weight: var(--rst-fw-medium); }
  .is-wide { grid-column: 1 / -1; }
  textarea { resize: vertical; }
  .category-note {
    min-width: 0;
    display: grid;
    align-content: center;
    gap: 3px;
    padding: 8px 10px;
    border-left: 2px solid var(--rst-ui-action);
    color: var(--rst-ui-muted);
    background: var(--rst-ui-surface-field);
  }
  .category-note strong { color: var(--rst-ui-text); font-size: 11px; }
  .category-note span { font-size: 10px; line-height: 1.4; }
  .access-toggle {
    grid-template-columns: auto auto auto minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    padding-top: 2px;
    cursor: pointer;
  }
  .access-toggle > input { position: absolute; opacity: 0; pointer-events: none; }
  .toggle-track {
    width: 34px;
    height: 19px;
    display: flex;
    align-items: center;
    padding: 2px;
    border-radius: 10px;
    background: var(--rst-ui-line-strong);
    transition: background .16s ease;
  }
  .toggle-track i {
    width: 15px;
    height: 15px;
    display: block;
    border-radius: 50%;
    background: #fff;
    transition: transform .16s ease;
  }
  .access-toggle > input:checked + .toggle-track { background: var(--rst-ui-action); }
  .access-toggle > input:checked + .toggle-track i { transform: translateX(15px); }
  .access-icon { color: var(--rst-ui-muted); }
  .access-toggle > span:last-child { display: grid; gap: 2px; }
  .access-toggle strong { font-size: 11px; }
  .access-toggle small { font-size: 9px; }
  .field-error { margin: 0; color: var(--rst-state-danger-text); font-size: 10px; }
  :global(dialog footer .storage-left) {
    margin-right: auto;
    color: var(--rst-ui-muted);
    font-size: 10px;
  }
  @media (max-width: 760px) {
    .upload-layout { grid-template-columns: 1fr; }
    .drop-zone { min-height: 124px; }
  }
  @media (max-width: 520px) {
    .field-grid { grid-template-columns: 1fr; }
    .is-wide { grid-column: auto; }
    .limits { display: grid; gap: 3px; }
    :global(dialog footer .storage-left) { width: 100%; }
  }
</style>
