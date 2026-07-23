import type { AppDesign } from './classic-routes';

const DESIGN_KEY = 'rst-design';

function readStoredDesign(): AppDesign {
  if (typeof localStorage === 'undefined') return 'modern';
  try {
    return localStorage.getItem(DESIGN_KEY) === 'classic' ? 'classic' : 'modern';
  } catch {
    return 'modern';
  }
}

/**
 * Which of the two designs this device prefers.
 *
 * The switch is a first-class feature, not scaffolding: the choice sticks per
 * device and sign-in lands on it, so someone who prefers the calmer classic
 * layout never sees the modern one again unless they ask for it.
 */
class DesignPreference {
  #preferred = $state<AppDesign>(readStoredDesign());

  get preferred(): AppDesign {
    return this.#preferred;
  }

  remember(design: AppDesign): void {
    // Assign without comparing: reading #preferred here would make every
    // caller inside an $effect depend on the preference, so remembering one
    // design would re-trigger the effect that remembers the other.
    this.#preferred = design;
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(DESIGN_KEY, design);
    } catch {
      // A device that refuses storage still gets the switch for this session.
    }
  }
}

export const design = new DesignPreference();
