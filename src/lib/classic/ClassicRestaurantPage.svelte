<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { friendlyError } from '$lib/api/error-messages';
  import { t } from '$lib/i18n/i18n.svelte';
  import { unsavedChanges } from '$lib/navigation/unsaved-changes.svelte';
  import { restaurantDraftValidationError, type RestaurantDraft } from '$lib/restaurant/restaurant-model';
  import { toasts } from '$lib/ui/toast.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import ClassicPage from './ClassicPage.svelte';
  import ClassicSaveBar from './ClassicSaveBar.svelte';
  import { restaurantConfig } from './classic-restaurant.svelte';

  /**
   * One shared Restaurant draft and persistence contract across every tab. Each
   * page owns its own controls (in the table strip); saving is the contextual
   * save bar below.
   */
  let {
    children
  }: {
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

  function discard(): void {
    if (snapshot) restaurantConfig.reload(snapshot);
  }

  async function save(): Promise<void> {
    if (!workspace.activeId || !snapshot || !restaurantConfig.draft || saving) return;
    const validationError = restaurantDraftValidationError(restaurantConfig.draft);
    if (validationError) {
      const error = new Error(t(validationError));
      toasts.show(error.message, 'warning');
      throw error;
    }
    saving = true;
    try {
      await restaurantConfig.save(workspace.activeId, snapshot);
      toasts.show(t('Restaurant setup saved.'), 'success');
    } catch (error) {
      toasts.show(friendlyError(error), 'danger');
      throw error;
    } finally {
      saving = false;
    }
  }

  onMount(() =>
    unsavedChanges.register({
      id: 'restaurant-workspace',
      label: 'Restaurant',
      isDirty: () => restaurantConfig.dirty,
      save,
      discard
    })
  );
</script>

<ClassicPage>
  <ClassicSaveBar
    dirty={restaurantConfig.dirty}
    {saving}
    canSave={!workspace.isPreview}
    onsave={() => void save().catch(() => undefined)}
    ondiscard={discard}
  />
  {#if restaurantConfig.draft}
    {@render children(restaurantConfig.draft)}
  {:else}
    <div class="cl-card">
      <div class="cl-empty"><strong>{t('Loading your workspace')}</strong></div>
    </div>
  {/if}
</ClassicPage>
