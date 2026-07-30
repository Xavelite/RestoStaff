/**
 * Keeps a grid row anchored to the values it had when the current edit
 * session began. The live draft remains the row rendered by the grid; this
 * snapshot is only for placement decisions such as filtering, sorting and
 * grouping.
 *
 * Existing rows are reset from server truth after a successful save, discard
 * or reload. New rows have no server truth yet, so their first rendered state
 * becomes their temporary anchor until they are saved or removed.
 */
export class StableDraftPlacement<T extends { id: string }> {
  #snapshots = new Map<string, T>();
  #clone: (value: T) => T;

  constructor(clone: (value: T) => T) {
    this.#clone = clone;
  }

  reset(committed: readonly T[]): void {
    const clone = this.#clone;
    this.#snapshots = new Map(
      committed.map((value) => [value.id, clone(value)])
    );
  }

  snapshotFor(draft: T): T {
    const snapshot = this.#snapshots.get(draft.id);
    if (snapshot) return snapshot;
    const clone = this.#clone;
    const initial = clone(draft);
    this.#snapshots.set(draft.id, initial);
    return initial;
  }

  remove(id: string): void {
    this.#snapshots.delete(id);
  }
}
