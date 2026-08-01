<script lang="ts">
  import { onMount } from 'svelte';
  import { Camera, LocateFixed, MonitorUp, ShieldCheck, Smartphone, TabletSmartphone, Trash2 } from '@lucide/svelte';
  import { auth } from '$lib/auth/session.svelte';
  import ActionButton from '$lib/components/ActionButton.svelte';
  import Dialog from '$lib/components/Dialog.svelte';
  import {
    createRestaurantStation,
    listRestaurantStations,
    revokeRestaurantStation,
    setBadgePolicy,
    type RestaurantStation
  } from '$lib/api/mutations';
  import {
    badgePolicyFromSettings,
    DEFAULT_BADGE_POLICY,
    type BadgePolicy
  } from '$lib/badge/badge-policy';
  import { friendlyError } from '$lib/api/error-messages';
  import { i18n, t } from '$lib/i18n/i18n.svelte';
  import { confirmAction } from '$lib/ui/confirm.svelte';
  import { toasts } from '$lib/ui/toast.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import WorkspacePage from '$lib/workspace-ui/WorkspacePage.svelte';
  import WorkspaceRowMenu from '$lib/workspace-ui/WorkspaceRowMenu.svelte';
  import WorkspaceStatus from '$lib/workspace-ui/WorkspaceStatus.svelte';
  import WorkspaceCard from '$lib/workspace-ui/WorkspaceCard.svelte';
  import WorkspaceCardGrid from '$lib/workspace-ui/WorkspaceCardGrid.svelte';
  import { workspaceLayout } from '$lib/workspace-ui/workspace-layout.svelte';
  import WorkspaceTablePanel from '$lib/workspace-ui/WorkspaceTablePanel.svelte';
  import WorkspaceColMenu from '$lib/workspace-ui/WorkspaceColMenu.svelte';
  import WorkspaceToggle from '$lib/workspace-ui/WorkspaceToggle.svelte';

  let stations = $state<RestaurantStation[]>([]);
  let loading = $state(false);
  let busy = $state('');
  let pairOpen = $state(false);
  let pairLabel = $state('');
  let now = $state(Date.now());
  // Shown once and never again: the token is only ever stored hashed.
  let pairedCode = $state('');
  let policy = $state<BadgePolicy>(DEFAULT_BADGE_POLICY);
  let policySource = $state('');

  const ownerCanConfigure = $derived(
    workspace.effectiveRole === 'owner' && !workspace.isPreview
  );
  const policyDirty = $derived(
    policy.photoClockInRequired !== badgePolicyFromSettings(workspace.bootstrap?.restaurant_settings).photoClockInRequired ||
    policy.photoClockOutRequired !== badgePolicyFromSettings(workspace.bootstrap?.restaurant_settings).photoClockOutRequired ||
    policy.locationCaptureEnabled !== badgePolicyFromSettings(workspace.bootstrap?.restaurant_settings).locationCaptureEnabled ||
    policy.employeeMobileBadgingEnabled !== badgePolicyFromSettings(workspace.bootstrap?.restaurant_settings).employeeMobileBadgingEnabled
  );

  $effect(() => {
    const restaurantId = workspace.activeId;
    const current = badgePolicyFromSettings(workspace.bootstrap?.restaurant_settings);
    const source = `${restaurantId ?? ''}:${current.revision}`;
    if (!restaurantId || policySource === source) return;
    policy = current;
    policySource = source;
  });

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

  onMount(() => {
    const refresh = window.setInterval(() => {
      now = Date.now();
      if (!loading && document.visibilityState === 'visible') void reload();
    }, 60_000);
    return () => window.clearInterval(refresh);
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

  async function savePolicy() {
    if (!workspace.activeId || !ownerCanConfigure || busy) return;
    busy = 'policy';
    try {
      policy = await setBadgePolicy(workspace.activeId, policy);
      policySource = `${workspace.activeId}:${policy.revision}`;
      await workspace.reloadBootstrap();
      toasts.show(t('Badging settings saved.'), 'success');
    } catch (error) {
      toasts.show(friendlyError(error), 'danger');
    } finally {
      busy = '';
    }
  }

  async function useThisDevice() {
    if (!workspace.activeId || workspace.isPreview || busy) return;
    const confirmed = await confirmAction({
      title: 'Turn this device into the badge station?',
      body: 'You will be signed out before the terminal opens. Staff can badge, but cannot return to manager pages.',
      confirmLabel: 'Open secure station',
      tone: 'primary'
    });
    if (!confirmed) return;

    busy = 'this-device';
    let stationId = '';
    try {
      const result = await createRestaurantStation(
        workspace.activeId,
        `${t('Badge station')} · ${new Intl.DateTimeFormat(i18n.intlLocale, { dateStyle: 'short' }).format(new Date())}`
      );
      stationId = result.stationId;
      localStorage.setItem('rst-station-token', result.token);
      await auth.signOut();
      workspace.reset();
      window.location.assign('/station');
    } catch (error) {
      localStorage.removeItem('rst-station-token');
      if (stationId && workspace.activeId) {
        await revokeRestaurantStation(workspace.activeId, stationId).catch(() => undefined);
      }
      toasts.show(friendlyError(error), 'danger');
      busy = '';
    }
  }

  async function copyPairCode() {
    if (!pairedCode) return;
    try {
      await navigator.clipboard.writeText(pairedCode);
      toasts.show(t('Copied'), 'success');
    } catch {
      toasts.show(t('Copy the code manually.'), 'warning');
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

  function isOnline(station: RestaurantStation): boolean {
    if (!station.lastUsedAt) return false;
    const lastSeen = new Date(station.lastUsedAt).getTime();
    return Number.isFinite(lastSeen) && now - lastSeen < 150_000;
  }
</script>

<svelte:head><title>{t('Badge devices')} &middot; restogogo</title></svelte:head>

<WorkspacePage>
  <section class="policy-panel" aria-labelledby="badge-policy-title">
    <header>
      <div class="policy-heading">
        <span class="policy-icon" aria-hidden="true"><ShieldCheck size={18} /></span>
        <div>
          <strong id="badge-policy-title">{t('Badging rules')}</strong>
          <span>{t('Choose what every clock action must record.')}</span>
        </div>
      </div>
      {#if ownerCanConfigure}
        <button
          class="cl-btn is-primary"
          type="button"
          disabled={!policyDirty || Boolean(busy)}
          onclick={() => void savePolicy()}
        >{busy === 'policy' ? t('Saving…') : t('Save settings')}</button>
      {:else}
        <span class="owner-note">{t('Only an owner can change these rules.')}</span>
      {/if}
    </header>

    <div class="policy-grid">
      <article>
        <span class="setting-icon is-camera" aria-hidden="true"><Camera size={18} /></span>
        <div><strong>{t('Photo at clock-in')}</strong><span>{t('Keep private arrival evidence with the time entry.')}</span></div>
        <WorkspaceToggle checked={policy.photoClockInRequired} label={t('Required')} disabled={!ownerCanConfigure || Boolean(busy)} onchange={(checked) => (policy = { ...policy, photoClockInRequired: checked })} />
      </article>
      <article>
        <span class="setting-icon is-camera" aria-hidden="true"><Camera size={18} /></span>
        <div><strong>{t('Photo at clock-out')}</strong><span>{t('Keep private departure evidence with the time entry.')}</span></div>
        <WorkspaceToggle checked={policy.photoClockOutRequired} label={t('Required')} disabled={!ownerCanConfigure || Boolean(busy)} onchange={(checked) => (policy = { ...policy, photoClockOutRequired: checked })} />
      </article>
      <article>
        <span class="setting-icon is-location" aria-hidden="true"><LocateFixed size={18} /></span>
        <div><strong>{t('Location evidence')}</strong><span>{t('Record the device location; no geofence blocks the employee.')}</span></div>
        <WorkspaceToggle checked={policy.locationCaptureEnabled} label={t('Enabled')} disabled={!ownerCanConfigure || Boolean(busy)} onchange={(checked) => (policy = { ...policy, locationCaptureEnabled: checked })} />
      </article>
      <article>
        <span class="setting-icon is-mobile" aria-hidden="true"><Smartphone size={18} /></span>
        <div><strong>{t('Employee phones')}</strong><span>{t('Let signed-in employees clock only themselves from My time.')}</span></div>
        <WorkspaceToggle checked={policy.employeeMobileBadgingEnabled} label={t('Allowed')} disabled={!ownerCanConfigure || Boolean(busy)} onchange={(checked) => (policy = { ...policy, employeeMobileBadgingEnabled: checked })} />
      </article>
    </div>
  </section>

  <WorkspaceTablePanel>
    {#snippet meta()}
      <span><i class="dot"></i>{t('{count} paired', { count: stations.length })}</span>
      <span><i class="dot is-green"></i>{t('{count} online', { count: stations.filter(isOnline).length })}</span>
    {/snippet}

    {#snippet actions()}
      <button class="cl-btn" type="button" disabled={workspace.isPreview || Boolean(busy)} onclick={() => void useThisDevice()}>
        <MonitorUp size={15} aria-hidden="true" />
        <span>{busy === 'this-device' ? t('Securing device…') : t('Use this device')}</span>
      </button>
      <button
        class="cl-btn is-primary"
        type="button"
        disabled={workspace.isPreview}
        onclick={() => { pairedCode = ''; pairLabel = ''; pairOpen = true; }}
      >
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span>{t('Pair another device')}</span>
      </button>
    {/snippet}

    {#snippet children()}
      <div class="desktop-device-view">
      {#if workspaceLayout.cards}
        <!-- A device roster reads by state: a terminal that is live on the floor
             should not look like one that has never connected. -->
        <WorkspaceCardGrid>
          {#each stations as station (station.id)}
            <WorkspaceCard
              accent={isOnline(station) ? 'var(--cl-ok, #157f4b)' : station.lastUsedAt ? null : 'var(--rst-state-warning, #d99a1c)'}
              title={station.label}
              badges={[
                isOnline(station)
                  ? { label: t('Online'), tone: 'ok' as const }
                  : station.lastUsedAt
                    ? { label: t('Offline'), tone: 'neutral' as const }
                    : { label: t('Waiting for first connection'), tone: 'warn' as const }
              ]}
              meta={[
                { label: t('Paired'), value: stamp(station.createdAt) },
                { label: t('Last used'), value: stamp(station.lastUsedAt) || t('Never'), muted: !station.lastUsedAt }
              ]}
            >
              {#snippet media()}
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <rect x="6" y="3" width="12" height="18" rx="2" />
                  <path d="M10 17h4" />
                </svg>
              {/snippet}
            </WorkspaceCard>
          {/each}
        </WorkspaceCardGrid>
      {:else}
      <div class="cl-tablewrap">
        <table class="cl-table">
          <thead>
            <tr>
              <th class="has-menu"><WorkspaceColMenu label={t('Device')} columnKey="badge-device" /></th>
              <th class="has-menu"><WorkspaceColMenu label={t('Paired')} columnKey="badge-paired" /></th>
              <th class="has-menu"><WorkspaceColMenu label={t('Last check-in')} columnKey="badge-last-check-in" /></th>
              <th class="has-menu"><WorkspaceColMenu label={t('Status')} columnKey="badge-status" /></th>
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
                    <WorkspaceStatus
                      label={isOnline(station) ? 'Online' : station.lastUsedAt ? 'Offline' : 'Waiting for first connection'}
                      tone={isOnline(station) ? 'ok' : 'attention'}
                    />
                  </td>
                  <td class="menu-cell">
                    <WorkspaceRowMenu
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
      {/if}
      </div>

      <div class="mobile-device-list">
        {#if loading && !stations.length}
          <div class="mobile-empty">{t('Loading your workspace')}</div>
        {:else if !stations.length}
          <div class="mobile-empty">
            <TabletSmartphone size={20} />
            <strong>{t('No paired devices')}</strong>
            <span>{t('Pair a tablet to run the badge terminal without signing anyone in.')}</span>
          </div>
        {:else}
          {#each stations as station (station.id)}
            <article class="mobile-device">
              <span class="device-icon" aria-hidden="true"><TabletSmartphone size={16} /></span>
              <div class="mobile-device__copy">
                <strong>{station.label}</strong>
                <span>{station.lastUsedAt ? t('Last used {when}', { when: stamp(station.lastUsedAt) }) : t('Never used')}</span>
              </div>
              <WorkspaceStatus
                label={isOnline(station) ? 'Online' : station.lastUsedAt ? 'Offline' : 'Waiting for first connection'}
                tone={isOnline(station) ? 'ok' : 'attention'}
              />
              <button
                class="mobile-device__revoke"
                type="button"
                aria-label={t('Revoke {device}', { device: station.label })}
                title={t('Revoke')}
                disabled={workspace.isPreview || busy === station.id}
                onclick={() => void revoke(station)}
              ><Trash2 size={15} /></button>
            </article>
          {/each}
        {/if}
      </div>
    {/snippet}
  </WorkspaceTablePanel>
</WorkspacePage>

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
      <button type="button" class="copy-code" onclick={() => void copyPairCode()}>{t('Copy code')}</button>
      <small>{t('Open {url} on the other device and paste this code. It cannot be shown again.', { url: `${location.origin}/station` })}</small>
    </div>
  {:else}
    <label class="cl-label">
      <span>{t('Device name')}</span>
      <input class="cl-field" bind:value={pairLabel} placeholder={t('Bar tablet')} />
    </label>
  {/if}
</Dialog>

<style>
  .policy-panel {
    overflow: hidden;
    border: 1px solid var(--cl-line);
    border-radius: var(--cl-radius);
    background: var(--cl-surface);
  }
  .policy-panel > header {
    min-height: 58px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--cl-line);
    background: color-mix(in srgb, var(--cl-info) 4%, var(--cl-surface));
  }
  .policy-heading,
  .policy-heading > div,
  .policy-grid article > div {
    display: grid;
    gap: 2px;
  }
  .policy-heading {
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 10px;
  }
  .policy-heading strong,
  .policy-grid strong {
    color: var(--cl-data-text-strong);
    font-size: var(--rst-fs-body);
  }
  .policy-heading span,
  .policy-grid article > div span,
  .owner-note {
    color: var(--cl-muted);
    font-size: var(--rst-fs-caption);
    line-height: 1.4;
  }
  .policy-icon,
  .setting-icon {
    display: grid;
    place-items: center;
    color: var(--cl-info);
  }
  .policy-icon {
    width: 32px;
    height: 32px;
    border: 1px solid color-mix(in srgb, var(--cl-info) 24%, var(--cl-line));
    border-radius: 7px;
    background: color-mix(in srgb, var(--cl-info) 8%, var(--cl-surface));
  }
  .policy-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .policy-grid article {
    min-width: 0;
    min-height: 72px;
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    border-right: 1px solid var(--cl-line);
    border-bottom: 1px solid var(--cl-line);
  }
  .policy-grid article:nth-child(2n) { border-right: 0; }
  .policy-grid article:nth-last-child(-n + 2) { border-bottom: 0; }
  .setting-icon.is-camera { color: var(--cl-info); }
  .setting-icon.is-location { color: var(--cl-ok); }
  .setting-icon.is-mobile { color: var(--cl-warn); }
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
  .mobile-device-list { display: none; }
  .paired {
    display: grid;
    gap: 8px;
  }
  .paired > span {
    color: var(--cl-muted);
    font-size: var(--rst-fs-body);
    font-weight: var(--rst-fw-medium);
  }
  .paired code {
    padding: 12px 14px;
    border: 1px solid var(--cl-line);
    border-radius: var(--cl-radius);
    background: var(--cl-surface-muted);
    font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
    font-size: var(--rst-fs-body-lg);
    word-break: break-all;
  }
  .copy-code {
    justify-self: start;
    padding: 0;
    border: 0;
    color: var(--cl-info);
    background: transparent;
    font: inherit;
    font-size: var(--rst-fs-body);
    font-weight: var(--rst-fw-semibold);
    cursor: pointer;
  }
  .paired small {
    color: var(--cl-muted);
    font-size: var(--rst-fs-body);
    line-height: 1.5;
  }
  @media (max-width: 760px) {
    .policy-panel > header { align-items: flex-start; flex-direction: column; }
    .policy-grid { grid-template-columns: 1fr; }
    .policy-grid article,
    .policy-grid article:nth-child(2n),
    .policy-grid article:nth-last-child(-n + 2) {
      border-right: 0;
      border-bottom: 1px solid var(--cl-line);
    }
    .policy-grid article:last-child { border-bottom: 0; }
    .desktop-device-view { display: none; }
    .mobile-device-list { display: grid; }
    .mobile-device {
      min-width: 0;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto auto;
      align-items: center;
      gap: 9px;
      padding: 11px 12px;
      border-bottom: 1px solid var(--cl-line);
      background: var(--cl-surface);
    }
    .mobile-device:last-child { border-bottom: 0; }
    .mobile-device__copy { min-width: 0; display: grid; gap: 2px; }
    .mobile-device__copy strong { overflow: hidden; color: var(--cl-data-text-strong); font-size: var(--rst-fs-body); text-overflow: ellipsis; white-space: nowrap; }
    .mobile-device__copy span { overflow: hidden; color: var(--cl-muted); font-size: var(--rst-fs-caption); text-overflow: ellipsis; white-space: nowrap; }
    .mobile-device__revoke {
      width: 30px;
      height: 30px;
      display: grid;
      place-items: center;
      border: 0;
      border-radius: 5px;
      color: var(--cl-muted);
      background: transparent;
      cursor: pointer;
    }
    .mobile-device__revoke:hover { color: var(--cl-danger); background: var(--cl-danger-wash); }
    .mobile-device__revoke:disabled { cursor: default; opacity: .5; }
    .mobile-empty { min-height: 130px; display: grid; place-content: center; justify-items: center; gap: 5px; padding: 22px; color: var(--cl-muted); text-align: center; }
    .mobile-empty strong { color: var(--cl-ink); }
    .mobile-empty span { font-size: var(--rst-fs-caption); }
  }
</style>
