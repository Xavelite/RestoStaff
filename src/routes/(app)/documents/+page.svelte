<script lang="ts">
  import {
    Archive,
    ChevronRight,
    ClipboardList,
    Download,
    FileClock,
    FileText,
    Folder,
    FolderOpen,
    HardDrive,
    LockKeyhole,
    Plus,
    ReceiptText,
    RefreshCw,
    Scale,
    Search,
    ShieldCheck,
    Truck,
    Umbrella,
    Upload,
    UsersRound
  } from '@lucide/svelte';
  import WorkspacePage from '$lib/workspace-ui/WorkspacePage.svelte';
  import Dialog from '$lib/components/Dialog.svelte';
  import ActionButton from '$lib/components/ActionButton.svelte';
  import DocumentDetailsDialog from '$lib/documents/DocumentDetailsDialog.svelte';
  import DocumentUploadDialog from '$lib/documents/DocumentUploadDialog.svelte';
  import {
    downloadRestaurantDocument,
    getDocumentWorkspace
  } from '$lib/documents/document-api';
  import {
    DOCUMENT_CATEGORIES,
    categoryLabel,
    documentExpiryState,
    formatBytes,
    quotaPercent,
    type DocumentCategory,
    type DocumentWorkspace,
    type RestaurantDocument
  } from '$lib/documents/document-model';
  import { submitPilotFeedback } from '$lib/feedback/feedback-api';
  import { i18n, t } from '$lib/i18n/i18n.svelte';
  import { todayInTimezone } from '$lib/calendar/date';
  import { toasts } from '$lib/ui/toast.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';

  type CategoryFilter = DocumentCategory | 'all';
  type StatusFilter = 'active' | 'expiring' | 'archived';

  const CATEGORY_ICONS = {
    employee: UsersRound,
    compliance: ShieldCheck,
    legal: Scale,
    insurance: Umbrella,
    finance: ReceiptText,
    supplier: Truck,
    operations: ClipboardList,
    other: Folder
  };

  let snapshot = $state<DocumentWorkspace | null>(null);
  let loading = $state(true);
  let errorMessage = $state('');
  let search = $state('');
  let categoryFilter = $state<CategoryFilter>('all');
  let statusFilter = $state<StatusFilter>('active');
  let uploadOpen = $state(false);
  let selectedId = $state('');
  let downloadingId = $state('');
  let upgradeOpen = $state(false);
  let upgradeSize = $state('2 GB');
  let upgradeNote = $state('');
  let requestingUpgrade = $state(false);
  let requestId = 0;

  const restaurantId = $derived(workspace.activeId ?? '');
  const owner = $derived(workspace.effectiveRole === 'owner');
  const timezone = $derived(workspace.bootstrap?.restaurant_settings.timezone || 'Europe/Brussels');
  const today = $derived(todayInTimezone(timezone));
  const documents = $derived(snapshot?.documents ?? []);
  const activeDocuments = $derived(documents.filter((document) => document.status === 'ready'));
  const expiringDocuments = $derived(activeDocuments.filter((document) => {
    const state = documentExpiryState(document.expiresOn, today);
    return state === 'soon' || state === 'expired';
  }));
  const archivedDocuments = $derived(documents.filter((document) => document.status === 'archived'));
  const ownerOnlyCount = $derived(activeDocuments.filter((document) => document.accessScope === 'owner').length);
  const storageFull = $derived(Boolean(
    snapshot && snapshot.quota.usedBytes >= snapshot.quota.totalLimitBytes
  ));
  const selectedDocument = $derived(
    documents.find((document) => document.id === selectedId) ?? null
  );
  const filteredDocuments = $derived.by(() => {
    const query = search.trim().toLocaleLowerCase(i18n.intlLocale);
    return documents
      .filter((document) => {
        if (statusFilter === 'archived') return document.status === 'archived';
        if (document.status !== 'ready') return false;
        if (statusFilter === 'expiring') {
          const state = documentExpiryState(document.expiresOn, today);
          if (state !== 'soon' && state !== 'expired') return false;
        }
        return true;
      })
      .filter((document) => categoryFilter === 'all' || document.category === categoryFilter)
      .filter((document) => !query || [
        document.title,
        document.originalFilename,
        document.employeeName ?? '',
        categoryLabel(document.category),
        document.note ?? ''
      ].some((value) => value.toLocaleLowerCase(i18n.intlLocale).includes(query)))
      .sort((left, right) => {
        const leftExpiry = left.expiresOn ?? '9999-12-31';
        const rightExpiry = right.expiresOn ?? '9999-12-31';
        if (statusFilter === 'expiring' && leftExpiry !== rightExpiry) {
          return leftExpiry.localeCompare(rightExpiry);
        }
        return right.createdAt.localeCompare(left.createdAt);
      });
  });

  $effect(() => {
    const activeRestaurantId = restaurantId;
    if (!activeRestaurantId) {
      snapshot = null;
      loading = false;
      return;
    }
    void load(activeRestaurantId);
  });

  async function load(activeRestaurantId = restaurantId) {
    if (!activeRestaurantId) return;
    const currentRequest = ++requestId;
    loading = true;
    errorMessage = '';
    try {
      const next = await getDocumentWorkspace(activeRestaurantId);
      if (currentRequest !== requestId) return;
      snapshot = next;
    } catch (error) {
      if (currentRequest !== requestId) return;
      snapshot = null;
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      if (currentRequest === requestId) loading = false;
    }
  }

  function categoryCount(category: CategoryFilter): number {
    return activeDocuments.filter((document) => category === 'all' || document.category === category).length;
  }

  function dateLabel(value: string | null): string {
    if (!value) return t('No expiry');
    return new Intl.DateTimeFormat(i18n.intlLocale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC'
    }).format(new Date(`${value}T00:00:00Z`));
  }

  function uploadedLabel(value: string): string {
    return new Intl.DateTimeFormat(i18n.intlLocale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }).format(new Date(value));
  }

  async function download(document: RestaurantDocument) {
    if (downloadingId || document.status !== 'ready') return;
    downloadingId = document.id;
    try {
      await downloadRestaurantDocument(restaurantId, document);
      await load();
    } catch (error) {
      toasts.show(error instanceof Error ? error.message : String(error), 'danger');
    } finally {
      downloadingId = '';
    }
  }

  async function requestUpgrade() {
    if (!restaurantId || requestingUpgrade) return;
    requestingUpgrade = true;
    try {
      await submitPilotFeedback({
        restaurantId,
        category: 'suggestion',
        message: `Document storage upgrade requested: ${upgradeSize}.${upgradeNote.trim() ? ` Context: ${upgradeNote.trim()}` : ''}`,
        pagePath: '/documents?storage-upgrade',
        actorRole: workspace.effectiveRole,
        locale: i18n.locale
      });
      upgradeOpen = false;
      upgradeNote = '';
      toasts.show(t('Storage upgrade request sent. We will confirm pricing before changing the limit.'), 'success');
    } catch (error) {
      toasts.show(error instanceof Error ? error.message : String(error), 'danger');
    } finally {
      requestingUpgrade = false;
    }
  }
