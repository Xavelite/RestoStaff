<script lang="ts">
  import { friendlyError } from '$lib/api/error-messages';
  import { WEEKDAYS } from '$lib/calendar/date';
  import { t } from '$lib/i18n/i18n.svelte';
  import { confirmAction } from '$lib/ui/confirm.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { useClassicRestaurantContext } from '$lib/classic/classic-workspace-context';
  import ClassicTablePanel from '$lib/classic/ClassicTablePanel.svelte';
  import { restaurantConfig } from '$lib/classic/classic-restaurant.svelte';
  import {
    LOGO_ACCEPT,
    removeRestaurantLogo,
    restaurantLogoUrl,
    uploadRestaurantLogo
  } from '$lib/restaurant/logo-api';

  let logoBusy = $state(false);
  let logoError = $state('');
  let logoVersion = $state(0);
  const snapshot = $derived(workspace.restaurant);
  const logoUrl = $derived.by(() => {
    const url = restaurantLogoUrl(snapshot?.restaurant.logo_path);
    return url && logoVersion ? `${url}?v=${logoVersion}` : url;
  });

  async function handleLogoChange(event: Event & { currentTarget: HTMLInputElement }) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file || !workspace.activeId || logoBusy) return;
    logoBusy = true;
    logoError = '';
    try {
      await uploadRestaurantLogo(workspace.activeId, file, snapshot?.restaurant.logo_path ?? null);
      await workspace.loadRestaurant(true);
      logoVersion = Date.now();
    } catch (error) {
      logoError = friendlyError(error);
    } finally {
      logoBusy = false;
    }
  }

  async function removeLogo() {
    if (!workspace.activeId || logoBusy) return;
    const confirmed = await confirmAction({
      title: 'Remove the restaurant logo?',
      body: 'Your badge terminal and paired devices go back to showing the restaurant name.',
      confirmLabel: 'Remove logo'
    });
    if (!confirmed) return;
    logoBusy = true;
    logoError = '';
    try {
      await removeRestaurantLogo(workspace.activeId, snapshot?.restaurant.logo_path ?? null);
      await workspace.loadRestaurant(true);
      logoVersion = Date.now();
    } catch (error) {
      logoError = friendlyError(error);
    } finally {
      logoBusy = false;
    }
  }

  const readRestaurantContext = useClassicRestaurantContext();
  const context = $derived(readRestaurantContext());
  const canManageLogo = $derived(workspace.effectiveRole === 'owner');
</script>

<svelte:head><title>{t('Restaurant profile')} &middot; restogogo</title></svelte:head>

