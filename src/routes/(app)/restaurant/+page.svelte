<script lang="ts">
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

  const readRestaurantContext = useWorkspaceRestaurantContext();
  const context = $derived(readRestaurantContext());
  const canManageLogo = $derived(workspace.canManageOperations);

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
</script>

<svelte:head><title>{t('Restaurant profile')} &middot; restogogo</title></svelte:head>

{#if context}
  {@const draft = context.draft}
  {@const activeServices = draft.services.filter((service) => service.active)}
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
              </div>
            </section>

            <section class="field-group">
              <span class="field-group__title">{t('Address')}</span>
              <div class="field-row is-address">
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
        </section>

        <section class="cl-card hours-card">
          <div class="cl-card__head">
            <h3>{t('Opening hours')}</h3>
            {#if context.canSave}
              <button class="cl-btn" type="button" onclick={addServicePeriod}>
                {t('Add service period')}
              </button>
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
                <label>
                  <span>{t('Default start')}</span>
                  <input
                    class="cl-field time"
                    type="time"
                    disabled={!context.canSave}
                    bind:value={service.defaultStart}
                    oninput={() => restaurantConfig.touch()}
                  />
                </label>
                <label>
                  <span>{t('Default end')}</span>
                  <input
                    class="cl-field time"
                    type="time"
                    disabled={!context.canSave}
                    bind:value={service.defaultEnd}
                    oninput={() => restaurantConfig.touch()}
                  />
                </label>
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
                            <span class="range">
                              <input
                                class="cl-field time"
                                type="time"
                                aria-label={`${service.name} ${t(WEEKDAYS[weekdayIndex])} ${t('Start')}`}
                                disabled={!context.canSave || !period.open}
                                bind:value={period.start}
                                oninput={() => restaurantConfig.touch()}
                              />
                              <i>&ndash;</i>
                              <input
                                class="cl-field time"
                                type="time"
                                aria-label={`${service.name} ${t(WEEKDAYS[weekdayIndex])} ${t('End')}`}
                                disabled={!context.canSave || !period.open}
                                bind:value={period.end}
                                oninput={() => restaurantConfig.touch()}
                              />
                            </span>
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
    font-size: 22px;
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
    font-size: 19px;
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
    font-size: 11px;
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
    grid-template-columns: minmax(0, .8fr) minmax(0, 1.2fr);
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
    font-size: 10px;
    font-weight: var(--rst-fw-bold);
    letter-spacing: .06em;
    text-transform: uppercase;
  }

  /* Collapsible minimums: an input's intrinsic width must not hold the track
     open, or the last field is clipped by the card's hidden overflow. */
  .field-row {
    display: grid;
    gap: 9px;
  }

  .field-row.is-contact {
    grid-template-columns: minmax(0, 1.25fr) minmax(0, .75fr);
  }

  .field-row.is-address {
    grid-template-columns: minmax(0, 1.4fr) minmax(0, .5fr) minmax(0, .9fr);
  }

  .identity-fields :global(.cl-label) {
    gap: 5px;
  }

  .identity-fields :global(.cl-label > span) {
    font-size: 11.5px;
    font-weight: var(--rst-fw-regular);
  }

  .identity-fields :global(.cl-field) {
    min-width: 0;
    min-height: 35px;
    padding-inline: 10px;
    font-size: 12.5px;
  }

  .logo-error {
    margin: 10px 16px 0;
    color: var(--cl-problem);
    font-size: 11px;
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
    grid-template-columns: 24px minmax(130px, 1fr) 102px 102px auto;
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
    font-size: 10px;
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
    font-size: 12px;
    font-weight: var(--rst-fw-bold);
  }

  .service-row small {
    display: block;
    margin-top: 3px;
    color: var(--cl-muted);
    font-size: 10px;
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
    padding: 5px 4px;
    border-color: transparent;
    background: color-mix(in srgb, var(--cl-surface-muted) 76%, var(--cl-surface));
    font-size: 10.5px;
    font-weight: var(--rst-fw-medium);
    font-variant-numeric: tabular-nums;
    text-align: center;
  }

  .time:hover:not(:disabled),
  .time:focus {
    border-color: color-mix(in srgb, var(--cl-accent) 40%, var(--cl-line-strong));
    background: var(--cl-surface);
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
    .field-row.is-address {
      grid-template-columns: minmax(0, 1fr);
    }

    .service-period {
      grid-template-columns: 24px minmax(0, 1fr) minmax(88px, .55fr) minmax(88px, .55fr);
    }

    .service-period__state {
      grid-column: 2 / -1;
    }
  }
</style>
