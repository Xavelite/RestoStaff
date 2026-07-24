<script lang="ts">
  import { t } from '$lib/i18n/i18n.svelte';
  import ClassicRestaurantPage from '$lib/classic/ClassicRestaurantPage.svelte';
  import { restaurantConfig } from '$lib/classic/classic-restaurant.svelte';
</script>

<svelte:head><title>{t('Restaurant')} &middot; restogogo</title></svelte:head>

<ClassicRestaurantPage>
  {#snippet children(draft)}
    <section class="cl-card">
      <div class="cl-card__head"><h2>{t('Legal identity')}</h2></div>
      <div class="cl-card__body">
        <div class="form">
          <label class="cl-label">
            <span>{t('Legal name')}</span>
            <input class="cl-field" bind:value={draft.legalName} oninput={() => restaurantConfig.touch()} />
          </label>
          <label class="cl-label">
            <span>{t('Company number')}</span>
            <input class="cl-field" bind:value={draft.companyNumber} oninput={() => restaurantConfig.touch()} />
          </label>
        </div>
      </div>
    </section>

    <section class="cl-card">
      <div class="cl-card__head"><h2>{t('Contact')}</h2></div>
      <div class="cl-card__body">
        <div class="form">
          <label class="cl-label">
            <span>{t('Email')}</span>
            <input class="cl-field" type="email" bind:value={draft.email} oninput={() => restaurantConfig.touch()} />
          </label>
          <label class="cl-label">
            <span>{t('Phone')}</span>
            <input class="cl-field" bind:value={draft.phone} oninput={() => restaurantConfig.touch()} />
          </label>
        </div>
      </div>
    </section>

    <section class="cl-card">
      <div class="cl-card__head"><h2>{t('Address')}</h2></div>
      <div class="cl-card__body">
        <div class="form">
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
      </div>
    </section>
  {/snippet}
</ClassicRestaurantPage>

<style>
  .form {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
    max-width: 720px;
  }
  .form__wide {
    grid-column: 1 / -1;
  }
  @media (max-width: 760px) {
    .form { grid-template-columns: minmax(0, 1fr); }
  }
</style>

