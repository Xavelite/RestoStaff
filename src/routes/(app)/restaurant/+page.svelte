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
          <div class="cl-card__head">
            <div>
              <h2>{t('Restaurant profile')}</h2>
              <p>{t('The location name and contact details shown throughout the workspace.')}</p>
            </div>
          </div>
          <div class="cl-card__body profile-body">
            <section class="logo-field">
              <div class="logo-field__preview" class:is-empty={!logoUrl}>
                {#if logoUrl}
                  <img src={logoUrl} alt={t('Restaurant logo')} />
                {:else}
                  <span aria-hidden="true">{(draft.displayName || 'R').charAt(0).toUpperCase()}</span>
                {/if}
              </div>
              <div class="logo-field__copy">
                <strong>{t('Restaurant logo')}</strong>
                <small>{t('Shown on your badge terminal and paired devices. PNG, JPEG or WebP, up to 1 MB.')}</small>
                {#if logoError}<em>{logoError}</em>{/if}
              </div>
              {#if canManageLogo}
                <div class="logo-field__actions">
                  <input id="restaurant-logo-input" type="file" accept={LOGO_ACCEPT} disabled={logoBusy} onchange={handleLogoChange} />
                  <label class="cl-btn" for="restaurant-logo-input">{t(logoBusy ? 'Uploading…' : logoUrl ? 'Replace' : 'Upload logo')}</label>
                  {#if logoUrl}<button class="cl-btn" type="button" disabled={logoBusy} onclick={removeLogo}>{t('Remove')}</button>{/if}
                </div>
              {/if}
            </section>

            <div class="profile-sections">
              <section class="profile-section">
                <div class="profile-section__head">
                  <strong>{t('Restaurant identity')}</strong>
                  <span>{t('Used in navigation, schedules and the badge terminal.')}</span>
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
                  <strong>{t('Address')}</strong>
                  <span>{t('The physical location used for operations and paired devices.')}</span>
                </div>
                <div class="form is-address">
                  <label class="cl-label form__wide">
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
          <div class="cl-card__foot regional">
            {t('Belgium')} · {snapshot?.restaurant_settings.timezone || 'Europe/Brussels'} · {snapshot?.restaurant_settings.locale || 'fr-BE'} · {snapshot?.restaurant_settings.currency_code || 'EUR'}
          </div>
        </section>

        <section class="cl-card hours-card">
          <div class="cl-tablewrap hours-wrap">
            <table class="cl-table hours-table">
              <thead>
                <tr>
                  <th>{t('Day')}</th>
                  <th><span class="service-heading"><i class="is-lunch"></i>{t('Lunch')}</span></th>
                  <th><span class="service-heading"><i class="is-evening"></i>{t('Evening')}</span></th>
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
                          <i>–</i>
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
                          <i>–</i>
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
  .restaurant-workspace { min-width: 0; display: grid; grid-template-columns: minmax(430px, .96fr) minmax(610px, 1.04fr); align-items: stretch; gap: 10px; padding: 10px; background: var(--cl-bg); }
  .profile-card, .hours-card { min-width: 0; overflow: hidden; }
  .profile-card { display: flex; flex-direction: column; }
  .profile-card > .cl-card__head { min-height: 58px; background: linear-gradient(100deg, color-mix(in srgb, var(--cl-accent) 8%, var(--cl-surface-muted)), var(--cl-surface-muted) 72%); box-shadow: inset 3px 0 0 var(--cl-accent); }
  .profile-body { display: grid; align-content: start; gap: 16px; padding: 14px 16px; }
  .cl-card__head > div:first-child { display: grid; gap: 4px; }
  .cl-card__head p { margin: 0; color: var(--cl-muted); font-size: 12px; line-height: 1.45; }
  .profile-sections { display: grid; gap: 16px; }
  .profile-section { min-width: 0; display: grid; align-content: start; gap: 10px; }
  .profile-section + .profile-section { padding-top: 16px; border-top: 1px solid var(--cl-line); }
  .profile-section__head { display: grid; gap: 3px; }
  .profile-section__head strong { font-size: 13px; }
  .profile-section__head span { color: var(--cl-muted); font-size: 10.5px; line-height: 1.35; }
  .form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 11px; }
  .form.is-identity .cl-label:first-child { grid-column: 1 / -1; }
  .form__wide { grid-column: 1 / -1; }
  .profile-body :global(.cl-label > span) { color: color-mix(in srgb, var(--cl-ink) 70%, var(--cl-muted)); font-size: 10px; font-weight: var(--rst-fw-bold); letter-spacing: .035em; text-transform: uppercase; }
  .profile-body :global(.cl-field) { min-height: 36px; border-color: color-mix(in srgb, var(--cl-line-strong) 82%, transparent); background: color-mix(in srgb, var(--cl-surface-muted) 70%, var(--cl-surface)); font-size: 13px; }
  .profile-body :global(.cl-field:hover) { border-color: color-mix(in srgb, var(--cl-accent) 34%, var(--cl-line-strong)); background: var(--cl-surface); }
  .profile-body :global(.cl-field:focus) { border-color: var(--cl-accent); background: var(--cl-surface); outline: 2px solid color-mix(in srgb, var(--cl-accent) 12%, transparent); outline-offset: 1px; }
  .logo-field { display: grid; grid-template-columns: 56px minmax(0, 1fr); align-items: center; gap: 12px; padding-bottom: 16px; border-bottom: 1px solid var(--cl-line); }
  .logo-field__preview { width: 54px; height: 54px; display: grid; place-items: center; overflow: hidden; border: 1px solid color-mix(in srgb, var(--cl-accent) 26%, var(--cl-line)); border-radius: var(--cl-radius); background: color-mix(in srgb, var(--cl-accent) 7%, var(--cl-surface-muted)); color: var(--cl-accent); font-size: 22px; font-weight: var(--rst-fw-display); }
  .logo-field__preview img { width: 100%; height: 100%; object-fit: contain; }
  .logo-field__copy { display: grid; gap: 4px; }
  .logo-field__copy small { color: var(--cl-muted); font-size: 11px; line-height: 1.35; }
  .logo-field__copy em { color: var(--cl-problem); font-size: 12px; font-style: normal; }
  .logo-field__actions { grid-column: 1 / -1; display: flex; gap: 8px; }
  .logo-field__actions input { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  .hours-card { align-self: stretch; border-color: var(--cl-line-strong); }
  .hours-wrap { max-height: none; }
  .hours-table { min-width: 610px; }
  .hours-table :global(thead th) { height: 46px; background: linear-gradient(180deg, color-mix(in srgb, var(--cl-accent) 7%, var(--cl-surface-muted)), color-mix(in srgb, var(--cl-accent) 3%, var(--cl-surface-muted))); box-shadow: 0 1px 0 var(--cl-line-strong); }
  .hours-table :global(tbody td) { height: 51px; padding-top: 7px; padding-bottom: 7px; }
  .hours-table :global(tbody tr:nth-child(even) td) { background: color-mix(in srgb, var(--cl-surface-muted) 48%, var(--cl-surface)); }
  .hours-table :global(tbody tr:hover td) { background: color-mix(in srgb, var(--cl-accent) 4%, var(--cl-surface-muted)); }
  .day { width: 94px; color: color-mix(in srgb, var(--cl-ink) 84%, var(--cl-muted)); font-size: 12px; font-weight: var(--rst-fw-bold); }
  .service-hours { display: grid; grid-template-columns: 56px minmax(0, 1fr); align-items: center; gap: 8px; }
  .switch { display: inline-flex; align-items: center; gap: 6px; min-width: 0; color: var(--cl-muted); font-size: 11px; }
  .switch:has(input:checked) { color: var(--cl-ink); }
  .switch input { width: 14px; height: 14px; accent-color: var(--cl-accent); }
  .range { display: inline-grid; grid-template-columns: minmax(84px, 1fr) auto minmax(84px, 1fr); align-items: center; gap: 5px; }
  .range i { color: var(--cl-muted); font-style: normal; text-align: center; }
  .time { width: 100%; min-width: 0; min-height: 34px; padding: 6px 8px; border-color: transparent; background: color-mix(in srgb, var(--cl-surface-muted) 76%, var(--cl-surface)); font-size: 12px; font-weight: var(--rst-fw-medium); font-variant-numeric: tabular-nums; text-align: center; }
  .time:hover:not(:disabled), .time:focus { border-color: color-mix(in srgb, var(--cl-accent) 40%, var(--cl-line-strong)); background: var(--cl-surface); }
  .service-heading { display: inline-flex; align-items: center; gap: 8px; }
  .service-heading i, .dot { width: 7px; height: 7px; display: inline-block; border-radius: 50%; background: var(--cl-line-strong); }
  .service-heading i.is-lunch, .dot.is-lunch { background: var(--cl-lunch); box-shadow: 0 0 0 3px var(--cl-lunch-wash); }
  .service-heading i.is-evening, .dot.is-evening { background: var(--cl-evening); box-shadow: 0 0 0 3px var(--cl-evening-wash); }
  .regional { justify-content: flex-start; padding-top: 10px; padding-bottom: 10px; background: var(--cl-surface-muted); color: var(--cl-muted); font-size: 11px; }
  @media (max-width: 1180px) {
    .restaurant-workspace { grid-template-columns: minmax(0, 1fr); }
    .profile-sections { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 28px; }
    .profile-section + .profile-section { padding-top: 0; padding-left: 28px; border-top: 0; border-left: 1px solid var(--cl-line); }
    .logo-field { grid-template-columns: 64px minmax(0, 1fr) auto; }
    .logo-field__actions { grid-column: auto; }
  }
  @media (max-width: 760px) {
    .restaurant-workspace { padding: 8px; }
    .profile-sections { grid-template-columns: minmax(0, 1fr); gap: 20px; }
    .profile-section + .profile-section { padding-top: 20px; padding-left: 0; border-top: 1px solid var(--cl-line); border-left: 0; }
    .form { grid-template-columns: minmax(0, 1fr); }
    .form__wide, .form.is-identity .cl-label:first-child { grid-column: 1; }
    .logo-field { grid-template-columns: 64px minmax(0, 1fr); }
    .logo-field__actions { grid-column: 1 / -1; }
  }
</style>
