<script lang="ts">
  import type { Snippet } from 'svelte';
  import { friendlyError } from '$lib/api/error-messages';
  import { t } from '$lib/i18n/i18n.svelte';
  import { toasts } from '$lib/ui/toast.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import type { RestaurantDraft } from '$lib/restaurant/restaurant-model';
  import ClassicPage from './ClassicPage.svelte';
  import { restaurantConfig } from './classic-restaurant.svelte';

  /**
   * The shell every Restaurant sub-page shares: it loads the restaurant read
   * model, keeps the one shared draft in sync, and owns the Save / Discard
   * pair so every page saves the same way.
   */
  let {
    actions,
    children
  }: {
    /** Page-specific actions (Add area, Add position…) shown before Save. */
    actions?: Snippet;
    children: Snippet<[RestaurantDraft]>;
  } = $props();

  let saving = $state(false);
  const snapshot = $derived(workspace.restaurant);

  $effect(() => {
    if (workspace.activeId && workspace.effectiveRole === 'owner') {
      void workspace.loadRestaurant().catch(() => undefined);
    }
  });

  $effect(() => {
    if (snapshot) restaurantConfig.sync(snapshot);
  });

  async function save() {
    if (!workspace.activeId || !snapshot || saving) return;
    saving = true;
    try {
      await restaurantConfig.save(workspace.activeId, snapshot);
      toasts.show(t('Restaurant setup saved.'), 'success');
    } catch (error) {
      toasts.show(friendlyError(error), 'danger');
    } finally {
      saving = false;
    }
  }
</script>

{#snippet pageActions()}
  {#if actions}{@render actions()}{/if}
  <button
    class="cl-btn"
    type="button"
    disabled={saving || !restaurantConfig.dirty}
    onclick={() => snapshot && restaurantConfig.reload(snapshot)}
  >{t('Discard')}</button>
  <button
    class="cl-btn is-primary"
    type="button"
    disabled={saving || workspace.isPreview || !restaurantConfig.dirty}
    onclick={save}
  >{t(saving ? 'Saving…' : 'Save')}</button>
{/snippet}

<ClassicPage actions={pageActions}>
  {#if restaurantConfig.draft}
    {@render children(restaurantConfig.draft)}
  {:else}
    <div class="cl-card">
      <div class="cl-empty"><strong>{t('Loading your workspace')}</strong></div>
    </div>
  {/if}
</ClassicPage>
