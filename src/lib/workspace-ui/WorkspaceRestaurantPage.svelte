<script lang="ts">
  import { onMount, setContext, untrack, type Snippet } from 'svelte';
  import { friendlyError } from '$lib/api/error-messages';
  import { t } from '$lib/i18n/i18n.svelte';
  import { unsavedChanges } from '$lib/navigation/unsaved-changes.svelte';
  import { restaurantDraftValidationError } from '$lib/restaurant/restaurant-model';
  import { toasts } from '$lib/ui/toast.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import WorkspacePage from './WorkspacePage.svelte';
  import { restaurantConfig } from './workspace-restaurant.svelte';
  import { WORKSPACE_RESTAURANT_CONTEXT, type WorkspaceRestaurantContext } from './workspace-context';

  /**
   * One shared Restaurant draft and persistence contract across every tab. Each
   * page owns its table controls while the shared panel owns save and discard.
   */
  let {
    children
  }: {
    children: Snippet<[WorkspaceRestaurantContext]>;
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

  onMount(() =>
    unsavedChanges.register({
      id: 'restaurant-workspace',
      label: 'Restaurant',
      navigationScopes: ['/restaurant', '/settings'],
      isDirty: () => restaurantConfig.dirty,
      save,
      discard
    })
  );


  const context = $derived<WorkspaceRestaurantContext | null>(restaurantConfig.draft ? {
    draft: restaurantConfig.draft,
    dirty: restaurantConfig.dirty,
    saving,
    canSave: !workspace.isPreview,
    save,
    discard
  } : null);

  setContext(WORKSPACE_RESTAURANT_CONTEXT, () => context!);
</script>

<WorkspacePage>
  {#if context}
    {@render children(context)}
  {:else}
    <div class="cl-card">
      <div class="cl-empty"><strong>{t('Loading your workspace')}</strong></div>
    </div>
  {/if}
</WorkspacePage>
