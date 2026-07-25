<script lang="ts">
  import { friendlyError } from '$lib/api/error-messages';
  import { t } from '$lib/i18n/i18n.svelte';
  import { confirmAction } from '$lib/ui/confirm.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import ClassicRestaurantPage from '$lib/classic/ClassicRestaurantPage.svelte';
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
</script>

<svelte:head><title>{t('Restaurant')} &middot; restogogo</title></svelte:head>

<ClassicRestaurantPage>
  {#snippet children(context)}
    {@const draft = context.draft}
    <ClassicTablePanel dirty={context.dirty} saving={context.saving} canSave={context.canSave} onsave={() => void context.save().catch(() => undefined)} ondiscard={context.discard}>
      {#snippet meta()}
        <span>{draft.legalName || t('Restaurant identity')}</span>
      {/snippet}
      {#snippet children()}
    <section class="cl-card">
      <div class="cl-card__head"><h2>{t('Restaurant identity')}</h2></div>
      <div class="cl-card__body identity-layout">
        <section class="logo-field">
          <div class="logo-field__preview" class:is-empty={!logoUrl}>
            {#if logoUrl}<img src={logoUrl} alt={t('Restaurant logo')} />{:else}<span aria-hidden="true">{(draft.legalName || 'R').charAt(0).toUpperCase()}</span>{/if}
          </div>
          <div class="logo-field__copy">
            <strong>{t('Restaurant logo')}</strong>
            <small>{t('Shown on your badge terminal and paired devices. PNG, JPEG or WebP, up to 1 MB.')}</small>
            {#if logoError}<em>{logoError}</em>{/if}
          </div>
          <div class="logo-field__actions">
            <input id="restaurant-logo-input" type="file" accept={LOGO_ACCEPT} disabled={logoBusy} onchange={handleLogoChange} />
            <label class="cl-btn" for="restaurant-logo-input">{t(logoBusy ? 'Uploading…' : logoUrl ? 'Replace' : 'Upload logo')}</label>
            {#if logoUrl}<button class="cl-btn" type="button" disabled={logoBusy} onclick={removeLogo}>{t('Remove')}</button>{/if}
          </div>
        </section>

        <div class="form">
          <label class="cl-label"><span>{t('Legal name')}</span><input class="cl-field" bind:value={draft.legalName} oninput={() => restaurantConfig.touch()} /></label>
          <label class="cl-label"><span>{t('Company number')}</span><input class="cl-field" bind:value={draft.companyNumber} oninput={() => restaurantConfig.touch()} /></label>
          <label class="cl-label"><span>{t('Email')}</span><input class="cl-field" type="email" bind:value={draft.email} oninput={() => restaurantConfig.touch()} /></label>
          <label class="cl-label"><span>{t('Phone')}</span><input class="cl-field" bind:value={draft.phone} oninput={() => restaurantConfig.touch()} /></label>
          <label class="cl-label form__wide"><span>{t('Street and number')}</span><input class="cl-field" bind:value={draft.address} oninput={() => restaurantConfig.touch()} /></label>
          <label class="cl-label"><span>{t('Postal code')}</span><input class="cl-field" bind:value={draft.postalCode} oninput={() => restaurantConfig.touch()} /></label>
          <label class="cl-label"><span>{t('City')}</span><input class="cl-field" bind:value={draft.city} oninput={() => restaurantConfig.touch()} /></label>
        </div>
      </div>
      <div class="cl-card__foot regional">
        {t('Belgium')} · {snapshot?.restaurant_settings.timezone || 'Europe/Brussels'} · {snapshot?.restaurant_settings.locale || 'fr-BE'} · {snapshot?.restaurant_settings.currency_code || 'EUR'}
      </div>
    </section>
      {/snippet}
    </ClassicTablePanel>
  {/snippet}
</ClassicRestaurantPage>

<style>
  .identity-layout { display: grid; gap: 22px; }
  .form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; max-width: 760px; }
  .form__wide { grid-column: 1 / -1; }
  .logo-field { display: grid; grid-template-columns: 74px minmax(0, 1fr) auto; align-items: center; gap: 16px; max-width: 760px; padding-bottom: 20px; border-bottom: 1px solid var(--cl-line); }
  .logo-field__preview { width: 72px; height: 72px; display: grid; place-items: center; overflow: hidden; border: 1px solid var(--cl-line); border-radius: var(--cl-radius); background: var(--cl-surface-muted); color: var(--cl-accent); font-size: 28px; font-weight: var(--rst-fw-display); }
  .logo-field__preview img { width: 100%; height: 100%; object-fit: contain; }
  .logo-field__copy { display: grid; gap: 4px; }
  .logo-field__copy small { color: var(--cl-muted); font-size: 12px; line-height: 1.4; }
  .logo-field__copy em { color: var(--cl-problem); font-size: 12px; font-style: normal; }
  .logo-field__actions { display: flex; gap: 8px; }
  .logo-field__actions input { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  .regional { justify-content: flex-start; color: var(--cl-muted); font-size: 12px; }
  @media (max-width: 760px) { .form { grid-template-columns: minmax(0, 1fr); } .form__wide { grid-column: 1; } .logo-field { grid-template-columns: 64px minmax(0, 1fr); } .logo-field__actions { grid-column: 1 / -1; } }
</style>
