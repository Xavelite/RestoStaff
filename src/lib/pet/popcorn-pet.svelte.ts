const STORAGE_KEY = 'rst-popcorn-pet-visible';

class PopcornPetController {
  visible = $state(false);
  sequence = $state(0);

  constructor() {
    if (typeof localStorage === 'undefined') return;
    try {
      this.visible = localStorage.getItem(STORAGE_KEY) === 'on';
    } catch {
      // The pet remains an in-session delight when storage is unavailable.
    }
  }

  summon(): void {
    this.visible = true;
    this.sequence += 1;
    this.#persist(true);
  }

  hide(): void {
    this.visible = false;
    this.#persist(false);
  }

  pop(): void {
    if (!this.visible) return;
    this.sequence += 1;
  }

  #persist(visible: boolean): void {
    try {
      localStorage.setItem(STORAGE_KEY, visible ? 'on' : 'off');
    } catch {
      // The visible state still applies until this page is closed.
    }
  }
}

export const popcornPet = new PopcornPetController();
