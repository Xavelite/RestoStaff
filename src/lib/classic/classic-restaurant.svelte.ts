import { untrack } from 'svelte';
import type { RestaurantReadModel } from '$lib/api/workspace-snapshot';
import { saveRestaurant } from '$lib/api/mutations';
import { restaurantDraft, restaurantSavePayload, type RestaurantDraft } from '$lib/restaurant/restaurant-model';
import { workspace } from '$lib/workspace/workspace.svelte';
import { storeAreaColors } from '$lib/ui/position-color';

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
  #loadedRestaurantId = '';
  #loadedKey = '';

  sync(snapshot: RestaurantReadModel, force = false): void {
    const restaurantId = snapshot.restaurant.id;
    const key = JSON.stringify([
      snapshot.restaurant,
      snapshot.restaurant_settings,
      snapshot.job_functions,
      snapshot.work_areas,
      snapshot.area_service_defaults,
      snapshot.opening_hours,
      snapshot.coverage_requirements
    ]);
    if (
      !force &&
      untrack(() => this.#loadedRestaurantId === restaurantId && (this.dirty || this.#loadedKey === key))
    ) return;
    this.#loadedRestaurantId = restaurantId;
    this.#loadedKey = key;
    this.draft = restaurantDraft(snapshot);
    this.dirty = false;
  }

  /** Re-read from the server, discarding whatever was being edited. */
  reload(snapshot: RestaurantReadModel): void {
    this.#loadedRestaurantId = '';
    this.#loadedKey = '';
    this.dirty = false;
    this.sync(snapshot, true);
  }

  touch(): void {
    this.dirty = true;
  }

  async save(restaurantId: string, snapshot: RestaurantReadModel): Promise<void> {
    if (!this.draft) return;
    storeAreaColors(restaurantId, this.draft.areas.map((area) => ({ id: area.id, color: area.color })));
    await saveRestaurant(restaurantId, restaurantSavePayload(snapshot, this.draft));
    this.#loadedRestaurantId = '';
    this.#loadedKey = '';
    this.dirty = false;
    await workspace.loadRestaurant(true);
  }
}

export const restaurantConfig = new ClassicRestaurantDraft();
