const STORAGE_KEY = 'rst-popcorn-pet-visible';
const POSITION_STORAGE_KEY = 'rst-popcorn-pet-position';
const AUDIO_STORAGE_KEY = 'rst-popcorn-pet-audio';

class PopcornPetController {
  visible = $state(false);
  sequence = $state(0);
  positionX = $state(0);
  positionY = $state(0);
  audioEnabled = $state(false);

  constructor() {
    if (typeof localStorage === 'undefined') return;
    try {
      this.visible = localStorage.getItem(STORAGE_KEY) === 'on';
      this.audioEnabled = localStorage.getItem(AUDIO_STORAGE_KEY) === 'on';
      const position = JSON.parse(localStorage.getItem(POSITION_STORAGE_KEY) ?? 'null');
      if (
        position &&
        Number.isFinite(position.x) &&
        Number.isFinite(position.y)
      ) {
        this.positionX = Number(position.x);
        this.positionY = Number(position.y);
      }
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

  setPosition(x: number, y: number, persist = false): void {
    this.positionX = Math.round(x);
    this.positionY = Math.round(y);
    if (persist) this.persistPosition();
  }

  persistPosition(): void {
    try {
      localStorage.setItem(
        POSITION_STORAGE_KEY,
        JSON.stringify({ x: this.positionX, y: this.positionY })
      );
    } catch {
      // Dragging still works for this session when storage is unavailable.
    }
  }

  toggleAudio(): void {
    this.audioEnabled = !this.audioEnabled;
    try {
      localStorage.setItem(AUDIO_STORAGE_KEY, this.audioEnabled ? 'on' : 'off');
    } catch {
      // The preference still applies until this page is closed.
    }
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
