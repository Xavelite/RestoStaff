import { untrack } from 'svelte';
import type { RestaurantReadModel } from '$lib/api/workspace-snapshot';
import { saveRestaurant } from '$lib/api/mutations';
import { restaurantDraft, restaurantSavePayload, type RestaurantDraft } from '$lib/restaurant/restaurant-model';
import { workspace } from '$lib/workspace/workspace.svelte';

/**
 * The restaurant configuration being edited in the classic Restaurant module.
 *
 * save_restaurant_model takes identity, hours, areas, positions and coverage
 * in one call, so each sub-page edits its slice of one shared draft and Save
 * persists the whole thing — the same shape the RPC expects.
 */
class ClassicRestaurantDraft {
  draft = $state<RestaurantDraft | null>(null);
  dirty = $state(false);

  /** Plain, not $state: sync() must be safe to call from an $effect. */
  #loaded = false;

  sync(snapshot: RestaurantReadModel): void {
    if (untrack(() => this.#loaded)) return;
    this.#loaded = true;
    this.draft = restaurantDraft(snapshot);
    this.dirty = false;
  }

  /** Re-read from the server, discarding whatever was being edited. */
  reload(snapshot: RestaurantReadModel): void {
    this.#loaded = false;
    this.sync(snapshot);
  }

  touch(): void {
    this.dirty = true;
  }

  async save(restaurantId: string, snapshot: RestaurantReadModel): Promise<void> {
    if (!this.draft) return;
    await saveRestaurant(restaurantId, restaurantSavePayload(snapshot, this.draft));
    this.#loaded = false;
    this.dirty = false;
    await workspace.loadRestaurant(true);
  }
}

export const restaurantConfig = new ClassicRestaurantDraft();
