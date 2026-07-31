<script lang="ts">
  import {
    Archive,
    Download,
    FileText,
    History,
    LockKeyhole,
    Save
  } from '@lucide/svelte';
  import Dialog from '$lib/components/Dialog.svelte';
  import { i18n, t } from '$lib/i18n/i18n.svelte';
  import { confirmAction } from '$lib/ui/confirm.svelte';
  import { toasts } from '$lib/ui/toast.svelte';
  import {
    archiveRestaurantDocument,
    downloadRestaurantDocument,
    updateRestaurantDocument
  } from './document-api';
  import {
    DOCUMENT_CATEGORIES,
    categoryLabel,
    documentExpiryState,
    formatBytes,
    type DocumentAccessScope,
    type DocumentCategory,
    type DocumentEmployee,
    type DocumentEvent,
    type RestaurantDocument
  } from './document-model';

  let {
    open,
    restaurantId,
    document,
    events,
    employees,
    owner,
    today,
    onclose,
    onchanged
  }: {
    open: boolean;
    restaurantId: string;
    document: RestaurantDocument | null;
    events: DocumentEvent[];
    employees: DocumentEmployee[];
    owner: boolean;
    today: string;
    onclose: () => void;
    onchanged: () => void | Promise<void>;
  } = $props();

  let title = $state('');
  let category = $state<DocumentCategory>('other');
  let employeeId = $state('');
  let documentDate = $state('');
  let expiresOn = $state('');
  let accessScope = $state<DocumentAccessScope>('management');
  let note = $state('');
  let action = $state<'save' | 'download' | 'archive' | ''>('');
  let loadedId = '';

  const documentEvents = $derived(
    document ? events.filter((event) => event.documentId === document.id) : []
  );
  const archived = $derived(document?.status === 'archived');
  const dateError = $derived(
    documentDate && expiresOn && expiresOn < documentDate
      ? t('Expiry date cannot be before the document date.')
      : ''
  );
  const dirty = $derived(Boolean(document && (
    title.trim() !== document.title
    || category !== document.category
    || (category === 'employee' ? employeeId || null : null) !== document.employeeId
    || (documentDate || null) !== document.documentDate
    || (expiresOn || null) !== document.expiresOn
    || accessScope !== document.accessScope
    || (note.trim() || null) !== document.note
  )));

  $effect(() => {
    if (!document || document.id === loadedId) return;
    loadedId = document.id;
    title = document.title;
    category = document.category;
    employeeId = document.employeeId ?? '';
    documentDate = document.documentDate ?? '';
    expiresOn = document.expiresOn ?? '';
    accessScope = document.accessScope;
    note = document.note ?? '';
  });

  function dateLabel(value: string | null): string {
    if (!value) return t('Not set');
    const date = new Date(value.includes('T') ? value : `${value}T00:00:00Z`);
    return new Intl.DateTimeFormat(i18n.intlLocale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC'
    }).format(date);
  }

  function dateTimeLabel(value: string): string {
    return new Intl.DateTimeFormat(i18n.intlLocale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value));
  }

  function eventLabel(event: DocumentEvent): string {
    if (event.eventType === 'uploaded') return t('Uploaded');
    if (event.eventType === 'metadata_updated') return t('Details updated');
    if (event.eventType === 'downloaded') return t('Downloaded');
    if (event.eventType === 'archived') return t('Archived');
    if (event.eventType === 'upload_cancelled') return t('Upload cancelled');
    return t('Upload reserved');
  }

  async function save() {
    if (!document || archived || !dirty || action || !title.trim() || dateError) return;
    action = 'save';
    try {
      await updateRestaurantDocument(restaurantId, document.id, {
        title,
        category,
        employeeId: category === 'employee' && employeeId ? employeeId : null,
        documentDate: documentDate || null,
        expiresOn: expiresOn || null,
        accessScope,
        note: note.trim() || null
      });
      await onchanged();
      toasts.show(t('Document details saved.'), 'success');
    } catch (error) {
      toasts.show(error instanceof Error ? error.message : String(error), 'danger');
    } finally {
      action = '';
    }
  }

  async function download() {
    if (!document || archived || action) return;
    action = 'download';
    try {
      await downloadRestaurantDocument(restaurantId, document);
      await onchanged();
    } catch (error) {
      toasts.show(error instanceof Error ? error.message : String(error), 'danger');
    } finally {
      action = '';
    }
  }

  async function archive() {
    if (!document || archived || action) return;
    const accepted = await confirmAction({
      title: 'Archive this document?',
      body: 'The stored file will be removed. Its metadata and activity history remain for audit.',
      confirmLabel: 'Archive document',
      tone: 'danger'
    });
    if (!accepted) return;
    action = 'archive';
    try {
      await archiveRestaurantDocument(restaurantId, document);
      await onchanged();
      toasts.show(t('Document archived and file removed.'), 'success');
      onclose();
    } catch (error) {
      toasts.show(error instanceof Error ? error.message : String(error), 'danger');
    } finally {
      action = '';
    }
  }