{#if context}
  {@const draft = context.draft}
  {@const lunchDays = draft.opening.filter((day) => day.lunchOpen).length}
  {@const eveningDays = draft.opening.filter((day) => day.eveningOpen).length}
  <ClassicTablePanel
    dirty={context.dirty}
    saving={context.saving}
    canSave={context.canSave}
    onsave={() => void context.save().catch(() => undefined)}
    ondiscard={context.discard}
  >
    {#snippet meta()}
      <span>{draft.displayName || t('Restaurant profile')}</span>
      <span><i class="dot is-lunch"></i>{t('{count} lunch days', { count: lunchDays })}</span>
      <span><i class="dot is-evening"></i>{t('{count} evening days', { count: eveningDays })}</span>
    {/snippet}
    {#snippet children()}
      <div class="restaurant-workspace">
        <section class="cl-card profile-card">
          <div class="profile-layout">
            <section class="brand-panel" aria-label={t('Restaurant identity')}>
              <div class="brand-panel__top">
                <div class="logo-field__preview" class:is-empty={!logoUrl}>
                  {#if logoUrl}
                    <img src={logoUrl} alt={t('Restaurant logo')} />
                  {:else}
                    <span aria-hidden="true">{(draft.displayName || 'R').charAt(0).toUpperCase()}</span>
                  {/if}
                </div>
                <div class="brand-panel__copy">
                  <strong>{draft.displayName || t('Restaurant profile')}</strong>
                  <small>{t('Restaurant identity')}</small>
                </div>
              </div>

              <div class="brand-panel__meta">
                <span>{t('Belgium')}</span>
                <span>{snapshot?.restaurant_settings.timezone || 'Europe/Brussels'}</span>
                <span>{snapshot?.restaurant_settings.currency_code || 'EUR'}</span>
              </div>

              {#if canManageLogo}
                <div class="logo-field__actions">
                  <input id="restaurant-logo-input" type="file" accept={LOGO_ACCEPT} disabled={logoBusy} onchange={handleLogoChange} />
                  <label class="cl-btn" for="restaurant-logo-input">{t(logoBusy ? 'Uploading…' : logoUrl ? 'Replace' : 'Upload logo')}</label>
                  {#if logoUrl}
                    <button class="cl-btn is-icon" type="button" disabled={logoBusy} title={t('Remove logo')} aria-label={t('Remove logo')} onclick={removeLogo}>×</button>
                  {/if}
                </div>
              {/if}
              {#if logoError}<em class="logo-error">{logoError}</em>{/if}
            </section>

            <div class="profile-details">
              <section class="profile-section">
                <div class="profile-section__head">
                  <span class="section-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20v-9l8-6 8 6v9"/><path d="M9 20v-6h6v6"/></svg>
                  </span>
                  <strong>{t('Identity and contact')}</strong>
                </div>
                <div class="form is-identity">
                  <label class="cl-label">
                    <span>{t('Display name')}</span>
                    <input class="cl-field" bind:value={draft.displayName} oninput={() => restaurantConfig.touch()} />
                  </label>
                  <label class="cl-label">
                    <span>{t('Email')}</span>
                    <input class="cl-field" type="email" bind:value={draft.email} oninput={() => restaurantConfig.touch()} />
                  </label>
                  <label class="cl-label">
                    <span>{t('Phone')}</span>
                    <input class="cl-field" bind:value={draft.phone} oninput={() => restaurantConfig.touch()} />
                  </label>
                </div>
              </section>

              <section class="profile-section">
                <div class="profile-section__head">
                  <span class="section-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.4"/></svg>
                  </span>
                  <strong>{t('Address')}</strong>
                </div>
                <div class="form is-address">
                  <label class="cl-label">
                    <span>{t('Street and number')}</span>
                    <input class="cl-field" bind:value={draft.address} oninput={() => restaurantConfig.touch()} />
                  </label>
                  <label class="cl-label">
                    <span>{t('Postal code')}</span>
                    <input class="cl-field" bind:value={draft.postalCode} oninput={() => restaurantConfig.touch()} />
                  </label>
                  <label class="cl-label">
                    <span>{t('City')}</span>
                    <input class="cl-field" bind:value={draft.city} oninput={() => restaurantConfig.touch()} />
                  </label>
                </div>
              </section>
            </div>
          </div>
        </section>

        <section class="cl-card hours-card">
          <div class="cl-tablewrap hours-wrap">
            <table class="cl-table hours-table">
              <thead>
                <tr>
                  <th>{t('Day')}</th>
                  <th>
                    <span class="service-heading">
                      <i class="is-lunch"></i>
                      <span>{t('Lunch')}<small>{t('{count} lunch days', { count: lunchDays })}</small></span>
                    </span>
                  </th>
                  <th>
                    <span class="service-heading">
                      <i class="is-evening"></i>
                      <span>{t('Evening')}<small>{t('{count} evening days', { count: eveningDays })}</small></span>
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {#each draft.opening as day (day.weekday)}
                  <tr>
                    <td class="day">{t(WEEKDAYS[day.weekday - 1])}</td>
                    <td>
                      <span class="service-hours">
                        <label class="switch compact">
                          <input type="checkbox" disabled={!context.canSave} bind:checked={day.lunchOpen} onchange={() => restaurantConfig.touch()} />
                          <span>{t(day.lunchOpen ? 'Open' : 'Closed')}</span>
                        </label>
                        <span class="range">
                          <input class="cl-field time" type="time" disabled={!context.canSave || !day.lunchOpen} bind:value={day.lunchStart} oninput={() => restaurantConfig.touch()} />
                          <i>&ndash;</i>
                          <input class="cl-field time" type="time" disabled={!context.canSave || !day.lunchOpen} bind:value={day.lunchEnd} oninput={() => restaurantConfig.touch()} />
                        </span>
                      </span>
                    </td>
                    <td>
                      <span class="service-hours">
                        <label class="switch compact">
                          <input type="checkbox" disabled={!context.canSave} bind:checked={day.eveningOpen} onchange={() => restaurantConfig.touch()} />
                          <span>{t(day.eveningOpen ? 'Open' : 'Closed')}</span>
                        </label>
                        <span class="range">
                          <input class="cl-field time" type="time" disabled={!context.canSave || !day.eveningOpen} bind:value={day.eveningStart} oninput={() => restaurantConfig.touch()} />
                          <i>&ndash;</i>
                          <input class="cl-field time" type="time" disabled={!context.canSave || !day.eveningOpen} bind:value={day.eveningEnd} oninput={() => restaurantConfig.touch()} />
                        </span>
                      </span>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    {/snippet}
  </ClassicTablePanel>
{/if}

<style>
  .restaurant-workspace {
    min-width: 0;
    display: grid;
    grid-auto-rows: max-content;
    align-content: start;
    gap: 10px;
    padding: 10px;
    background: var(--cl-bg);
  }

  .profile-card,
  .hours-card {
    min-width: 0;
    overflow: hidden;
    border-color: var(--cl-line-strong);
  }

  .profile-layout {
    min-width: 0;
    display: grid;
    grid-template-columns: 224px minmax(0, 1fr);
  }

  .brand-panel {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 16px;
    border-right: 1px solid var(--cl-line);
    background: linear-gradient(
      145deg,
      color-mix(in srgb, var(--cl-accent) 7%, var(--cl-surface-muted)),
      var(--cl-surface-muted) 68%
    );
    box-shadow: inset 3px 0 0 var(--cl-accent);
  }

  .brand-panel__top {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 11px;
  }

  .brand-panel__copy {
    min-width: 0;
    display: grid;
    gap: 3px;
  }

  .brand-panel__copy strong {
    overflow: hidden;
    font-size: 14px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .brand-panel__copy small {
    color: var(--cl-muted);
    font-size: 10.5px;
  }

  .brand-panel__meta {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 10px;
    color: var(--cl-muted);
    font-size: 10px;
  }

  .brand-panel__meta span {
    position: relative;
  }

  .brand-panel__meta span + span::before {
    content: '';
    position: absolute;
    left: -6px;
    top: 50%;
    width: 2px;
    height: 2px;
    border-radius: 50%;
    background: var(--cl-line-strong);
  }

  .profile-details {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1.15fr) minmax(0, .85fr);
  }

  .profile-section {
    min-width: 0;
    display: grid;
    align-content: start;
    gap: 10px;
    padding: 14px 16px 16px;
  }

  .profile-section + .profile-section {
    border-left: 1px solid var(--cl-line);
  }

  .profile-section__head {
    display: flex;
    align-items: center;
    gap: 7px;
    min-height: 22px;
  }

  .profile-section__head strong {
    font-size: 11px;
    letter-spacing: .02em;
  }

  .section-icon {
    width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--cl-accent) 20%, var(--cl-line));
    border-radius: 6px;
    background: color-mix(in srgb, var(--cl-accent) 7%, var(--cl-surface));
    color: var(--cl-accent);
  }

  .form {
    display: grid;
    gap: 9px;
  }

  .form.is-identity {
    grid-template-columns: minmax(150px, 1fr) minmax(180px, 1.15fr) minmax(128px, .75fr);
  }

  .form.is-address {
    grid-template-columns: minmax(150px, 1.3fr) minmax(92px, .55fr) minmax(120px, .85fr);
  }

  .profile-details :global(.cl-label > span) {
    color: color-mix(in srgb, var(--cl-ink) 70%, var(--cl-muted));
    font-size: 9.5px;
    font-weight: var(--rst-fw-bold);
    letter-spacing: .035em;
    text-transform: uppercase;
  }

  .profile-details :global(.cl-field) {
    min-height: 35px;
    padding-inline: 10px;
    border-color: color-mix(in srgb, var(--cl-line-strong) 82%, transparent);
    background: color-mix(in srgb, var(--cl-surface-muted) 62%, var(--cl-surface));
    font-size: 12px;
  }

  .profile-details :global(.cl-field:hover) {
    border-color: color-mix(in srgb, var(--cl-accent) 34%, var(--cl-line-strong));
    background: var(--cl-surface);
  }

  .profile-details :global(.cl-field:focus) {
    border-color: var(--cl-accent);
    background: var(--cl-surface);
    outline: 2px solid color-mix(in srgb, var(--cl-accent) 12%, transparent);
    outline-offset: 1px;
  }

  .logo-field__preview {
    flex: 0 0 auto;
    width: 46px;
    height: 46px;
    display: grid;
    place-items: center;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--cl-accent) 26%, var(--cl-line));
    border-radius: var(--cl-radius);
    background: color-mix(in srgb, var(--cl-accent) 8%, var(--cl-surface));
    color: var(--cl-accent);
    font-size: 19px;
    font-weight: var(--rst-fw-display);
  }

  .logo-field__preview img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .logo-field__actions {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: auto;
  }

  .logo-field__actions input {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }

  .logo-field__actions .cl-btn:not(.is-icon) {
    flex: 1;
    justify-content: center;
  }

  .logo-error {
    color: var(--cl-problem);
    font-size: 10px;
    font-style: normal;
    line-height: 1.35;
  }

  .hours-wrap {
    max-height: none;
    overflow: hidden;
    scrollbar-gutter: auto;
  }

  .hours-table {
    width: 100%;
    min-width: 0;
    table-layout: fixed;
  }

  .hours-table :global(thead th) {
    height: 42px;
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--cl-accent) 6%, var(--cl-surface-muted)),
      color-mix(in srgb, var(--cl-accent) 2%, var(--cl-surface-muted))
    );
    box-shadow: 0 1px 0 var(--cl-line-strong);
  }

  .hours-table :global(thead th:first-child) {
    width: 16%;
  }

  .hours-table :global(tbody td) {
    height: 48px;
    padding-top: 6px;
    padding-bottom: 6px;
  }

  .hours-table :global(tbody tr:nth-child(even) td) {
    background: color-mix(in srgb, var(--cl-surface-muted) 48%, var(--cl-surface));
  }

  .hours-table :global(tbody tr:hover td) {
    background: color-mix(in srgb, var(--cl-accent) 4%, var(--cl-surface-muted));
  }

  .day {
    color: color-mix(in srgb, var(--cl-ink) 84%, var(--cl-muted));
    font-size: 12px;
    font-weight: var(--rst-fw-bold);
  }

  .service-hours {
    display: grid;
    grid-template-columns: 62px minmax(0, 224px);
    align-items: center;
    justify-content: start;
    gap: 9px;
  }

  .switch {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    color: var(--cl-muted);
    font-size: 10.5px;
    cursor: pointer;
  }

  .switch:has(input:checked) {
    color: var(--cl-ink);
  }

  .switch input {
    width: 28px;
    height: 16px;
    flex: 0 0 auto;
    appearance: none;
    border: 1px solid var(--cl-line-strong);
    border-radius: 999px;
    background: radial-gradient(circle at 7px 50%, var(--cl-surface) 0 4px, transparent 5px), var(--cl-line-strong);
    cursor: pointer;
    transition: background .15s ease, border-color .15s ease;
  }

  .switch input:checked {
    border-color: var(--cl-accent);
    background: radial-gradient(circle at calc(100% - 7px) 50%, white 0 4px, transparent 5px), var(--cl-accent);
  }

  .switch input:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--cl-accent) 22%, transparent);
    outline-offset: 2px;
  }

  .range {
    display: inline-grid;
    grid-template-columns: minmax(64px, 1fr) auto minmax(64px, 1fr);
    align-items: center;
    gap: 5px;
  }

  .range i {
    color: var(--cl-muted);
    font-style: normal;
    text-align: center;
  }

  .time {
    width: 100%;
    min-width: 0;
    min-height: 34px;
    padding: 6px 8px;
    border-color: transparent;
    background: color-mix(in srgb, var(--cl-surface-muted) 76%, var(--cl-surface));
    font-size: 12px;
    font-weight: var(--rst-fw-medium);
    font-variant-numeric: tabular-nums;
    text-align: center;
  }

  .time:hover:not(:disabled),
  .time:focus {
    border-color: color-mix(in srgb, var(--cl-accent) 40%, var(--cl-line-strong));
    background: var(--cl-surface);
  }

  .service-heading {
    display: inline-flex;
    align-items: center;
    gap: 9px;
  }

  .service-heading > span {
    display: grid;
    gap: 1px;
  }

  .service-heading small {
    color: var(--cl-muted);
    font-size: 9px;
    font-weight: var(--rst-fw-regular);
  }

  .service-heading i,
  .dot {
    width: 7px;
    height: 7px;
    display: inline-block;
    border-radius: 50%;
    background: var(--cl-line-strong);
  }

  .service-heading i.is-lunch,
  .dot.is-lunch {
    background: var(--cl-lunch);
    box-shadow: 0 0 0 3px var(--cl-lunch-wash);
  }

  .service-heading i.is-evening,
  .dot.is-evening {
    background: var(--cl-evening);
    box-shadow: 0 0 0 3px var(--cl-evening-wash);
  }

  @media (max-width: 1180px) {
    .profile-layout {
      grid-template-columns: 190px minmax(0, 1fr);
    }

    .profile-details {
      grid-template-columns: minmax(0, 1fr);
    }

    .profile-section + .profile-section {
      border-top: 1px solid var(--cl-line);
      border-left: 0;
    }

    .form.is-identity,
    .form.is-address {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .service-hours {
      grid-template-columns: 56px minmax(0, 190px);
      gap: 7px;
    }
  }

  @media (max-width: 760px) {
    .restaurant-workspace {
      padding: 8px;
    }

    .profile-layout {
      grid-template-columns: minmax(0, 1fr);
    }

    .brand-panel {
      border-right: 0;
      border-bottom: 1px solid var(--cl-line);
    }

    .form.is-identity,
    .form.is-address {
      grid-template-columns: minmax(0, 1fr);
    }

    .hours-table {
      min-width: 650px;
    }
  }
</style>
