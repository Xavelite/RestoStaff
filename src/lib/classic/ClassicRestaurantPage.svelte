<script lang="ts">
  import { onMount, setContext, untrack, type Snippet } from 'svelte';
  import { friendlyError } from '$lib/api/error-messages';
  import { t } from '$lib/i18n/i18n.svelte';
  import { unsavedChanges } from '$lib/navigation/unsaved-changes.svelte';
  import { restaurantDraftValidationError } from '$lib/restaurant/restaurant-model';
  import type { ReservationFloorPlansDraft } from '$lib/reservations/reservation-types';
  import { toasts } from '$lib/ui/toast.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import ClassicPage from './ClassicPage.svelte';
  import { restaurantConfig } from './classic-restaurant.svelte';
  import { CLASSIC_RESTAURANT_CONTEXT, type ClassicRestaurantContext } from './classic-workspace-context';

  /**
   * One shared Restaurant draft and persistence contract across every tab. Each
   * page owns its table controls while the shared panel owns save and discard.
   */
  let {
    children
  }: {
    children: Snippet<[ClassicRestaurantContext]>;
  } = $props();

  let saving = $state(false);
  const snapshot = $derived(workspace.restaurant);

  $effect(() => {
    if (workspace.activeId && ['owner', 'manager'].includes(workspace.effectiveRole ?? '')) {
      void workspace.loadRestaurant().catch(() => undefined);
    }
  });

  $effect(() => {
    const source = snapshot;
    if (source) untrack(() => restaurantConfig.sync(source));
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

  async function saveAreas(
    floorPlans: ReservationFloorPlansDraft,
    expectedRevision: number
  ): Promise<void> {
    if (!workspace.activeId || !snapshot || !restaurantConfig.draft || saving) return;
    const validationError = restaurantDraftValidationError(restaurantConfig.draft);
    if (validationError) {
      const error = new Error(t(validationError));
      toasts.show(error.message, 'warning');
      throw error;
    }
    saving = true;
    try {
      await restaurantConfig.saveAreas(
        workspace.activeId,
        snapshot,
        floorPlans,
        expectedRevision
      );
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
      navigationScopes: ['/restaurant'],
      isDirty: () => restaurantConfig.dirty,
      save,
      discard
    })
  );


  const context = $derived<ClassicRestaurantContext | null>(restaurantConfig.draft ? {
    draft: restaurantConfig.draft,
    dirty: restaurantConfig.dirty,
    saving,
    canSave: !workspace.isPreview,
    save,
    saveAreas,
    discard
  } : null);

  setContext(CLASSIC_RESTAURANT_CONTEXT, () => context!);
</script>

<ClassicPage>
  {#if context}
    {@render children(context)}
  {:else}
    <div class="cl-card">
      <div class="cl-empty"><strong>{t('Loading your workspace')}</strong></div>
    </div>
  {/if}
</ClassicPage>
