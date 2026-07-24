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
  <span class="toolbar-grow"></span>
  <button
    class="cl-btn is-icon"
    type="button"
    title={t('Discard')}
    aria-label={t('Discard')}
    disabled={saving || !restaurantConfig.dirty}
    onclick={() => snapshot && restaurantConfig.reload(snapshot)}
  ><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6"/><path d="M4 4v4.6h4.6"/></svg></button>
  <button
    class="cl-btn is-primary is-icon"
    type="button"
    title={t(saving ? 'Saving…' : 'Save')}
    aria-label={t(saving ? 'Saving…' : 'Save')}
    disabled={saving || workspace.isPreview || !restaurantConfig.dirty}
    onclick={save}
  >{#if saving}<span aria-hidden="true">…</span>{:else}<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h12l2 2v14H5z"/><path d="M8 4v6h8V4M8 20v-6h8v6"/></svg>{/if}</button>
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
