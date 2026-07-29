<script lang="ts">
  import { TabletSmartphone } from '@lucide/svelte';
  import ActionButton from '$lib/components/ActionButton.svelte';
  import Dialog from '$lib/components/Dialog.svelte';
  import {
    createRestaurantStation,
    listRestaurantStations,
    revokeRestaurantStation,
    type RestaurantStation
  } from '$lib/api/mutations';
  import { friendlyError } from '$lib/api/error-messages';
  import { i18n, t } from '$lib/i18n/i18n.svelte';
  import { confirmAction } from '$lib/ui/confirm.svelte';
  import { toasts } from '$lib/ui/toast.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import ClassicPage from '$lib/classic/ClassicPage.svelte';
  import ClassicRowMenu from '$lib/classic/ClassicRowMenu.svelte';
  import ClassicStatus from '$lib/classic/ClassicStatus.svelte';
  import ClassicTablePanel from '$lib/classic/ClassicTablePanel.svelte';

  let stations = $state<RestaurantStation[]>([]);
  let loading = $state(false);
  let busy = $state('');
  let pairOpen = $state(false);
  let pairLabel = $state('');
  // Shown once and never again: the token is only ever stored hashed.
  let pairedCode = $state('');

  async function reload() {
    if (!workspace.activeId) return;
    loading = true;
    try {
      stations = await listRestaurantStations(workspace.activeId);
    } catch (error) {
      toasts.show(friendlyError(error), 'danger');
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (workspace.activeId) void reload();
  });

  async function pair() {
    if (!workspace.activeId || busy) return;
    if (!pairLabel.trim()) {
      toasts.show(t('Give the device a name so you can recognise it later.'), 'warning');
      return;
    }
    busy = 'pair';
    try {
      const result = await createRestaurantStation(workspace.activeId, pairLabel.trim());
      pairedCode = result.token;
      pairLabel = '';
      await reload();
    } catch (error) {
      toasts.show(friendlyError(error), 'danger');
    } finally {
      busy = '';
    }
  }

  async function revoke(station: RestaurantStation) {
    if (!workspace.activeId || busy) return;
    const confirmed = await confirmAction({
      title: 'Revoke this device?',
      body: 'The tablet stops working immediately and has to be paired again.',
      confirmLabel: 'Revoke device',
      tone: 'danger'
    });
    if (!confirmed) return;
    busy = station.id;
    try {
      await revokeRestaurantStation(workspace.activeId, station.id);
      await reload();
      toasts.show(t('Device revoked.'), 'success');
    } catch (error) {
      toasts.show(friendlyError(error), 'danger');
    } finally {
      busy = '';
    }
  }

  function stamp(value: string | null): string {
    if (!value) return '';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return new Intl.DateTimeFormat(i18n.intlLocale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }
</script>

<svelte:head><title>{t('Badge devices')} &middot; restogogo</title></svelte:head>

<ClassicPage>
  <ClassicTablePanel>
    {#snippet meta()}
      <span><i class="dot"></i>{t('{count} paired', { count: stations.length })}</span>
      <span><i class="dot is-green"></i>{t('{count} ready', { count: stations.filter((station) => station.lastUsedAt).length })}</span>
    {/snippet}

    {#snippet actions()}
      <a class="cl-btn" href="/badge-terminal/terminal">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="5" y="3" width="14" height="18" rx="2" />
          <path d="M9 7h6M9 11h6M10 17h4" />
        </svg>
        <span>{t('Open terminal')}</span>
      </a>
      <button
        class="cl-btn is-primary"
        type="button"
        disabled={workspace.isPreview}
        onclick={() => { pairedCode = ''; pairLabel = ''; pairOpen = true; }}
      >
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span>{t('Pair a device')}</span>
      </button>
    {/snippet}

    {#snippet children()}
      <div class="cl-tablewrap">
        <table class="cl-table">
          <thead>
            <tr>
              <th>{t('Device')}</th>
              <th>{t('Paired')}</th>
              <th>{t('Last used')}</th>
              <th>{t('Status')}</th>
              <th class="menu-cell" aria-label={t('Actions')}></th>
            </tr>
          </thead>
          <tbody>
            {#if loading && !stations.length}
              <tr><td colspan="5"><div class="cl-empty"><strong>{t('Loading your workspace')}</strong></div></td></tr>
            {:else if !stations.length}
              <tr>
                <td colspan="5">
                  <div class="cl-empty">
                    <span class="cl-empty__icon" aria-hidden="true"><TabletSmartphone size={18} /></span>
                    <strong>{t('No paired devices')}</strong>
                    <span>{t('Pair a tablet to run the badge terminal without signing anyone in.')}</span>
                  </div>
                </td>
              </tr>
            {:else}
              {#each stations as station (station.id)}
                <tr>
                  <td>
                    <span class="cl-table__name">
                      <span class="device-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                          <rect x="6" y="3" width="12" height="18" rx="2" />
                          <path d="M10 17h4" />
                        </svg>
                      </span>
                      <strong>{station.label}</strong>
                    </span>
                  </td>
                  <td class="is-quiet">{stamp(station.createdAt)}</td>
                  <td class="is-quiet">{stamp(station.lastUsedAt) || t('Never')}</td>
                  <td>
                    <ClassicStatus
                      label={station.lastUsedAt ? 'Ready' : 'Waiting for first badge'}
                      tone={station.lastUsedAt ? 'ok' : 'attention'}
                    />
                  </td>
                  <td class="menu-cell">
                    <ClassicRowMenu
                      disabled={workspace.isPreview || busy === station.id}
                      items={[
                        {
                          label: t('Revoke'),
                          tone: 'danger',
                          onselect: () => void revoke(station)
                        }
                      ]}
                    />
                  </td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    {/snippet}
  </ClassicTablePanel>
</ClassicPage>

{#snippet pairFooter()}
  <ActionButton label={t(pairedCode ? 'Close' : 'Cancel')} onclick={() => (pairOpen = false)} />
  {#if !pairedCode}
    <ActionButton label={busy === 'pair' ? t('Saving…') : t('Pair a device')} tone="primary" disabled={Boolean(busy)} onclick={pair} />
  {/if}
{/snippet}

<Dialog
  open={pairOpen}
  title={t('Pair a device')}
  description={t('Name the tablet, then enter the code on it once. The code is shown only now.')}
  size="small"
  onclose={() => (pairOpen = false)}
  footer={pairFooter}
>
  {#if pairedCode}
    <div class="paired">
      <span>{t('Pairing code')}</span>
      <code>{pairedCode}</code>
      <small>{t('Open /station on the tablet and paste this code. It cannot be shown again.')}</small>
    </div>
  {:else}
    <label class="cl-label">
      <span>{t('Device name')}</span>
      <input class="cl-field" bind:value={pairLabel} placeholder={t('Bar tablet')} />
    </label>
  {/if}
</Dialog>

<style>
  .device-icon {
    width: 28px;
    height: 28px;
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--cl-info) 24%, var(--cl-line));
    border-radius: 7px;
    color: var(--cl-info);
    background: color-mix(in srgb, var(--cl-info) 8%, var(--cl-surface));
  }
  .paired {
    display: grid;
    gap: 8px;
  }
  .paired > span {
    color: var(--cl-muted);
    font-size: 13px;
    font-weight: var(--rst-fw-medium);
  }
  .paired code {
    padding: 12px 14px;
    border: 1px solid var(--cl-line);
    border-radius: var(--cl-radius);
    background: var(--cl-surface-muted);
    font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
    font-size: 14px;
    word-break: break-all;
  }
  .paired small {
    color: var(--cl-muted);
    font-size: 13px;
    line-height: 1.5;
  }
</style>
