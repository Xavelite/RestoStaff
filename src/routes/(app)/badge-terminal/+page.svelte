<script lang="ts">
  import { onMount } from 'svelte';
  import { Camera, Copy, ExternalLink, KeyRound, LocateFixed, MonitorUp, ShieldCheck, Smartphone, TabletSmartphone, Trash2 } from '@lucide/svelte';
  import { auth } from '$lib/auth/session.svelte';
  import ActionButton from '$lib/components/ActionButton.svelte';
  import Dialog from '$lib/components/Dialog.svelte';
  import {
    createRestaurantStation,
    listRestaurantStations,
    revokeRestaurantStation,
    rotateUnusedRestaurantStationToken,
    setBadgePolicy,
    setEmployeeMobileBadging,
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
  import WorkspaceColChooser from '$lib/workspace-ui/WorkspaceColChooser.svelte';
  import WorkspaceToggle from '$lib/workspace-ui/WorkspaceToggle.svelte';
  import { createTableView } from '$lib/workspace-ui/table-view.svelte';

  let stations = $state<RestaurantStation[]>([]);
  let loading = $state(false);
  let busy = $state('');
  let pairOpen = $state(false);
  let pairLabel = $state('');
  let now = $state(Date.now());
  // Secrets exist only in this manager tab; the database stores hashes.
  let pairingCodes = $state<Record<string, string>>({});
  let policy = $state<BadgePolicy>(DEFAULT_BADGE_POLICY);
  let policySource = $state('');
  let mobileBusy = $state('');

  const deviceView = createTableView({
    storageKey: 'restogogo.badge-device-columns',
    columns: [
      { key: 'pairing', label: 'Pairing code' },
      { key: 'paired', label: 'Paired' },
      { key: 'last', label: 'Last check-in' },
      { key: 'status', label: 'Status' }
    ]
  });
  const shown = deviceView.shown;
  const deviceColumns = $derived(deviceView.columns);
  const activeEmployees = $derived(
    (workspace.team?.employees ?? [])
      .filter((employee) => employee.active)
      .sort((left, right) => left.display_name.localeCompare(right.display_name))
  );

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

  $effect(() => {
    if (workspace.activeId && workspace.canManageOperations && !workspace.team) {
      void workspace.loadTeam();
    }
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
    deviceView.restore();
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
      pairingCodes = { ...pairingCodes, [result.stationId]: result.token };
      pairLabel = '';
      await reload();
      pairOpen = false;
      toasts.show(t('Pairing code added to the device row.'), 'success');
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

  async function copyText(value: string, success: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toasts.show(t(success), 'success');
    } catch {
      toasts.show(t('Copy the code manually.'), 'warning');
    }
  }

  function stationUrl(): string {
    return typeof location === 'undefined' ? '/station' : `${location.origin}/station`;
  }

  async function replaceUnusedCode(station: RestaurantStation) {
    if (!workspace.activeId || station.lastUsedAt || busy) return;
    const confirmed = await confirmAction({
      title: 'Create a new pairing code?',
      body: 'The previous unused code stops working. The replacement is shown in this device row until this page is reloaded.',
      confirmLabel: 'Create new code',
      tone: 'primary'
    });
    if (!confirmed) return;
    busy = station.id;
    try {
      const token = await rotateUnusedRestaurantStationToken(workspace.activeId, station.id);
      pairingCodes = { ...pairingCodes, [station.id]: token };
      toasts.show(t('New pairing code ready.'), 'success');
    } catch (error) {
      toasts.show(friendlyError(error), 'danger');
    } finally {
      busy = '';
    }
  }

  function employeeAccess(employeeId: string) {
    return workspace.team?.employee_access.find((access) => access.employee_id === employeeId);
  }

  function phoneEligible(employeeId: string): boolean {
    const access = employeeAccess(employeeId);
    return Boolean(
      access?.profile_id &&
      access.access_status === 'active' &&
      access.badge_enabled
    );
  }

  async function toggleEmployeePhone(employeeId: string, enabled: boolean) {
    if (!workspace.activeId || !ownerCanConfigure || mobileBusy) return;
    mobileBusy = employeeId;
    try {
      await setEmployeeMobileBadging(workspace.activeId, employeeId, enabled);
      await workspace.loadTeam(true);
      toasts.show(t(enabled ? 'Phone clock enabled.' : 'Phone clock disabled.'), 'success');
    } catch (error) {
      toasts.show(friendlyError(error), 'danger');
    } finally {
      mobileBusy = '';
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
        <div><strong>{t('Employee phones')}</strong><span>{t('Make phone clocking available only to the employees selected below.')}</span></div>
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
      <a class="cl-btn" href="/station" target="_blank" rel="noreferrer">
        <ExternalLink size={15} aria-hidden="true" />
        <span>{t('Open pairing page')}</span>
      </a>
      <button class="cl-btn" type="button" disabled={workspace.isPreview || Boolean(busy)} onclick={() => void useThisDevice()}>
        <MonitorUp size={15} aria-hidden="true" />
        <span>{busy === 'this-device' ? t('Securing device…') : t('Use this device')}</span>
      </button>
      <button
        class="cl-btn is-primary"
        type="button"
        disabled={workspace.isPreview}
        onclick={() => { pairLabel = ''; pairOpen = true; }}
      >
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span>{t('Pair another device')}</span>
      </button>
    {/snippet}

    {#snippet children()}
      <div class="desktop-device-view">
      {#if workspaceLayout.visual}
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
                {
                  label: t('Pairing code'),
                  value: pairingCodes[station.id] || (station.lastUsedAt ? t('Protected') : t('Create a new code')),
                  muted: !pairingCodes[station.id]
                },
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
              {#if shown('pairing')}<th class="has-menu"><WorkspaceColMenu label={t('Pairing code')} columnKey="badge-pairing-code" /></th>{/if}
              {#if shown('paired')}<th class="has-menu"><WorkspaceColMenu label={t('Paired')} columnKey="badge-paired" /></th>{/if}
              {#if shown('last')}<th class="has-menu"><WorkspaceColMenu label={t('Last check-in')} columnKey="badge-last-check-in" /></th>{/if}
              {#if shown('status')}<th class="has-menu"><WorkspaceColMenu label={t('Status')} columnKey="badge-status" /></th>{/if}
              <th class="chooser-col"><WorkspaceColChooser columns={deviceColumns} hidden={deviceView.hidden} ontoggle={deviceView.toggleColumn} /></th>
            </tr>
          </thead>
          <tbody>
            {#if loading && !stations.length}
              <tr><td colspan={deviceView.colCount + 1}><div class="cl-empty"><strong>{t('Loading your workspace')}</strong></div></td></tr>
            {:else if !stations.length}
              <tr>
                <td colspan={deviceView.colCount + 1}>
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
                  {#if shown('pairing')}
                    <td class="pairing-cell">
                      {#if pairingCodes[station.id]}
                        <button class="pairing-code" type="button" title={t('Copy pairing code')} onclick={() => void copyText(pairingCodes[station.id], 'Pairing code copied.')}>
                          <code>{pairingCodes[station.id]}</code><Copy size={13} />
                        </button>
                      {:else if !station.lastUsedAt}
                        <button class="inline-link" type="button" disabled={Boolean(busy)} onclick={() => void replaceUnusedCode(station)}>{t('Create new code')}</button>
                      {:else}
                        <span class="protected-code"><KeyRound size={13} />{t('Protected')}</span>
                      {/if}
                    </td>
                  {/if}
                  {#if shown('paired')}<td class="is-quiet">{stamp(station.createdAt)}</td>{/if}
                  {#if shown('last')}<td class="is-quiet">{stamp(station.lastUsedAt) || t('Never')}</td>{/if}
                  {#if shown('status')}<td>
                    <WorkspaceStatus
                      label={isOnline(station) ? 'Online' : station.lastUsedAt ? 'Offline' : 'Waiting for first connection'}
                      tone={isOnline(station) ? 'ok' : 'attention'}
                    />
                  </td>{/if}
                  <td class="chooser-col">
                    <WorkspaceRowMenu
                      disabled={workspace.isPreview || busy === station.id}
                      items={[
                        ...(!station.lastUsedAt && !pairingCodes[station.id]
                          ? [{ label: t('Create new pairing code'), onselect: () => void replaceUnusedCode(station) }]
                          : []),
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
              {#if pairingCodes[station.id]}
                <button class="mobile-code" type="button" onclick={() => void copyText(pairingCodes[station.id], 'Pairing code copied.')}><Copy size={14} />{t('Copy code')}</button>
              {:else if !station.lastUsedAt}
                <button class="mobile-code" type="button" onclick={() => void replaceUnusedCode(station)}>{t('Create code')}</button>
              {/if}
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

  <section class="phone-access" aria-labelledby="phone-access-title">
    <header>
      <div>
        <span class="phone-access__icon" aria-hidden="true"><Smartphone size={18} /></span>
        <div>
          <strong id="phone-access-title">{t('Phone clock access')}</strong>
          <span>{t('Choose exactly who receives Clock in or out in My time.')}</span>
        </div>
      </div>
      {#if !policy.employeeMobileBadgingEnabled}
        <span class="phone-access__note">{t('Turn on Employee phones above and save the badging rules first.')}</span>
      {:else if !ownerCanConfigure}
        <span class="phone-access__note">{t('Only an owner can change phone access.')}</span>
      {/if}
    </header>
    <div class="phone-list">
      {#if workspace.moduleLoading && !workspace.team}
        <div class="phone-empty">{t('Loading your workspace')}</div>
      {:else if !activeEmployees.length}
        <div class="phone-empty">{t('No active employees are ready for phone badging.')}</div>
      {:else}
        {#each activeEmployees as employee (employee.id)}
          {@const access = employeeAccess(employee.id)}
          {@const eligible = phoneEligible(employee.id)}
          <article>
            <span class="phone-avatar">{employee.display_name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span>
            <div>
              <strong>{employee.display_name}</strong>
              <span>{eligible ? t('Signed-in employee account') : t('Invite and enable badge access first')}</span>
            </div>
            <WorkspaceToggle
              checked={access?.mobile_badging_enabled === true}
              label={t('Phone clock')}
              disabled={!ownerCanConfigure || !policy.employeeMobileBadgingEnabled || !eligible || Boolean(mobileBusy)}
              onchange={(checked) => void toggleEmployeePhone(employee.id, checked)}
            />
          </article>
        {/each}
      {/if}
    </div>
  </section>
</WorkspacePage>

{#snippet pairFooter()}
  <ActionButton label={t('Cancel')} onclick={() => (pairOpen = false)} />
  <ActionButton label={busy === 'pair' ? t('Saving…') : t('Create pairing code')} tone="primary" disabled={Boolean(busy)} onclick={pair} />
{/snippet}

<Dialog
  open={pairOpen}
  title={t('Pair a device')}
  description={t('Name the device. Its one-time pairing code will appear in the device grid, ready to copy.')}
  size="small"
  onclose={() => (pairOpen = false)}
  footer={pairFooter}
>
  <label class="cl-label">
    <span>{t('Device name')}</span>
    <input class="cl-field" bind:value={pairLabel} placeholder={t('Bar tablet')} />
  </label>
  <p class="pair-help"><ExternalLink size={14} />{t('The other device enters this code at {url}.', { url: stationUrl() })}</p>
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
  .pairing-cell { max-width: 230px; }
  .pairing-code,
  .protected-code,
  .mobile-code,
  .inline-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 0;
    color: var(--cl-info);
    background: transparent;
    font: inherit;
    font-size: var(--rst-fs-caption);
  }
  .pairing-code,
  .mobile-code,
  .inline-link { cursor: pointer; }
  .pairing-code {
    max-width: 100%;
    padding: 5px 7px;
    border: 1px solid color-mix(in srgb, var(--cl-info) 22%, var(--cl-line));
    border-radius: 5px;
    background: color-mix(in srgb, var(--cl-info) 5%, var(--cl-surface));
  }
  .pairing-code code {
    overflow: hidden;
    font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pairing-code :global(svg) { flex: 0 0 auto; }
  .protected-code { color: var(--cl-muted); }
  .inline-link { padding: 3px 0; font-weight: var(--rst-fw-semibold); }
  .inline-link:disabled { cursor: default; opacity: .5; }
  .pair-help {
    display: flex;
    align-items: flex-start;
    gap: 7px;
    margin: 12px 0 0;
    color: var(--cl-muted);
    font-size: var(--rst-fs-caption);
    line-height: 1.5;
  }
  .pair-help :global(svg) { flex: 0 0 auto; margin-top: 2px; color: var(--cl-info); }
  .phone-access {
    overflow: hidden;
    border: 1px solid var(--cl-line);
    border-radius: var(--cl-radius);
    background: var(--cl-surface);
  }
  .phone-access > header {
    min-height: 58px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--cl-line);
    background: color-mix(in srgb, var(--cl-info) 4%, var(--cl-surface));
  }
  .phone-access > header > div,
  .phone-list article {
    display: grid;
    align-items: center;
  }
  .phone-access > header > div {
    grid-template-columns: auto minmax(0, 1fr);
    gap: 10px;
  }
  .phone-access > header > div > div,
  .phone-list article > div { min-width: 0; display: grid; gap: 2px; }
  .phone-access > header strong,
  .phone-list strong { color: var(--cl-data-text-strong); font-size: var(--rst-fs-body); }
  .phone-access > header span,
  .phone-list article > div span,
  .phone-access__note { color: var(--cl-muted); font-size: var(--rst-fs-caption); line-height: 1.4; }
  .phone-access__icon,
  .phone-avatar {
    display: grid;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--cl-info) 24%, var(--cl-line));
    color: var(--cl-info);
    background: color-mix(in srgb, var(--cl-info) 8%, var(--cl-surface));
  }
  .phone-access__icon { width: 32px; height: 32px; border-radius: 7px; }
  .phone-access__note { max-width: 360px; text-align: right; }
  .phone-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .phone-list article {
    min-height: 64px;
    grid-template-columns: 34px minmax(0, 1fr) auto;
    gap: 10px;
    padding: 10px 14px;
    border-right: 1px solid var(--cl-line);
    border-bottom: 1px solid var(--cl-line);
  }
  .phone-list article:nth-child(2n) { border-right: 0; }
  .phone-list article:nth-last-child(-n + 2) { border-bottom: 0; }
  .phone-avatar { width: 34px; height: 34px; border-radius: 50%; font-size: var(--rst-fs-caption); font-weight: var(--rst-fw-bold); }
  .phone-empty {
    grid-column: 1 / -1;
    min-height: 92px;
    display: grid;
    place-content: center;
    padding: 20px;
    color: var(--cl-muted);
    font-size: var(--rst-fs-body);
    text-align: center;
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
    .phone-access > header { align-items: flex-start; flex-direction: column; }
    .phone-access__note { text-align: left; }
    .phone-list { grid-template-columns: 1fr; }
    .phone-list article,
    .phone-list article:nth-child(2n),
    .phone-list article:nth-last-child(-n + 2) { border-right: 0; border-bottom: 1px solid var(--cl-line); }
    .phone-list article:last-child { border-bottom: 0; }
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
    .mobile-code { grid-column: 2 / 4; justify-self: start; padding: 2px 0; font-weight: var(--rst-fw-semibold); }
    .mobile-device__revoke {
      grid-column: 4;
      grid-row: 1;
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
