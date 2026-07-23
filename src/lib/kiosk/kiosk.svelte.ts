// Kiosk lock: when the owner launches the badge terminal on a shared device,
// the app enters a locked, chrome-less kiosk. All manager navigation is hidden
// and any attempt to leave the terminal route bounces back until a manager
// unlocks with their PIN (or signs out). The flag is persisted so a reload or
// accidental refresh on the tablet stays in the kiosk.
const STORAGE_KEY = 'rst-kiosk-locked';

class KioskState {
  locked = $state(false);

  constructor() {
    if (typeof localStorage !== 'undefined') {
      this.locked = localStorage.getItem(STORAGE_KEY) === '1';
    }
  }

  lock() {
    this.locked = true;
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, '1');
  }

  unlock() {
    this.locked = false;
    if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
  }
}

export const kiosk = new KioskState();
