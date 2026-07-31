<script lang="ts">
  import { ExternalLink, Globe2, MapPin, Search } from '@lucide/svelte';
  import { onDestroy } from 'svelte';
  import { friendlyError } from '$lib/api/error-messages';
  import { WEEKDAYS, type ServiceKey } from '$lib/calendar/date';
  import { t } from '$lib/i18n/i18n.svelte';
  import { confirmAction } from '$lib/ui/confirm.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { useWorkspaceRestaurantContext } from '$lib/workspace-ui/workspace-context';
  import WorkspaceTablePanel from '$lib/workspace-ui/WorkspaceTablePanel.svelte';
  import { restaurantConfig } from '$lib/workspace-ui/workspace-restaurant.svelte';
  import WorkspaceService from '$lib/workspace-ui/WorkspaceService.svelte';
  import WorkspaceServiceIcon from '$lib/workspace-ui/WorkspaceServiceIcon.svelte';
  import WorkspaceTimeRange from '$lib/workspace-ui/WorkspaceTimeRange.svelte';
  import {
    LOGO_ACCEPT,
    removeRestaurantLogo,
    restaurantLogoUrl,
    uploadRestaurantLogo
  } from '$lib/restaurant/logo-api';
  import {
    osmEmbedUrl,
    osmLocationUrl,
    restaurantAddressQuery,
    searchBelgianRestaurantAddress,
    type RestaurantAddressCandidate
  } from '$lib/restaurant/address-geocoding';

  let logoBusy = $state(false);
  let logoError = $state('');
  let logoVersion = $state(0);
  let locationBusy = $state(false);
  let locationError = $state('');
  let locationCandidates = $state<RestaurantAddressCandidate[]>([]);
  let addressSearchTimer: ReturnType<typeof setTimeout> | undefined;
  let locationRequest = 0;
  const snapshot = $derived(workspace.restaurant);
  const logoUrl = $derived.by(() => {
    const url = restaurantLogoUrl(snapshot?.restaurant.logo_path);
    return url && logoVersion ? `${url}?v=${logoVersion}` : url;
  });

  onDestroy(() => {
    clearTimeout(addressSearchTimer);
    locationRequest += 1;
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

  const readRestaurantContext = useWorkspaceRestaurantContext();
  const context = $derived(readRestaurantContext());
  const canManageLogo = $derived(workspace.canManageOperations);
  const resolvedLocation = $derived.by(() => {
    const draft = context?.draft;
    if (
      !draft ||
      draft.locationLatitude == null ||
      draft.locationLongitude == null
    ) return null;
    return {
      latitude: draft.locationLatitude,
      longitude: draft.locationLongitude,
      label: draft.locationLabel
    };
  });

  function touchAddress() {
    if (!context) return;
    context.draft.locationLatitude = null;
    context.draft.locationLongitude = null;
    context.draft.locationLabel = '';
    locationCandidates = [];
    locationError = '';
    restaurantConfig.touch();
    clearTimeout(addressSearchTimer);
    const hasEnoughAddress =
      context.draft.address.trim().length >= 4 &&
      (context.draft.postalCode.trim().length >= 3 ||
        context.draft.city.trim().length >= 2);
    if (hasEnoughAddress) {
      addressSearchTimer = setTimeout(() => void locateRestaurant(true), 650);
    }
  }

  async function locateRestaurant(automatic = false) {
    if (!context) return;
    const query = restaurantAddressQuery({
      restaurantName: context.draft.displayName,
      street: context.draft.address,
      postalCode: context.draft.postalCode,
      city: context.draft.city
    });
    const request = ++locationRequest;
    locationBusy = true;
    locationError = '';
    locationCandidates = [];
    try {
      const candidates = await searchBelgianRestaurantAddress(query);
      if (request !== locationRequest) return;
      locationCandidates = candidates;
      if (!candidates.length && !automatic) {
        locationError = t('No matching Belgian address was found.');
      }
    } catch {
      if (request === locationRequest) {
        locationError = t('The address service is unavailable. Try again shortly.');
      }
    } finally {
      if (request === locationRequest) locationBusy = false;
    }
  }

  function selectLocation(candidate: RestaurantAddressCandidate) {
    if (!context) return;
    if (candidate.street) context.draft.address = candidate.street;
    if (candidate.postalCode) context.draft.postalCode = candidate.postalCode;
    if (candidate.city) context.draft.city = candidate.city;
    context.draft.locationLatitude = candidate.latitude;
    context.draft.locationLongitude = candidate.longitude;
    context.draft.locationLabel = candidate.displayName;
    locationCandidates = [];
    locationError = '';
    restaurantConfig.touch();
  }

  function serviceOpenDays(
    opening: NonNullable<typeof context>['draft']['opening'],
    serviceKey: ServiceKey
  ): number {
    return opening.filter((day) => day.services[serviceKey]?.open).length;
  }

  function addServicePeriod() {
    if (!context) return;
    const index = context.draft.services.length + 1;
    let serviceKey = `service-${index}`;
    while (context.draft.services.some((service) => service.serviceKey === serviceKey)) {
      serviceKey = `service-${Number(serviceKey.split('-').at(-1) || index) + 1}`;
    }
    context.draft.services = [
      ...context.draft.services,
      {
        id: crypto.randomUUID(),
        serviceKey,
        name: `Service ${index}`,
        active: true,
        sortOrder: index - 1,
        defaultStart: '09:00',
        defaultEnd: '17:00'
      }
    ];
    for (const day of context.draft.opening) {
      day.services[serviceKey] = { open: false, start: '09:00', end: '17:00' };
    }
    for (const area of context.draft.areas) {
      area.serviceHours[serviceKey] = { start: '', end: '' };
    }
    restaurantConfig.touch();
  }

  function restoreDayNightStarter() {
    if (!context) return;
    const starters = [
      {
        serviceKey: 'lunch',
        name: 'Day',
        defaultStart: '12:00',
        defaultEnd: '15:00'
      },
      {
        serviceKey: 'evening',
        name: 'Night',
        defaultStart: '18:00',
        defaultEnd: '23:00'
      }
    ];
    const existingByKey = new Map(
      context.draft.services.map((service) => [service.serviceKey, service])
    );
    const restored = starters.map((starter, index) => {
      const existing = existingByKey.get(starter.serviceKey);
      const legacyName = existing?.name.trim().toLowerCase();
      return {
        id: existing?.id ?? crypto.randomUUID(),
        serviceKey: starter.serviceKey,
        name:
          !existing ||
          legacyName === 'lunch' ||
          legacyName === 'evening' ||
          legacyName === 'day' ||
          legacyName === 'night'
            ? starter.name
            : existing.name,
        active: true,
        sortOrder: index,
        defaultStart: existing?.defaultStart || starter.defaultStart,
        defaultEnd: existing?.defaultEnd || starter.defaultEnd
      };
    });
    const remaining = context.draft.services
      .filter((service) => !starters.some((starter) => starter.serviceKey === service.serviceKey))
      .map((service, index) => ({ ...service, sortOrder: index + restored.length }));
    context.draft.services = [...restored, ...remaining];

    for (const [starterIndex, starter] of starters.entries()) {
      for (const [dayIndex, day] of context.draft.opening.entries()) {
        day.services[starter.serviceKey] ??= {
          open: dayIndex < 6,
          start: starter.defaultStart,
          end: starter.defaultEnd
        };
      }
      for (const area of context.draft.areas) {
        area.serviceHours[starter.serviceKey] ??= {
          start: starter.defaultStart,
          end: starter.defaultEnd
        };
      }
      restored[starterIndex].sortOrder = starterIndex;
    }
    restaurantConfig.touch();
  }
</script>

<svelte:head><title>{t('Restaurant profile')} &middot; restogogo</title></svelte:head>

{#if context}
  {@const draft = context.draft}
  {@const activeServices = draft.services.filter((service) => service.active)}
  {@const starterNeedsRestore = ['lunch', 'evening'].some((key) => {
    const service = draft.services.find((item) => item.serviceKey === key);
    return !service?.active || ['lunch', 'evening'].includes(service.name.trim().toLowerCase());
  })}
  <WorkspaceTablePanel
    dirty={context.dirty}
    saving={context.saving}
    canSave={context.canSave}
    onsave={() => void context.save().catch(() => undefined)}
    ondiscard={context.discard}
  >
    {#snippet meta()}
      {#each activeServices as service (service.serviceKey)}
        <span class="svc-meta is-{service.serviceKey}">
          <WorkspaceServiceIcon service={service.serviceKey} size={13} />
          <strong>{service.name}</strong>
          <span>{serviceOpenDays(draft.opening, service.serviceKey)} {t('open days')}</span>
        </span>
      {/each}
    {/snippet}
    {#snippet children()}
      <div class="restaurant-workspace">
        <section class="cl-card identity-card">
          <div class="identity-head">
            <div class="logo-tile" class:is-empty={!logoUrl}>
              {#if logoUrl}
                <img src={logoUrl} alt={t('Restaurant logo')} />
              {:else}
                <span aria-hidden="true">{(draft.displayName || 'R').charAt(0).toUpperCase()}</span>
              {/if}
            </div>

            <div class="identity-head__main">
              <input
                class="name-field"
                aria-label={t('Display name')}
                placeholder={t('Restaurant name')}
                bind:value={draft.displayName}
                oninput={() => restaurantConfig.touch()}
              />
              <div class="identity-head__meta">
                <span>{t('Belgium')}</span>
                <span>{snapshot?.restaurant_settings.timezone || 'Europe/Brussels'}</span>
                <span>{snapshot?.restaurant_settings.currency_code || 'EUR'}</span>
              </div>
            </div>

            {#if canManageLogo}
              <div class="logo-actions">
                <input id="restaurant-logo-input" type="file" accept={LOGO_ACCEPT} disabled={logoBusy} onchange={handleLogoChange} />
                <label class="cl-btn" for="restaurant-logo-input">{t(logoBusy ? 'Uploading…' : logoUrl ? 'Replace' : 'Upload logo')}</label>
                {#if logoUrl}
                  <button class="cl-btn is-icon" type="button" disabled={logoBusy} title={t('Remove logo')} aria-label={t('Remove logo')} onclick={removeLogo}>×</button>
                {/if}
              </div>
            {/if}
          </div>

          {#if logoError}<em class="logo-error">{logoError}</em>{/if}

          <div class="identity-fields">
            <section class="field-group">
              <span class="field-group__title">{t('Contact')}</span>
              <div class="field-row is-contact">
                <label class="cl-label">
                  <span>{t('Email')}</span>
                  <input class="cl-field" type="email" bind:value={draft.email} oninput={() => restaurantConfig.touch()} />
                </label>
                <label class="cl-label">
                  <span>{t('Phone')}</span>
                  <input class="cl-field" bind:value={draft.phone} oninput={() => restaurantConfig.touch()} />
                </label>
                <label class="cl-label">
                  <span>{t('Website')}</span>
                  <span class="input-with-icon">
                    <Globe2 size={14} aria-hidden="true" />
                    <input
                      class="cl-field"
                      type="url"
                      placeholder="https://"
                      bind:value={draft.websiteUrl}
                      oninput={() => restaurantConfig.touch()}
                    />
                  </span>
                </label>
              </div>
            </section>

            <section class="field-group">
              <div class="field-group__head">
                <span class="field-group__title">{t('Location')}</span>
                {#if locationBusy}
                  <span class="location-state is-searching">
                    <Search size={13} aria-hidden="true" />
                    {t('Searching address…')}
                  </span>
                {:else if resolvedLocation}
                  <span class="location-state is-confirmed">
                    <MapPin size={13} aria-hidden="true" />
                    {t('Location confirmed')}
                  </span>
                {:else if locationError}
                  <button
                    class="location-state is-retry"
                    type="button"
                    disabled={!draft.address.trim() && !draft.city.trim()}
                    onclick={() => void locateRestaurant()}
                  >
                    <Search size={13} aria-hidden="true" />
                    {t('Try address search again')}
                  </button>
                {:else}
                  <span class="location-state">
                    <Search size={13} aria-hidden="true" />
                    {t('Address lookup is automatic')}
                  </span>
                {/if}
              </div>
              <div class="location-layout">
                <div class="location-fields">
                  <div class="field-row is-address">
                    <label class="cl-label">
                      <span>{t('Street and number')}</span>
                      <input class="cl-field" autocomplete="street-address" bind:value={draft.address} oninput={touchAddress} />
                    </label>
                    <div class="address-lower">
                      <label class="cl-label">
                        <span>{t('Postal code')}</span>
                        <input class="cl-field" autocomplete="postal-code" bind:value={draft.postalCode} oninput={touchAddress} />
                      </label>
                      <label class="cl-label">
                        <span>{t('City')}</span>
                        <input class="cl-field" autocomplete="address-level2" bind:value={draft.city} oninput={touchAddress} />
                      </label>
                      <label class="cl-label">
                        <span>{t('Country')}</span>
                        <input class="cl-field" value={t('Belgium')} disabled />
                      </label>
                    </div>
                  </div>

                  {#if locationCandidates.length}
                    <div class="location-results" aria-label={t('Address matches')}>
                      {#each locationCandidates as candidate}
                        <button type="button" onclick={() => selectLocation(candidate)}>
                          <MapPin size={14} aria-hidden="true" />
                          <span>{candidate.displayName}</span>
                        </button>
                      {/each}
                    </div>
                  {:else if locationError}
                    <p class="location-error">{locationError}</p>
                  {:else}
                    <p class="location-help">{t('Start typing the address. Matching Belgian locations appear automatically.')}</p>
                  {/if}
                </div>

                <div class="location-map" class:is-empty={!resolvedLocation}>
                  {#if resolvedLocation}
                    <iframe
                      title={t('Restaurant location')}
                      src={osmEmbedUrl(resolvedLocation.latitude, resolvedLocation.longitude)}
                      loading="lazy"
                      referrerpolicy="strict-origin-when-cross-origin"
                    ></iframe>
                    <div class="location-map__footer">
                      <span title={resolvedLocation.label}>
                        <MapPin size={13} aria-hidden="true" />
                        {t('Location confirmed')}
                      </span>
                      <a
                        href={osmLocationUrl(resolvedLocation.latitude, resolvedLocation.longitude)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t('Open map')}
                        <ExternalLink size={12} aria-hidden="true" />
                      </a>
                    </div>
                  {:else}
                    <div class="location-map__empty">
                      <span><MapPin size={22} aria-hidden="true" /></span>
                      <strong>{t('Pin the restaurant')}</strong>
                      <small>{t('Confirm the address to show its real location here.')}</small>
                    </div>
                  {/if}
                  <a class="map-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
                    © OpenStreetMap
                  </a>
                </div>
              </div>
            </section>
          </div>
        </section>

        <section class="cl-card hours-card">
          <div class="cl-card__head">
            <h3>{t('Opening hours')}</h3>
            {#if context.canSave}
              <div class="hours-actions">
                {#if starterNeedsRestore}
                  <button class="cl-btn" type="button" onclick={restoreDayNightStarter}>
                    {t('Use Day & Night starter')}
                  </button>
                {/if}
                <button class="cl-btn" type="button" onclick={addServicePeriod}>
                  {t('Add service period')}
                </button>
              </div>
            {/if}
          </div>
          <div class="service-periods" aria-label={t('Service periods')}>
            {#each draft.services as service (service.serviceKey)}
              <div class="service-period" class:is-inactive={!service.active}>
                <span class="service-period__icon is-{service.serviceKey}">
                  <WorkspaceServiceIcon service={service.serviceKey} size={15} />
                </span>
                <label>
                  <span>{t('Name')}</span>
                  <input
                    class="cl-field"
                    disabled={!context.canSave}
                    bind:value={service.name}
                    oninput={() => restaurantConfig.touch()}
                  />
                </label>
                <WorkspaceTimeRange
                  bind:start={service.defaultStart}
                  bind:end={service.defaultEnd}
                  startLabel={t('Default start')}
                  endLabel={t('Default end')}
                  disabled={!context.canSave}
                  onchange={() => restaurantConfig.touch()}
                />
                <label class="switch compact service-period__state">
                  <input
                    type="checkbox"
                    disabled={!context.canSave || (service.active && activeServices.length === 1)}
                    bind:checked={service.active}
                    onchange={() => restaurantConfig.touch()}
                  />
                  <span>{t(service.active ? 'Active' : 'Inactive')}</span>
                </label>
              </div>
            {/each}
          </div>
          <div class="cl-tablewrap hours-wrap">
            <table
              class="cl-table hours-table"
              style:min-width={`${180 + WEEKDAYS.length * 156}px`}
            >
              <thead>
                <tr>
                  <th>{t('Service')}</th>
                  {#each WEEKDAYS as weekday}
                    <th>{t(weekday)}</th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                {#each activeServices as service (service.serviceKey)}
                  <tr>
                    <td class="service-row">
                      <WorkspaceService
                        service={service.serviceKey}
                        label={service.name}
                        variant="text"
                      />
                      <small>{service.defaultStart}&ndash;{service.defaultEnd}</small>
                    </td>
                    {#each WEEKDAYS as _, weekdayIndex}
                      {@const day = draft.opening.find((candidate) => candidate.weekday === weekdayIndex + 1)}
                      {@const period = day?.services[service.serviceKey]}
                      <td>
                        {#if period}
                          <span class="day-hours" class:is-closed={!period.open}>
                            <label class="switch compact">
                              <input
                                type="checkbox"
                                disabled={!context.canSave}
                                bind:checked={period.open}
                                onchange={() => restaurantConfig.touch()}
                              />
                              <span>{t(period.open ? 'Open' : 'Closed')}</span>
                            </label>
                            <WorkspaceTimeRange
                              bind:start={period.start}
                              bind:end={period.end}
                              startAriaLabel={`${service.name} ${t(WEEKDAYS[weekdayIndex])} ${t('Start')}`}
                              endAriaLabel={`${service.name} ${t(WEEKDAYS[weekdayIndex])} ${t('End')}`}
                              disabled={!context.canSave || !period.open}
                              compact
                              onchange={() => restaurantConfig.touch()}
                            />
                          </span>
                        {:else}
                          <span class="day-hours is-closed">
                            <span>{t('Not configured')}</span>
                          </span>
                        {/if}
                      </td>
                    {/each}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    {/snippet}
  </WorkspaceTablePanel>
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

  .identity-card,
  .hours-card {
    min-width: 0;
    overflow: hidden;
    border-color: var(--cl-line-strong);
  }
  .hours-actions {
    display: flex;
    align-items: center;
    gap: 7px;
  }

  /* The restaurant leads with its own name and mark, so the identity reads as a
     heading rather than as one more form field competing with the others. */
  .identity-head {
    min-width: 0;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 14px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--cl-line);
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--cl-accent) 4%, var(--cl-surface)),
      var(--cl-surface) 78%
    );
  }

  .identity-head__main {
    min-width: 0;
    display: grid;
    gap: 3px;
  }

  .logo-tile {
    flex: 0 0 auto;
    width: 54px;
    height: 54px;
    display: grid;
    place-items: center;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--cl-accent) 22%, var(--cl-line));
    border-radius: var(--cl-radius);
    background: color-mix(in srgb, var(--cl-accent) 7%, var(--cl-surface));
    color: var(--cl-accent);
    font-size: var(--rst-fs-heading);
    font-weight: var(--rst-fw-display);
  }

  .logo-tile img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  /* Quiet until touched, like every editable cell in the workspace grids. */
  .name-field {
    min-width: 0;
    width: 100%;
    margin: -4px -8px;
    padding: 4px 8px;
    border: 1px solid transparent;
    border-radius: 7px;
    outline: 0;
    color: var(--cl-ink);
    background: transparent;
    font: inherit;
    font-size: var(--rst-fs-title-lg);
    font-weight: var(--rst-fw-display);
    text-overflow: ellipsis;
    transition: border-color var(--cl-dur) var(--cl-ease), background var(--cl-dur) var(--cl-ease);
  }

  .name-field:hover {
    border-color: var(--cl-line);
    background: var(--cl-surface-muted);
  }

  .name-field:focus {
    border-color: var(--cl-accent);
    background: var(--cl-surface);
    box-shadow: 0 0 0 2px var(--cl-accent-wash);
  }

  .identity-head__meta {
    display: flex;
    flex-wrap: wrap;
    gap: 3px 12px;
    color: var(--cl-muted);
    font-size: var(--rst-fs-label);
  }

  .identity-head__meta span {
    position: relative;
  }

  .identity-head__meta span + span::before {
    content: '';
    position: absolute;
    left: -7px;
    top: 50%;
    width: 2px;
    height: 2px;
    border-radius: 50%;
    background: var(--cl-line-strong);
  }

  .logo-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .logo-actions input {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }

  .identity-fields {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(290px, .62fr) minmax(0, 1.38fr);
  }

  .field-group {
    min-width: 0;
    display: grid;
    align-content: start;
    gap: 9px;
    padding: 14px 16px 16px;
  }

  .field-group + .field-group {
    border-left: 1px solid var(--cl-line);
  }

  .field-group__title {
    color: var(--cl-muted);
    font-size: var(--rst-fs-caption);
    font-weight: var(--rst-fw-bold);
    letter-spacing: .06em;
    text-transform: uppercase;
  }
  .field-group__head {
    min-height: 30px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .location-state {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 28px;
    padding: 0;
    border: 0;
    color: var(--cl-muted);
    background: transparent;
    font: inherit;
    font-size: var(--rst-fs-label);
  }
  .location-state.is-searching :global(svg) {
    animation: location-pulse 1s ease-in-out infinite alternate;
  }
  .location-state.is-confirmed {
    color: var(--cl-ok);
    font-weight: var(--rst-fw-bold);
  }
  .location-state.is-retry {
    color: var(--cl-problem);
    cursor: pointer;
  }
  .location-state.is-retry:hover { color: var(--cl-accent); }
  @keyframes location-pulse {
    from { opacity: .35; }
    to { opacity: 1; }
  }

  /* Collapsible minimums: an input's intrinsic width must not hold the track
     open, or the last field is clipped by the card's hidden overflow. */
  .field-row {
    display: grid;
    gap: 9px;
  }

  .field-row.is-contact {
    grid-template-columns: minmax(0, 1fr) minmax(0, .75fr);
  }
  .field-row.is-contact > :last-child {
    grid-column: 1 / -1;
  }

  .field-row.is-address {
    grid-template-columns: minmax(0, 1fr);
  }
  .address-lower {
    display: grid;
    grid-template-columns: minmax(92px, .52fr) minmax(0, 1fr) minmax(110px, .64fr);
    gap: 9px;
  }

  .identity-fields :global(.cl-label) {
    gap: 5px;
  }

  .identity-fields :global(.cl-label > span) {
    font-size: var(--rst-fs-control);
    font-weight: var(--rst-fw-regular);
  }

  .identity-fields :global(.cl-field) {
    min-width: 0;
    min-height: 35px;
    padding-inline: 10px;
    font-size: var(--rst-fs-body);
  }
  .input-with-icon {
    position: relative;
    display: block;
  }
  .input-with-icon :global(svg) {
    position: absolute;
    z-index: 1;
    top: 50%;
    left: 10px;
    color: var(--cl-muted);
    pointer-events: none;
    transform: translateY(-50%);
  }
  .input-with-icon :global(.cl-field) {
    width: 100%;
    padding-left: 31px;
  }
  .location-layout {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(230px, .72fr);
    align-items: stretch;
    gap: 12px;
  }
  .location-fields {
    min-width: 0;
    display: grid;
    align-content: start;
    gap: 8px;
  }
  .location-results {
    display: grid;
    overflow: hidden;
    border: 1px solid var(--cl-line);
    border-radius: var(--cl-radius-sm);
    background: var(--cl-surface);
  }
  .location-results button {
    min-width: 0;
    min-height: 36px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 9px;
    border: 0;
    border-bottom: 1px solid var(--cl-line);
    color: var(--cl-ink);
    background: transparent;
    font: inherit;
    font-size: var(--rst-fs-label);
    line-height: 1.35;
    text-align: left;
    cursor: pointer;
  }
  .location-results button:last-child { border-bottom: 0; }
  .location-results button:hover { background: var(--cl-accent-wash); }
  .location-results button :global(svg) {
    flex: 0 0 auto;
    color: var(--cl-accent);
  }
  .location-results button span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .location-help,
  .location-error {
    margin: 0;
    color: var(--cl-muted);
    font-size: var(--rst-fs-label);
    line-height: 1.4;
  }
  .location-error { color: var(--cl-problem); }
  .location-map {
    position: relative;
    min-height: 170px;
    overflow: hidden;
    border: 1px solid var(--cl-line-strong);
    border-radius: var(--cl-radius);
    background: var(--cl-surface-muted);
  }
  .location-map iframe {
    width: 100%;
    height: 138px;
    display: block;
    border: 0;
  }
  .location-map__footer {
    min-height: 31px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 5px 8px;
    border-top: 1px solid var(--cl-line);
    background: var(--cl-surface);
    font-size: var(--rst-fs-caption);
  }
  .location-map__footer span,
  .location-map__footer a {
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .location-map__footer span {
    overflow: hidden;
    color: var(--cl-ink);
    font-weight: var(--rst-fw-bold);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .location-map__footer span :global(svg) { color: var(--cl-ok); }
  .location-map__footer a {
    flex: 0 0 auto;
    color: var(--cl-accent);
    text-decoration: none;
  }
  .location-map__empty {
    min-height: 168px;
    display: grid;
    align-content: center;
    justify-items: center;
    gap: 5px;
    padding: 20px;
    color: var(--cl-muted);
    text-align: center;
  }
  .location-map__empty > span {
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--cl-accent) 24%, var(--cl-line));
    border-radius: 50%;
    color: var(--cl-accent);
    background: var(--cl-accent-wash);
  }
  .location-map__empty strong {
    color: var(--cl-ink);
    font-size: var(--rst-fs-control);
  }
  .location-map__empty small {
    max-width: 210px;
    font-size: var(--rst-fs-caption);
    line-height: 1.35;
  }
  .map-attribution {
    position: absolute;
    right: 4px;
    bottom: 34px;
    padding: 1px 3px;
    border-radius: 2px;
    color: #334155;
    background: rgb(255 255 255 / .84);
    font-size: var(--rst-fs-micro);
    text-decoration: none;
  }
  .location-map.is-empty .map-attribution { bottom: 3px; }

  .logo-error {
    margin: 10px 16px 0;
    color: var(--cl-problem);
    font-size: var(--rst-fs-label);
    font-style: normal;
    line-height: 1.35;
  }

  .hours-wrap {
    max-height: none;
    overflow-x: auto;
    scrollbar-gutter: stable;
  }

  .service-periods {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(430px, 1fr));
    border-bottom: 1px solid var(--cl-line);
  }

  .service-period {
    min-width: 0;
    display: grid;
    grid-template-columns: 24px minmax(130px, 1fr) minmax(169px, auto) auto;
    align-items: end;
    gap: 10px;
    padding: 9px 12px;
    border-top: 0;
    border-right: 1px solid var(--cl-line);
    border-bottom: 1px solid var(--cl-line);
    background: color-mix(in srgb, var(--cl-surface-muted) 42%, var(--cl-surface));
  }

  .service-period.is-inactive {
    opacity: .62;
  }

  .service-period > label:not(.service-period__state) {
    min-width: 0;
    display: grid;
    gap: 4px;
    color: var(--cl-muted);
    font-size: var(--rst-fs-caption);
  }

  .service-period :global(.cl-field) {
    min-width: 0;
    min-height: 34px;
  }

  .service-period__icon {
    align-self: center;
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    color: var(--cl-muted);
  }

  .service-period__icon.is-lunch {
    color: var(--cl-lunch);
  }

  .service-period__icon.is-evening {
    color: var(--cl-evening);
  }

  .service-period__state {
    align-self: center;
    padding-inline: 4px;
  }

  .hours-table {
    width: 100%;
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
    width: 180px;
  }

  .hours-table :global(tbody td) {
    height: 76px;
    padding: 7px 9px;
  }

  .hours-table :global(tbody tr:nth-child(even) td) {
    background: color-mix(in srgb, var(--cl-surface-muted) 48%, var(--cl-surface));
  }

  .hours-table :global(tbody tr:hover td) {
    background: color-mix(in srgb, var(--cl-accent) 4%, var(--cl-surface-muted));
  }

  .service-row {
    color: var(--cl-ink);
    font-size: var(--rst-fs-control);
    font-weight: var(--rst-fw-bold);
  }

  .service-row small {
    display: block;
    margin-top: 3px;
    color: var(--cl-muted);
    font-size: var(--rst-fs-caption);
    font-weight: var(--rst-fw-regular);
    font-variant-numeric: tabular-nums;
  }

  .day-hours {
    display: grid;
    gap: 4px;
  }

  .day-hours.is-closed {
    opacity: .64;
  }

  .switch {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    color: var(--cl-muted);
    font-size: var(--rst-fs-label);
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

  /* The meta strip names the same configurable services as the table below. */
  .svc-meta {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .svc-meta strong {
    color: var(--cl-ink);
    font-size: inherit;
  }

  .svc-meta span {
    color: var(--cl-muted);
  }

  .svc-meta.is-lunch :global(.service-icon) { color: var(--cl-lunch); }
  .svc-meta.is-evening :global(.service-icon) { color: var(--cl-evening); }

  @media (max-width: 1180px) {
    .identity-fields {
      grid-template-columns: minmax(0, 1fr);
    }

    .field-group + .field-group {
      border-top: 1px solid var(--cl-line);
      border-left: 0;
    }

    .service-periods { grid-template-columns: minmax(0, 1fr); }
  }

  @media (max-width: 980px) {
    .location-layout {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (max-width: 760px) {
    .restaurant-workspace {
      padding: 8px;
    }

    .identity-head {
      grid-template-columns: auto minmax(0, 1fr);
      row-gap: 12px;
    }

    .logo-actions {
      grid-column: 1 / -1;
    }

    .field-row.is-contact,
    .field-row.is-address,
    .address-lower {
      grid-template-columns: minmax(0, 1fr);
    }
    .field-row.is-contact > :last-child {
      grid-column: auto;
    }

    .service-period {
      grid-template-columns: 24px minmax(0, 1fr) minmax(88px, .55fr) minmax(88px, .55fr);
    }

    .service-period__state {
      grid-column: 2 / -1;
    }
  }
</style>
