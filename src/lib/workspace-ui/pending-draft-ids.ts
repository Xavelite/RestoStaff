/**
 * Tracks rows created during the current edit session.
 *
 * The tracker belongs beside the shared draft, not inside an individual route,
 * so changing workspace tabs does not make an unsaved row look persisted.
 */
export class PendingDraftIds {
  #ids = new Set<string>();

  add(id: string): void {
    this.#ids.add(id);
  }

  has(id: string): boolean {
    return this.#ids.has(id);
  }

  remove(id: string): void {
    this.#ids.delete(id);
  }

  reset(): void {
    this.#ids.clear();
  }
}
