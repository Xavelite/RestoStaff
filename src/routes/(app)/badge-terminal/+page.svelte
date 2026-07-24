<script lang="ts">
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
  import ClassicStatus from '$lib/classic/ClassicStatus.svelte';

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

{#snippet pageActions()}
  <a class="cl-btn" href="/badge-terminal/terminal">{t('Open terminal')}</a>
  <button
    class="cl-btn is-primary"
    type="button"
    disabled={workspace.isPreview}
    onclick={() => { pairedCode = ''; pairLabel = ''; pairOpen = true; }}
  >{t('Pair a device')}</button>
{/snippet}

<ClassicPage actions={pageActions}>
  <p class="cl-section__note">
    {t('A paired tablet holds only a revocable device token, never a manager session.')}
  </p>

  <div class="cl-tablewrap">
    <table class="cl-table">
      <thead>
        <tr>
          <th>{t('Device')}</th>
          <th>{t('Paired')}</th>
          <th>{t('Last used')}</th>
          <th>{t('Status')}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#if loading && !stations.length}
          <tr><td colspan="5"><div class="cl-empty"><strong>{t('Loading your workspace')}</strong></div></td></tr>
        {:else if !stations.length}
          <tr>
            <td colspan="5">
              <div class="cl-empty">
                <strong>{t('No paired devices')}</strong>
                <span>{t('Pair a tablet to run the badge terminal without signing anyone in.')}</span>
              </div>
            </td>
          </tr>
        {:else}
          {#each stations as station (station.id)}
            <tr>
              <td>{station.label}</td>
              <td class="is-quiet">{stamp(station.createdAt)}</td>
              <td class="is-quiet">{stamp(station.lastUsedAt) || t('Never')}</td>
              <td>
                <ClassicStatus
                  label={station.lastUsedAt ? 'In use' : 'Waiting for first badge'}
                  tone={station.lastUsedAt ? 'ok' : 'attention'}
                />
              </td>
              <td class="is-num">
                <button
                  class="cl-btn"
                  type="button"
                  disabled={workspace.isPreview || busy === station.id}
                  onclick={() => revoke(station)}
                >{t('Revoke')}</button>
              </td>
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>
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