</script>

<Dialog
  {open}
  title={document?.title ?? 'Document'}
  description={document?.originalFilename ?? ''}
  size="large"
  {onclose}
>
  {#snippet children()}
    {#if document}
      <div class="document-details">
        <section class="file-identity">
          <span class="file-mark"><FileText size={25} strokeWidth={1.6} aria-hidden="true" /></span>
          <div>
            <strong>{document.originalFilename}</strong>
            <span>{formatBytes(document.sizeBytes)} · {document.mimeType}</span>
          </div>
          <span class="document-state is-{document.status}">
            {t(document.status === 'archived' ? 'Archived' : 'Active')}
          </span>
        </section>

        {#if archived}
          <section class="archived-note">
            <Archive size={17} aria-hidden="true" />
            <div>
              <strong>{t('File removed')}</strong>
              <span>{t('The document record and activity history are retained.')}</span>
            </div>
          </section>
        {:else}
          <section class="editor-section">
            <h3>{t('Document details')}</h3>
            <div class="field-grid">
              <label class="is-wide">
                <span>{t('Document title')}</span>
                <input class="cl-field" maxlength="160" bind:value={title} />
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
                <div class="category-summary">
                  <strong>{t(categoryLabel(category))}</strong>
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
                <textarea class="cl-field" rows="3" maxlength="2000" bind:value={note}></textarea>
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
                <LockKeyhole size={15} aria-hidden="true" />
                <span>
                  <strong>{t('Owner only')}</strong>
                  <small>{t('Managers cannot see or download this file.')}</small>
                </span>
              </label>
            {/if}
            {#if dateError}<p class="field-error">{dateError}</p>{/if}
          </section>
        {/if}

        <section class="record-section">
          <h3>{t('Record')}</h3>
          <dl>
            <div><dt>{t('Category')}</dt><dd>{t(categoryLabel(document.category))}</dd></div>
            <div><dt>{t('Linked employee')}</dt><dd>{document.employeeName ?? t('None')}</dd></div>
            <div><dt>{t('Document date')}</dt><dd>{dateLabel(document.documentDate)}</dd></div>
            <div>
              <dt>{t('Expiry')}</dt>
              <dd class:is-warning={documentExpiryState(document.expiresOn, today) === 'soon'} class:is-danger={documentExpiryState(document.expiresOn, today) === 'expired'}>
                {dateLabel(document.expiresOn)}
              </dd>
            </div>
            <div><dt>{t('Access')}</dt><dd>{t(document.accessScope === 'owner' ? 'Owner only' : 'Owner and managers')}</dd></div>
            <div><dt>{t('Uploaded by')}</dt><dd>{document.uploaderName ?? t('Unknown')}</dd></div>
          </dl>
        </section>

        <section class="activity-section">
          <h3><History size={15} aria-hidden="true" />{t('Activity')}</h3>
          {#if documentEvents.length}
            <ol>
              {#each documentEvents as event (event.id)}
                <li>
                  <i></i>
                  <div>
                    <strong>{eventLabel(event)}</strong>
                    <span>{event.actorName ?? t('System')} · {dateTimeLabel(event.occurredAt)}</span>
                  </div>
                </li>
              {/each}
            </ol>
          {:else}
            <p>{t('No activity recorded yet.')}</p>
          {/if}
        </section>
      </div>
    {/if}
  {/snippet}

  {#snippet footer()}
    {#if document && !archived}
      <button class="dialog-button is-danger" type="button" disabled={Boolean(action)} onclick={archive}>
        <Archive size={15} aria-hidden="true" />{t(action === 'archive' ? 'Archiving...' : 'Archive')}
      </button>
      <span class="action-spacer"></span>
      <button class="dialog-button" type="button" disabled={Boolean(action)} onclick={download}>
        <Download size={15} aria-hidden="true" />{t(action === 'download' ? 'Preparing...' : 'Download')}
      </button>
      <button class="dialog-button is-primary" type="button" disabled={!dirty || Boolean(action) || !title.trim() || Boolean(dateError)} onclick={save}>
        <Save size={15} aria-hidden="true" />{t(action === 'save' ? 'Saving...' : 'Save changes')}
      </button>
    {/if}
  {/snippet}
</Dialog>

<style>
  .document-details { display: grid; gap: 22px; }
  section { min-width: 0; }
  .file-identity {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 11px;
    padding-bottom: 17px;
    border-bottom: 1px solid var(--rst-ui-divider-soft);
  }
  .file-mark {
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border-radius: 8px;
    color: var(--rst-ui-action);
    background: rgba(var(--rst-ui-action-rgb), .1);
  }
  .file-identity > div { min-width: 0; display: grid; gap: 4px; }
  .file-identity strong,
  .file-identity span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .file-identity strong { font-size: var(--rst-fs-control); }
  .file-identity > div span { color: var(--rst-ui-muted); font-size: var(--rst-fs-micro); }
  .document-state {
    padding: 4px 7px;
    border-radius: 4px;
    color: var(--rst-state-success-text);
    background: var(--rst-state-success-bg);
    font-size: var(--rst-fs-micro);
    font-weight: var(--rst-fw-bold);
  }
  .document-state.is-archived { color: var(--rst-ui-muted); background: var(--rst-ui-surface-field); }
  h3 {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 0 11px;
    color: var(--rst-ui-text);
    font-size: var(--rst-fs-label);
    text-transform: uppercase;
  }
  .field-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 11px;
  }
  label { min-width: 0; display: grid; gap: 6px; }
  label > span:first-child { font-size: var(--rst-fs-caption); font-weight: var(--rst-fw-bold); }
  label small { color: var(--rst-ui-muted); font-size: var(--rst-fs-micro); font-weight: var(--rst-fw-medium); }
  .is-wide { grid-column: 1 / -1; }
  textarea { resize: vertical; }
  .category-summary {
    display: grid;
    align-content: center;
    gap: 3px;
    padding: 8px 10px;
    border-left: 2px solid var(--rst-ui-action);
    background: var(--rst-ui-surface-field);
  }
  .category-summary strong { font-size: var(--rst-fs-caption); }
  .category-summary span { color: var(--rst-ui-muted); font-size: var(--rst-fs-micro); line-height: 1.4; }
  .access-toggle {
    grid-template-columns: auto auto auto minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    margin-top: 12px;
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
  .access-toggle > span:last-child { display: grid; gap: 2px; }
  .access-toggle strong { font-size: var(--rst-fs-caption); }
  .access-toggle small { font-size: var(--rst-fs-micro); }
  .field-error { margin: 8px 0 0; color: var(--rst-state-danger-text); font-size: var(--rst-fs-caption); }
  .record-section dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 0; border-top: 1px solid var(--rst-ui-divider-soft); }
  .record-section dl > div { min-width: 0; display: grid; gap: 4px; padding: 10px 0; border-bottom: 1px solid var(--rst-ui-divider-soft); }
  .record-section dl > div:nth-child(odd) { padding-right: 14px; }
  dt { color: var(--rst-ui-muted); font-size: var(--rst-fs-micro); }
  dd { min-width: 0; margin: 0; overflow: hidden; color: var(--rst-ui-text); font-size: var(--rst-fs-caption); text-overflow: ellipsis; white-space: nowrap; }
  dd.is-warning { color: var(--rst-state-warning-text); }
  dd.is-danger { color: var(--rst-state-danger-text); }
  .activity-section ol { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; }
  .activity-section li { position: relative; display: grid; grid-template-columns: 12px minmax(0, 1fr); gap: 9px; padding-bottom: 13px; }
  .activity-section li:not(:last-child)::before { content: ''; position: absolute; top: 8px; bottom: -1px; left: 3px; width: 1px; background: var(--rst-ui-divider-soft); }
  .activity-section li > i { position: relative; z-index: 1; width: 7px; height: 7px; margin-top: 3px; border-radius: 50%; background: var(--rst-ui-action); }
  .activity-section li > div { display: grid; gap: 3px; }
  .activity-section li strong { font-size: var(--rst-fs-caption); }
  .activity-section li span,
  .activity-section > p { margin: 0; color: var(--rst-ui-muted); font-size: var(--rst-fs-micro); }
  .archived-note {
    display: flex;
    gap: 10px;
    padding: 11px 12px;
    color: var(--rst-ui-muted);
    background: var(--rst-ui-surface-field);
  }
  .archived-note div { display: grid; gap: 3px; }
  .archived-note strong { color: var(--rst-ui-text); font-size: var(--rst-fs-caption); }
  .archived-note span { font-size: var(--rst-fs-micro); }
  :global(.dialog-button) {
    min-height: 36px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 11px;
    border: 1px solid var(--rst-ui-line);
    border-radius: 6px;
    color: var(--rst-ui-text);
    background: var(--rst-ui-surface-field-strong);
    font: inherit;
    font-size: var(--rst-fs-caption);
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
  }
  :global(.dialog-button.is-primary) { color: var(--rst-on-accent-text); border-color: var(--rst-ui-action); background: var(--rst-ui-action); }
  :global(.dialog-button.is-danger) { color: var(--rst-state-danger-text); border-color: var(--rst-state-danger-border); background: var(--rst-state-danger-bg); }
  :global(.dialog-button:disabled) { opacity: .5; cursor: default; }
  :global(.action-spacer) { flex: 1; }
  @media (max-width: 520px) {
    .field-grid,
    .record-section dl { grid-template-columns: 1fr; }
    .is-wide { grid-column: auto; }
    .record-section dl > div:nth-child(odd) { padding-right: 0; }
  }
</style>
