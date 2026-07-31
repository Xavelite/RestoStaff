<script lang="ts">
  import {
    BadgeCheck,
    ChevronDown,
    ChevronUp,
    ExternalLink,
    Globe2,
    Mail,
    MapPin,
    Phone,
    Search
  } from '@lucide/svelte';
  import { onDestroy } from 'svelte';
  import { friendlyError } from '$lib/api/error-messages';
  import { todayInTimezone, weekday, WEEKDAYS } from '$lib/calendar/date';
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
    googleMapsSearchUrl,
    osmEmbedUrl,
    osmLocationUrl,
    restaurantAddressQuery,
    searchBelgianRestaurantAddress,
    type RestaurantAddressCandidate
  } from '$lib/restaurant/address-geocoding';
  import { normalizedWebsite } from '$lib/restaurant/restaurant-model';
  import { isValidEmail, isValidPhone } from '$lib/validation/contact';

  let logoBusy = $state(false);
  let logoError = $state('');
  let logoVersion = $state(0);
  let locationBusy = $state(false);
  let locationError = $state('');
  let locationCandidates = $state<RestaurantAddressCandidate[]>([]);
  let hoursExpanded = $state(false);
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
  const publicWebsiteUrl = $derived(normalizedWebsite(context?.draft.websiteUrl ?? ''));
  const emailInvalid = $derived(
    Boolean(context?.draft.email.trim()) && !isValidEmail(context?.draft.email ?? '')
  );
  const phoneInvalid = $derived(
    Boolean(context?.draft.phone.trim()) && !isValidPhone(context?.draft.phone ?? '')
  );
  const websiteInvalid = $derived(
    Boolean(context?.draft.websiteUrl.trim()) && !publicWebsiteUrl
  );
  const googleListingUrl = $derived.by(() => {
    const draft = context?.draft;
    if (!draft) return '';
    return googleMapsSearchUrl({
      restaurantName: draft.displayName,
      street: draft.address,
      postalCode: draft.postalCode,
      city: draft.city
    });
  });
  const profileReadiness = $derived.by(() => {
    const draft = context?.draft;
    if (!draft) return { complete: 0, total: 5 };
    const checks = [
      Boolean(logoUrl),
      Boolean(draft.email.trim()),
      Boolean(draft.phone.trim()),
      Boolean(publicWebsiteUrl),
      Boolean(resolvedLocation)
    ];
    const complete = checks.filter(Boolean).length;
    return { complete, total: checks.length };
  });
  const restaurantToday = $derived(
    weekday(todayInTimezone(snapshot?.restaurant_settings.timezone || 'Europe/Brussels'))
  );

  function locationSearchIsReady(): boolean {
    if (!context) return false;
    const draft = context.draft;
    const hasLocality =
      draft.postalCode.trim().length >= 3 || draft.city.trim().length >= 2;
    return (
      (draft.address.trim().length >= 4 && hasLocality) ||
      (draft.displayName.trim().length >= 3 && draft.city.trim().length >= 2)
    );
  }

  function scheduleLocationSearch(includeRestaurantName: boolean) {
    clearTimeout(addressSearchTimer);
    locationRequest += 1;
    locationBusy = false;
    locationCandidates = [];
    locationError = '';
    if (locationSearchIsReady()) {
      addressSearchTimer = setTimeout(
        () => void locateRestaurant(true, includeRestaurantName),
        700
      );
    }
  }

  function touchIdentity() {
    restaurantConfig.touch();
    scheduleLocationSearch(true);
  }

  function touchAddress() {
    if (!context) return;
    context.draft.locationLatitude = null;
    context.draft.locationLongitude = null;
    context.draft.locationLabel = '';
    restaurantConfig.touch();
    scheduleLocationSearch(false);
  }

  function submitLocationSearch(event: KeyboardEvent) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    clearTimeout(addressSearchTimer);
    const fromRestaurantName =
      event.currentTarget instanceof HTMLElement &&
      event.currentTarget.classList.contains('name-field');
    void locateRestaurant(false, fromRestaurantName);
  }

  async function locateRestaurant(automatic = false, includeRestaurantName = true) {
    if (!context) return;
    const query = restaurantAddressQuery({
      restaurantName: includeRestaurantName ? context.draft.displayName : '',
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

  function addServicePeriod() {
    if (!context) return;
    hoursExpanded = true;
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
    hoursExpanded = true;
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
      <span class="profile-meta">
        <BadgeCheck size={14} aria-hidden="true" />
        <strong>{profileReadiness.complete}/{profileReadiness.total}</strong>
        <span>{t('profile details')}</span>
      </span>
      {#if resolvedLocation}
        <span class="profile-meta is-ready">
          <MapPin size={14} aria-hidden="true" />
          <span>{t('Location confirmed')}</span>
        </span>
      {/if}
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
                oninput={touchIdentity}
                onkeydown={submitLocationSearch}
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
                  <span class="input-with-icon">
                    <Mail size={14} aria-hidden="true" />
                    <input class="cl-field" class:is-invalid={emailInvalid} type="email" autocomplete="email" aria-invalid={emailInvalid} bind:value={draft.email} oninput={() => restaurantConfig.touch()} />
                  </span>
                  {#if emailInvalid}<small class="field-error">{t('Enter a valid email address.')}</small>{/if}
                </label>
                <label class="cl-label">
                  <span>{t('Phone')}</span>
                  <span class="input-with-icon">
                    <Phone size={14} aria-hidden="true" />
                    <input class="cl-field" class:is-invalid={phoneInvalid} type="tel" inputmode="tel" autocomplete="tel" aria-invalid={phoneInvalid} bind:value={draft.phone} oninput={() => restaurantConfig.touch()} />
                  </span>
                  {#if phoneInvalid}<small class="field-error">{t('Enter a valid phone number.')}</small>{/if}
                </label>
                <label class="cl-label">
                  <span>{t('Website')}</span>
                  <span class="input-with-icon">
                    <Globe2 size={14} aria-hidden="true" />
                    <input
                      class="cl-field"
                      type="text"
                      inputmode="url"
                      autocomplete="url"
                      placeholder="https://"
                      class:is-invalid={websiteInvalid}
                      aria-invalid={websiteInvalid}
                      bind:value={draft.websiteUrl}
                      oninput={() => restaurantConfig.touch()}
                    />
                  </span>
                  {#if websiteInvalid}<small class="field-error">{t('Enter a valid website address.')}</small>{/if}
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
                    onclick={() => void locateRestaurant(false, false)}
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
                      <input class="cl-field" autocomplete="street-address" bind:value={draft.address} oninput={touchAddress} onkeydown={submitLocationSearch} />
                    </label>
                    <div class="address-lower">
                      <label class="cl-label">
                        <span>{t('Postal code')}</span>
                        <input class="cl-field" autocomplete="postal-code" bind:value={draft.postalCode} oninput={touchAddress} onkeydown={submitLocationSearch} />
                      </label>
                      <label class="cl-label">
                        <span>{t('City')}</span>
                        <input class="cl-field" autocomplete="address-level2" bind:value={draft.city} oninput={touchAddress} onkeydown={submitLocationSearch} />
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

            <section class="field-group presence-panel">
              <span class="field-group__title">{t('Public presence')}</span>
              <div class="presence-links">
                <a href={googleListingUrl} target="_blank" rel="noreferrer">
                  <span class="presence-link__icon is-google"><MapPin size={16} aria-hidden="true" /></span>
                  <span><strong>{t('Google Maps')}</strong><small>{t('Public listing')}</small></span>
                  <ExternalLink size={14} aria-hidden="true" />
                </a>
                {#if publicWebsiteUrl}
                  <a href={publicWebsiteUrl} target="_blank" rel="noreferrer">
                    <span class="presence-link__icon"><Globe2 size={16} aria-hidden="true" /></span>
                    <span><strong>{t('Website')}</strong><small>{t('Open website')}</small></span>
                    <ExternalLink size={14} aria-hidden="true" />
                  </a>
                {:else}
                  <div class="presence-link is-missing">
                    <span class="presence-link__icon"><Globe2 size={16} aria-hidden="true" /></span>
                    <span><strong>{t('Website')}</strong><small>{t('Website missing')}</small></span>
                  </div>
                {/if}
                <div class="presence-link" class:is-missing={!draft.email.trim() && !draft.phone.trim()}>
                  <span class="presence-link__icon"><Phone size={16} aria-hidden="true" /></span>
                  <span>
                    <strong>{t('Contact channels')}</strong>
                    <small>{t('{count} available', { count: Number(Boolean(draft.email.trim())) + Number(Boolean(draft.phone.trim())) })}</small>
                  </span>
                </div>
              </div>
            </section>
          </div>
        </section>

        <section class="cl-card hours-card">
          <div class="cl-card__head">
            <div class="hours-heading">
              <h3>{t('Opening hours')}</h3>
              <span>{t('Weekly service overview')}</span>
            </div>
            <div class="hours-actions">
              <span class="hours-count">{t('{count} service periods', { count: activeServices.length })}</span>
              <button class="cl-btn" type="button" aria-expanded={hoursExpanded} onclick={() => (hoursExpanded = !hoursExpanded)}>
                {#if hoursExpanded}<ChevronUp size={15} aria-hidden="true" />{:else}<ChevronDown size={15} aria-hidden="true" />{/if}
                {t(hoursExpanded ? 'Close editor' : 'Edit hours')}
              </button>
            </div>
          </div>
          <div class="hours-summary">
            {#each WEEKDAYS as weekdayLabel, weekdayIndex}
              {@const day = draft.opening.find((candidate) => candidate.weekday === weekdayIndex + 1)}
              {@const openPeriods = activeServices.filter((service) => day?.services[service.serviceKey]?.open)}
              <article class:is-today={restaurantToday === weekdayIndex + 1} class:is-closed={!openPeriods.length}>
                <header>
                  <strong>{t(weekdayLabel)}</strong>
                  {#if restaurantToday === weekdayIndex + 1}<span>{t('Today')}</span>{/if}
                </header>
                {#if openPeriods.length}
                  <div>
                    {#each openPeriods as service (service.serviceKey)}
                      {@const period = day?.services[service.serviceKey]}
                      <span class="hours-summary__period is-{service.serviceKey}">
                        <WorkspaceServiceIcon service={service.serviceKey} size={13} />
                        <b>{service.name}</b>
                        <em>{period?.start}&ndash;{period?.end}</em>
                      </span>
                    {/each}
                  </div>
                {:else}
                  <span class="hours-summary__closed">{t('Closed')}</span>
                {/if}
              </article>
            {/each}
          </div>
          {#if hoursExpanded}
            <div class="hours-editor__head">
              <strong>{t('Service periods')}</strong>
              {#if context.canSave}
                <div class="hours-editor__actions">
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
          {/if}
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
  .profile-meta {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .profile-meta > :global(svg) { color: var(--cl-accent); }
  .profile-meta strong { color: var(--cl-ink); }
  .profile-meta span { color: var(--cl-muted); }
  .profile-meta.is-ready > :global(svg),
  .profile-meta.is-ready span { color: var(--cl-ok); }
  /* The restaurant leads with its own name and mark, so the identity reads as a
     heading rather than as one more form field competing with the others. */
  .identity-head {
    min-width: 0;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 14px;
    padding: 17px 18px;
    border-bottom: 1px solid var(--cl-line);
    background: color-mix(in srgb, var(--cl-accent) 2.5%, var(--cl-surface));
    box-shadow: inset 0 3px 0 var(--cl-accent);
  }

  .identity-head__main {
    min-width: 0;
    display: grid;
    gap: 3px;
  }

  .logo-tile {
    flex: 0 0 auto;
    width: 62px;
    height: 62px;
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
    grid-template-columns: minmax(235px, .58fr) minmax(650px, 1.9fr) minmax(245px, .62fr);
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
    grid-template-columns: minmax(0, 1fr);
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
  .identity-fields :global(.cl-field.is-invalid) {
    border-color: color-mix(in srgb, var(--cl-problem) 62%, var(--cl-line));
    background: color-mix(in srgb, var(--cl-problem) 4%, var(--cl-surface));
  }
  .field-error {
    color: var(--cl-problem);
    font-size: var(--rst-fs-caption);
    font-weight: var(--rst-fw-medium);
  }
  .location-layout {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, .92fr) minmax(320px, 1.08fr);
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
    min-height: 220px;
    overflow: hidden;
    border: 1px solid var(--cl-line-strong);
    border-radius: var(--cl-radius);
    background: var(--cl-surface-muted);
  }
  .location-map iframe {
    width: 100%;
    height: 188px;
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
    min-height: 218px;
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

  .presence-panel {
    position: relative;
    background: color-mix(in srgb, var(--cl-accent) 1.5%, var(--cl-surface));
  }
  .presence-links {
    display: grid;
    overflow: hidden;
    border: 1px solid var(--cl-line);
    border-radius: var(--cl-radius-sm);
    background: var(--cl-surface);
  }
  .presence-links > a,
  .presence-link {
    min-width: 0;
    min-height: 48px;
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr) auto;
    align-items: center;
    gap: 9px;
    padding: 7px 9px;
    border-bottom: 1px solid var(--cl-line);
    color: var(--cl-ink);
    text-decoration: none;
  }
  .presence-links > :last-child { border-bottom: 0; }
  .presence-links > a:hover { background: var(--cl-accent-wash); }
  .presence-links > a:focus-visible {
    position: relative;
    z-index: 1;
    outline: 2px solid color-mix(in srgb, var(--cl-accent) 45%, transparent);
    outline-offset: -2px;
  }
  .presence-links > a > :global(svg:last-child) { color: var(--cl-muted); }
  .presence-link.is-missing { color: var(--cl-muted); background: var(--cl-surface-muted); }
  .presence-link__icon {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border: 1px solid var(--cl-line);
    border-radius: var(--cl-radius-sm);
    color: var(--cl-accent);
    background: var(--cl-accent-wash);
  }
  .presence-link__icon.is-google {
    color: #b45309;
    background: #fff7ed;
    border-color: #fed7aa;
  }
  .presence-links strong,
  .presence-links small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .presence-links strong { font-size: var(--rst-fs-control); }
  .presence-links small { margin-top: 1px; color: var(--cl-muted); font-size: var(--rst-fs-caption); }
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

  .hours-heading {
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  .hours-heading span {
    color: var(--cl-muted);
    font-size: var(--rst-fs-caption);
  }
  .hours-actions { display: flex; align-items: center; gap: 8px; }
  .hours-actions :global(.cl-btn) { display: inline-flex; align-items: center; gap: 6px; }
  .hours-count {
    color: var(--cl-muted);
    font-size: var(--rst-fs-label);
    font-weight: var(--rst-fw-semibold);
  }
  .hours-summary {
    display: grid;
    grid-template-columns: repeat(7, minmax(118px, 1fr));
    overflow-x: auto;
    border-bottom: 1px solid var(--cl-line);
    background: var(--cl-surface);
    scrollbar-gutter: stable;
  }
  .hours-summary article {
    min-width: 0;
    min-height: 92px;
    display: grid;
    align-content: start;
    gap: 7px;
    padding: 10px;
    border-right: 1px solid var(--cl-line);
    background: var(--cl-surface);
  }
  .hours-summary article:last-child { border-right: 0; }
  .hours-summary article.is-today {
    background: color-mix(in srgb, var(--cl-accent) 5%, var(--cl-surface));
    box-shadow: inset 0 3px 0 var(--cl-accent);
  }
  .hours-summary article.is-closed { background: var(--cl-surface-muted); }
  .hours-summary article > header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }
  .hours-summary article > header strong { font-size: var(--rst-fs-control); }
  .hours-summary article > header span {
    padding: 2px 5px;
    border-radius: 999px;
    color: var(--cl-accent);
    background: var(--cl-accent-wash);
    font-size: var(--rst-fs-micro);
    font-weight: var(--rst-fw-bold);
  }
  .hours-summary article > div { display: grid; gap: 4px; }
  .hours-summary__period {
    min-width: 0;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 1px 5px;
    color: var(--cl-ink);
  }
  .hours-summary__period > :global(svg) { grid-row: 1 / 3; color: var(--cl-muted); }
  .hours-summary__period.is-lunch > :global(svg) { color: var(--cl-lunch); }
  .hours-summary__period.is-evening > :global(svg) { color: var(--cl-evening); }
  .hours-summary__period b { overflow: hidden; font-size: var(--rst-fs-caption); text-overflow: ellipsis; white-space: nowrap; }
  .hours-summary__period em { color: var(--cl-muted); font-size: var(--rst-fs-micro); font-style: normal; font-variant-numeric: tabular-nums; }
  .hours-summary__closed { color: var(--cl-muted); font-size: var(--rst-fs-label); }
  .hours-editor__head {
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--cl-line);
    background: var(--cl-surface-muted);
  }
  .hours-editor__head > strong { font-size: var(--rst-fs-control); }
  .hours-editor__actions { display: flex; align-items: center; gap: 7px; }

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

    .hours-card :global(.cl-card__head) {
      align-items: flex-start;
    }
    .hours-actions {
      align-items: flex-end;
      flex-direction: column;
    }
    .hours-count { display: none; }
    .hours-editor__head {
      align-items: stretch;
      flex-direction: column;
    }
    .hours-editor__actions {
      align-items: stretch;
      flex-direction: column;
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