</script>

<svelte:head><title>{t('Documents')} &middot; restogogo</title></svelte:head>

<WorkspacePage>
  {#if snapshot}
    <section class="document-overview" aria-label={t('Document storage overview')}>
      <div class="storage-summary">
        <span class="overview-icon"><HardDrive size={19} strokeWidth={1.7} aria-hidden="true" /></span>
        <div class="storage-copy">
          <span>{t('Storage used')}</span>
          <strong>{formatBytes(snapshot.quota.usedBytes)} <small>/ {formatBytes(snapshot.quota.totalLimitBytes)}</small></strong>
        </div>
        <div
          class="storage-meter"
          role="progressbar"
          aria-label={t('Document storage used')}
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={Math.round(quotaPercent(snapshot.quota))}
        ><i style={`width:${quotaPercent(snapshot.quota)}%`}></i></div>
        <div class="plan-copy">
          <strong>{t(snapshot.quota.planCode === 'included' ? 'Included storage' : 'Expanded storage')}</strong>
          <span>{formatBytes(Math.max(0, snapshot.quota.totalLimitBytes - snapshot.quota.usedBytes))} {t('available')}</span>
        </div>
        <button
          class="upgrade-button"
          type="button"
          title={t('Request more storage')}
          disabled={workspace.isPreview}
          onclick={() => (upgradeOpen = true)}
        >
          {t('Request more storage')}<Plus size={14} aria-hidden="true" />
        </button>
      </div>

      <div class="document-stats">
        <div><FileText size={16} aria-hidden="true" /><span>{t('Active files')}</span><strong>{activeDocuments.length}</strong></div>
        <div class:has-attention={expiringDocuments.length > 0}><FileClock size={16} aria-hidden="true" /><span>{t('Expiry attention')}</span><strong>{expiringDocuments.length}</strong></div>
        <div><LockKeyhole size={16} aria-hidden="true" /><span>{t('Owner only')}</span><strong>{ownerOnlyCount}</strong></div>
        <div><Archive size={16} aria-hidden="true" /><span>{t('Archived records')}</span><strong>{archivedDocuments.length}</strong></div>
      </div>
    </section>
  {/if}

  <section class="library-toolbar" aria-label={t('Document controls')}>
    <label class="search-field">
      <Search size={15} aria-hidden="true" />
      <input bind:value={search} placeholder={t('Search title, filename, employee or note')} aria-label={t('Search documents')} />
    </label>
    <label class="mobile-category">
      <span class="sr-only">{t('Category')}</span>
      <select class="cl-field" bind:value={categoryFilter}>
        <option value="all">{t('All categories')}</option>
        {#each DOCUMENT_CATEGORIES as item (item.key)}
          <option value={item.key}>{t(item.label)}</option>
        {/each}
      </select>
    </label>
    <div class="status-switch" aria-label={t('Document status')}>
      {#each [
        ['active', 'Active'],
        ['expiring', 'Expiring'],
        ['archived', 'Archived']
      ] as option}
        <button type="button" class:is-active={statusFilter === option[0]} onclick={() => (statusFilter = option[0] as StatusFilter)}>
          {t(option[1])}
          {#if option[0] === 'expiring' && expiringDocuments.length}<i>{expiringDocuments.length}</i>{/if}
        </button>
      {/each}
    </div>
    <button
      class="upload-button"
      type="button"
      disabled={!snapshot || storageFull || workspace.isPreview}
      title={storageFull ? t('Storage is full. Request more space to upload.') : t('Upload document')}
      onclick={() => (uploadOpen = true)}
    ><Upload size={15} strokeWidth={1.9} aria-hidden="true" />{t('Upload')}</button>
  </section>

  {#if errorMessage}
    <section class="load-state is-error">
      <FolderOpen size={25} aria-hidden="true" />
      <strong>{t('Documents are unavailable')}</strong>
      <span>{errorMessage}</span>
      <button type="button" onclick={() => load()}><RefreshCw size={14} aria-hidden="true" />{t('Try again')}</button>
    </section>
  {:else if loading && !snapshot}
    <section class="load-state">
      <RefreshCw class="spin" size={24} aria-hidden="true" />
      <strong>{t('Loading documents...')}</strong>
    </section>
  {:else if snapshot}
    <div class="library-layout">
      <aside class="category-rail" aria-label={t('Document categories')}>
        <button type="button" class:is-active={categoryFilter === 'all'} onclick={() => (categoryFilter = 'all')}>
          <span class="category-icon"><FolderOpen size={15} aria-hidden="true" /></span>
          <span><strong>{t('All files')}</strong><small>{t('Every active document')}</small></span>
          <i>{categoryCount('all')}</i>
        </button>
        {#each DOCUMENT_CATEGORIES as item (item.key)}
          {@const CategoryIcon = CATEGORY_ICONS[item.key]}
          <button type="button" class:is-active={categoryFilter === item.key} onclick={() => (categoryFilter = item.key)}>
            <span class="category-icon"><CategoryIcon size={15} aria-hidden="true" /></span>
            <span><strong>{t(item.label)}</strong><small>{t(item.description)}</small></span>
            <i>{categoryCount(item.key)}</i>
          </button>
        {/each}
      </aside>

      <section class="document-list" aria-label={t('Document library')}>
        <header>
          <div>
            <strong>{categoryFilter === 'all' ? t('All files') : t(categoryLabel(categoryFilter))}</strong>
            <span>{t('{count} documents in this view', { count: filteredDocuments.length })}</span>
          </div>
          {#if search || categoryFilter !== 'all'}
            <button type="button" onclick={() => {
              search = '';
              categoryFilter = 'all';
            }}>{t('Clear filters')}</button>
          {/if}
        </header>

        {#if filteredDocuments.length}
          <div class="cl-tablewrap">
            <table class="cl-table cl-mobile-rows">
              <thead>
                <tr>
                  <th>{t('Document')}</th>
                  <th>{t('Category')}</th>
                  <th>{t('Employee')}</th>
                  <th>{t('Expiry')}</th>
                  <th>{t('Access')}</th>
                  <th class="is-num">{t('Size')}</th>
                  <th>{t('Uploaded')}</th>
                  <th aria-label={t('Actions')}></th>
                </tr>
              </thead>
              <tbody>
                {#each filteredDocuments as document (document.id)}
                  {@const expiryState = documentExpiryState(document.expiresOn, today)}
                  <tr class:is-archived={document.status === 'archived'} onclick={() => (selectedId = document.id)}>
                    <td class="cl-mobile-primary document-cell">
                      <span class="file-type"><FileText size={17} strokeWidth={1.7} aria-hidden="true" /></span>
                      <span>
                        <strong>{document.title}</strong>
                        <small>{document.originalFilename}</small>
                        <span class="mobile-document-meta">
                          <span class="category-pill is-{document.category}">{t(categoryLabel(document.category))}</span>
                          {#if document.status === 'archived'}
                            <span class="date-state">{t('Archived')}</span>
                          {:else if expiryState === 'expired'}
                            <span class="date-state is-danger">{t('Expired')} &middot; {dateLabel(document.expiresOn)}</span>
                          {:else if expiryState === 'soon'}
                            <span class="date-state is-warning">{t('Due soon')} &middot; {dateLabel(document.expiresOn)}</span>
                          {/if}
                        </span>
                      </span>
                    </td>
                    <td><span class="category-pill is-{document.category}">{t(categoryLabel(document.category))}</span></td>
                    <td>{document.employeeName ?? t('None')}</td>
                    <td>
                      {#if document.status === 'archived'}
                        <span class="date-state">{t('Archived')}</span>
                      {:else if expiryState === 'expired'}
                        <span class="date-state is-danger">{t('Expired')} · {dateLabel(document.expiresOn)}</span>
                      {:else if expiryState === 'soon'}
                        <span class="date-state is-warning">{t('Due soon')} · {dateLabel(document.expiresOn)}</span>
                      {:else}
                        <span class="date-state">{dateLabel(document.expiresOn)}</span>
                      {/if}
                    </td>
                    <td>
                      <span class="access-label">
                        {#if document.accessScope === 'owner'}<LockKeyhole size={12} aria-hidden="true" />{/if}
                        {t(document.accessScope === 'owner' ? 'Owner only' : 'Management')}
                      </span>
                    </td>
                    <td class="is-num">{formatBytes(document.sizeBytes)}</td>
                    <td>{uploadedLabel(document.createdAt)}</td>
                    <td class="cl-mobile-summary row-actions">
                      {#if document.status === 'ready'}
                        <button
                          type="button"
                          title={t('Download')}
                          aria-label={t('Download {title}', { title: document.title })}
                          disabled={Boolean(downloadingId)}
                          onclick={(event) => {
                            event.stopPropagation();
                            void download(document);
                          }}
                        ><Download size={14} aria-hidden="true" /></button>
                      {/if}
                      <button
                        type="button"
                        title={t('Open details')}
                        aria-label={t('Open details for {title}', { title: document.title })}
                        onclick={(event) => {
                          event.stopPropagation();
                          selectedId = document.id;
                        }}
                      ><ChevronRight size={15} aria-hidden="true" /></button>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {:else}
          <div class="empty-library">
            <span><FolderOpen size={27} strokeWidth={1.5} aria-hidden="true" /></span>
            <strong>{t(statusFilter === 'archived' ? 'No archived documents' : statusFilter === 'expiring' ? 'Nothing needs expiry attention' : 'No documents in this view')}</strong>
            <p>{t(statusFilter === 'archived' ? 'Archived records stay here after their stored file is removed.' : statusFilter === 'expiring' ? 'Documents due within 30 days will appear here.' : 'Upload a file or change the category and search filters.')}</p>
            {#if statusFilter === 'active' && !search && !storageFull && !workspace.isPreview}
              <button type="button" onclick={() => (uploadOpen = true)}><Upload size={14} aria-hidden="true" />{t('Upload first document')}</button>
            {/if}
          </div>
        {/if}
      </section>
    </div>
  {/if}
</WorkspacePage>

{#if snapshot}
  <DocumentUploadDialog
    open={uploadOpen}
    {restaurantId}
    employees={snapshot.employees}
    quota={snapshot.quota}
    {owner}
    onclose={() => (uploadOpen = false)}
    onuploaded={load}
  />
  <DocumentDetailsDialog
    open={Boolean(selectedDocument)}
    {restaurantId}
    document={selectedDocument}
    events={snapshot.events}
    employees={snapshot.employees}
    {owner}
    {today}
    onclose={() => (selectedId = '')}
    onchanged={load}
  />
{/if}

<Dialog
  open={upgradeOpen}
  title="Request more document storage"
  description="Choose the capacity you expect to need. Restogogo will confirm pricing before your limit changes."
  size="small"
  onclose={() => !requestingUpgrade && (upgradeOpen = false)}
>
  <div class="upgrade-form">
    <label>
      <span>{t('Requested capacity')}</span>
      <select class="cl-field" bind:value={upgradeSize}>
        <option value="2 GB">2 GB</option>
        <option value="10 GB">10 GB</option>
        <option value="Custom">{t('Custom')}</option>
      </select>
    </label>
    <label>
      <span>{t('Context')} <small>{t('optional')}</small></span>
      <textarea class="cl-field" rows="4" maxlength="500" bind:value={upgradeNote} placeholder={t('What kinds of files or retention period do you expect?')}></textarea>
    </label>
    <div class="upgrade-note">
      <ShieldCheck size={16} aria-hidden="true" />
      <span>{t('Your current limit stays unchanged until you accept the quoted paid plan.')}</span>
    </div>
  </div>
  {#snippet footer()}
    <ActionButton label="Cancel" disabled={requestingUpgrade} onclick={() => (upgradeOpen = false)} />
    <ActionButton label={requestingUpgrade ? 'Sending...' : 'Send request'} tone="primary" disabled={requestingUpgrade} onclick={requestUpgrade} />
  {/snippet}
</Dialog>

<style>
  .document-overview {
    display: grid;
    border: 1px solid var(--rst-ui-divider-soft);
    border-radius: var(--cl-radius-surface);
    background: var(--rst-ui-surface-panel);
  }
  .storage-summary {
    min-width: 0;
    display: grid;
    grid-template-columns: auto minmax(130px, auto) minmax(160px, 1fr) auto auto;
    align-items: center;
    gap: 13px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--rst-ui-divider-soft);
  }
  .overview-icon {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border-radius: 7px;
    color: var(--rst-ui-action);
    background: rgba(var(--rst-ui-action-rgb), .1);
  }
  .storage-copy,
  .plan-copy { display: grid; gap: 3px; }
  .storage-copy > span,
  .plan-copy > span { color: var(--rst-ui-muted); font-size: 9px; }
  .storage-copy > strong { font-size: 13px; }
  .storage-copy small { color: var(--rst-ui-muted); font-size: 10px; font-weight: var(--rst-fw-medium); }
  .plan-copy strong { font-size: 10px; }
  .storage-meter { height: 6px; overflow: hidden; border-radius: 3px; background: var(--rst-ui-line); }
  .storage-meter i { height: 100%; display: block; border-radius: inherit; background: var(--rst-ui-action); transition: width .2s ease; }
  .upgrade-button {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 6px 8px;
    border: 0;
    color: var(--rst-ui-action);
    background: transparent;
    font: inherit;
    font-size: 10px;
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
  }
  .upgrade-button:hover:not(:disabled) { background: rgba(var(--rst-ui-action-rgb), .07); }
  .upgrade-button:disabled { opacity: .5; }
  .document-stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  .document-stats > div {
    min-width: 0;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    padding: 10px 15px;
    color: var(--rst-ui-muted);
    border-right: 1px solid var(--rst-ui-divider-soft);
  }
  .document-stats > div:last-child { border-right: 0; }
  .document-stats span { overflow: hidden; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
  .document-stats strong { color: var(--rst-ui-text); font-size: 13px; }
  .document-stats .has-attention { color: var(--rst-state-warning-text); }
  .document-stats .has-attention strong { color: inherit; }
  .library-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 0;
    border-bottom: 1px solid var(--rst-ui-divider-soft);
  }
  .search-field {
    min-width: 220px;
    max-width: 440px;
    flex: 1;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 0 10px;
    border: 1px solid var(--rst-ui-line);
    border-radius: 6px;
    color: var(--rst-ui-muted);
    background: var(--rst-ui-surface-field);
  }
  .search-field:focus-within { border-color: var(--rst-ui-action); }
  .search-field input {
    width: 100%;
    min-height: 34px;
    padding: 0;
    border: 0;
    outline: 0;
    color: var(--rst-ui-text);
    background: transparent;
    font: inherit;
    font-size: 10px;
  }
  .mobile-category { display: none; }
  .status-switch {
    display: flex;
    align-items: center;
    padding: 3px;
    border: 1px solid var(--rst-ui-line);
    border-radius: 6px;
    background: var(--rst-ui-surface-field);
  }
  .status-switch button {
    min-height: 28px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 9px;
    border: 0;
    border-radius: 4px;
    color: var(--rst-ui-muted);
    background: transparent;
    font: inherit;
    font-size: 9px;
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
  }
  .status-switch button.is-active { color: var(--rst-ui-text); background: var(--rst-ui-surface-panel); box-shadow: 0 1px 3px rgba(15, 23, 42, .08); }
  .status-switch i {
    min-width: 16px;
    height: 16px;
    display: grid;
    place-items: center;
    border-radius: 8px;
    color: var(--rst-state-warning-text);
    background: var(--rst-state-warning-bg);
    font-size: 8px;
    font-style: normal;
  }
  .upload-button,
  .empty-library button,
  .load-state button {
    min-height: 35px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 7px 11px;
    border: 1px solid var(--rst-ui-action);
    border-radius: 6px;
    color: var(--rst-on-accent-text);
    background: var(--rst-ui-action);
    font: inherit;
    font-size: 10px;
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
  }
  .upload-button:disabled { opacity: .5; cursor: default; }
  .library-layout {
    min-height: 480px;
    display: grid;
    grid-template-columns: 226px minmax(0, 1fr);
    border-bottom: 1px solid var(--rst-ui-divider-soft);
  }
  .category-rail {
    display: grid;
    align-content: start;
    border-right: 1px solid var(--rst-ui-divider-soft);
  }
  .category-rail button {
    min-width: 0;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    padding: 9px 10px;
    border: 0;
    border-bottom: 1px solid var(--rst-ui-divider-soft);
    color: var(--rst-ui-muted);
    background: transparent;
    text-align: left;
    font: inherit;
    cursor: pointer;
  }
  .category-rail button:hover { background: var(--rst-ui-hover-bg); }
  .category-rail button.is-active { color: var(--rst-ui-action); background: rgba(var(--rst-ui-action-rgb), .06); }
  .category-icon {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border-radius: 6px;
    color: currentColor;
    background: var(--rst-ui-surface-field);
  }
  .category-rail button > span:nth-child(2) { min-width: 0; display: grid; gap: 2px; }
  .category-rail strong,
  .category-rail small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .category-rail strong { color: var(--rst-ui-text); font-size: 10px; }
  .category-rail button.is-active strong { color: currentColor; }
  .category-rail small { font-size: 8px; }
  .category-rail i { min-width: 18px; color: var(--rst-ui-muted); font-size: 9px; font-style: normal; text-align: right; }
  .document-list { min-width: 0; }
  .document-list > header {
    min-height: 46px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--rst-ui-divider-soft);
  }
  .document-list > header > div { display: grid; gap: 2px; }
  .document-list > header strong { font-size: 11px; }
  .document-list > header span { color: var(--rst-ui-muted); font-size: 9px; }
  .document-list > header button { border: 0; color: var(--rst-ui-action); background: transparent; font: inherit; font-size: 9px; font-weight: var(--rst-fw-bold); cursor: pointer; }
  .document-list tbody tr { cursor: pointer; }
  .document-list tbody tr:hover { background: var(--rst-ui-hover-bg); }
  .document-list tbody tr.is-archived { opacity: .7; }
  .document-cell { display: flex; align-items: center; gap: 8px; }
  .file-type {
    width: 30px;
    height: 30px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    border-radius: 6px;
    color: var(--rst-ui-action);
    background: rgba(var(--rst-ui-action-rgb), .08);
  }
  .document-cell > span:last-child { min-width: 0; display: grid; gap: 2px; }
  .document-cell strong,
  .document-cell small { max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .document-cell strong { font-size: 10px; }
  .document-cell small { color: var(--rst-ui-muted); font-size: 8px; }
  .mobile-document-meta { display: none; }
  .category-pill,
  .date-state,
  .access-label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--rst-ui-muted);
    font-size: 9px;
    white-space: nowrap;
  }
  .category-pill {
    padding: 3px 6px;
    border-radius: 4px;
    color: var(--rst-ui-text-soft);
    background: var(--rst-ui-surface-field);
  }
  .category-pill.is-employee { color: var(--cl-info); background: color-mix(in srgb, var(--cl-info) 10%, transparent); }
  .category-pill.is-compliance { color: var(--rst-state-success-text); background: var(--rst-state-success-bg); }
  .category-pill.is-finance { color: var(--rst-state-warning-text); background: var(--rst-state-warning-bg); }
  .date-state.is-warning { color: var(--rst-state-warning-text); }
  .date-state.is-danger { color: var(--rst-state-danger-text); }
  .row-actions { display: flex; justify-content: flex-end; gap: 3px; }
  .row-actions button {
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
  .row-actions button:hover:not(:disabled) { color: var(--rst-ui-text); background: var(--rst-ui-hover-bg); }
  .row-actions button:disabled { opacity: .45; }
  .empty-library,
  .load-state {
    min-height: 350px;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 7px;
    padding: 30px;
    color: var(--rst-ui-muted);
    text-align: center;
  }
  .empty-library > span {
    width: 48px;
    height: 48px;
    display: grid;
    place-items: center;
    margin-bottom: 3px;
    border-radius: 8px;
    color: var(--rst-ui-action);
    background: rgba(var(--rst-ui-action-rgb), .09);
  }
  .empty-library strong,
  .load-state strong { color: var(--rst-ui-text); font-size: 12px; }
  .empty-library p,
  .load-state span { max-width: 390px; margin: 0; font-size: 10px; line-height: 1.5; }
  .empty-library button,
  .load-state button { margin-top: 7px; }
  .load-state.is-error { color: var(--rst-state-danger-text); }
  .load-state.is-error button { border-color: var(--rst-ui-line); color: var(--rst-ui-text); background: var(--rst-ui-surface-field-strong); }
  .spin { animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .upgrade-form { display: grid; gap: 14px; }
  .upgrade-form label { display: grid; gap: 6px; }
  .upgrade-form label > span { font-size: 10px; font-weight: var(--rst-fw-bold); }
  .upgrade-form small { color: var(--rst-ui-muted); font-size: 9px; font-weight: var(--rst-fw-medium); }
  .upgrade-form textarea { resize: vertical; }
  .upgrade-note { display: flex; gap: 8px; padding: 10px 11px; color: var(--rst-ui-muted); background: var(--rst-ui-surface-field); font-size: 9px; line-height: 1.45; }
  @media (max-width: 980px) {
    .storage-summary { grid-template-columns: auto auto minmax(120px, 1fr) auto; }
    .plan-copy { display: none; }
    .library-layout { grid-template-columns: 190px minmax(0, 1fr); }
    .category-rail small { display: none; }
  }
  @media (max-width: 760px) {
    .storage-summary { grid-template-columns: auto minmax(0, 1fr) auto; }
    .storage-meter { grid-column: 1 / -1; grid-row: 2; }
    .upgrade-button { grid-column: 3; grid-row: 1; }
    .document-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .document-stats > div:nth-child(2) { border-right: 0; }
    .document-stats > div:nth-child(-n + 2) { border-bottom: 1px solid var(--rst-ui-divider-soft); }
    .library-toolbar { flex-wrap: wrap; }
    .search-field { max-width: none; flex-basis: calc(100% - 100px); }
    .mobile-category { display: block; flex: 1; }
    .mobile-category .cl-field { min-height: 35px; }
    .status-switch { order: 3; flex: 1; }
    .status-switch button { flex: 1; justify-content: center; }
    .upload-button { order: 4; }
    .library-layout { display: block; min-height: 0; }
    .category-rail { display: none; }
    .document-list > header { padding-inline: 0; }
    .empty-library { min-height: 300px; }
  }
  @media (max-width: 520px) {
    .storage-summary { gap: 9px; padding: 11px 12px; }
    .overview-icon { width: 30px; height: 30px; }
    .upgrade-button { width: 30px; height: 30px; overflow: hidden; padding: 0; font-size: 0; }
    .upgrade-button :global(svg) { width: 18px; height: 18px; }
    .document-stats > div { padding: 9px 10px; }
    .library-toolbar { gap: 6px; }
    .search-field { min-width: 0; flex-basis: 100%; }
    .mobile-category { min-width: 0; flex-basis: 100%; }
    .status-switch { width: 100%; }
    .upload-button { width: 38px; padding-inline: 0; font-size: 0; }
    .upload-button :global(svg) { width: 16px; height: 16px; }
    .document-list > header { min-height: 42px; }
    .document-list :global(.cl-mobile-rows tbody tr) { padding-right: 38px; }
    .document-list :global(.cl-mobile-rows .document-cell) { padding-right: 0; }
    .document-list :global(.cl-mobile-rows td:not(.cl-mobile-primary):not(.cl-mobile-summary)) { display: none; }
    .document-list :global(.cl-mobile-rows .cl-mobile-summary) {
      position: absolute;
      top: 10px;
      right: 7px;
      width: 30px;
      display: grid;
      gap: 2px;
      padding: 0;
      border: 0;
    }
    .document-cell strong,
    .document-cell small { max-width: calc(100vw - 150px); }
    .mobile-document-meta {
      max-width: calc(100vw - 110px);
      display: flex;
      align-items: center;
      gap: 6px;
      padding-top: 3px;
      overflow: hidden;
    }
    .mobile-document-meta .date-state {
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .empty-library { min-height: 250px; padding-inline: 18px; }
  }
</style>
