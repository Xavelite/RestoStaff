// Interactive help tour — an on-demand, spotlight-guided walkthrough of the
// real interface. It is never launched automatically: a page's tour only runs
// when the user asks for it (the topbar help button or the account menu), and
// it can always be restarted. Scripts live in tour-registry.ts, keyed by route
// and role; this module owns the runtime state and step navigation.

export type TourPlacement = 'auto' | 'top' | 'bottom' | 'left' | 'right';

export type TourAction = {
  click?: string | string[];
  waitFor?: string;
};

export type TourStep = {
  // CSS selector of the real element to spotlight — by convention
  // `[data-tour="<id>"]`. Omit for a centered card (intro / outro / a section
  // with no single anchor).
  target?: string;
  title: string;
  body: string;
  // Optional second line: the concrete "how to do it".
  how?: string;
  placement?: TourPlacement;
  // Extra breathing room around the spotlight, in px (default 8).
  padding?: number;
  // Safe, presentational interactions the guide performs while entering or
  // leaving a step (for example opening a coverage lens, then closing it).
  enter?: TourAction;
  leave?: TourAction;
};

export type TourScript = {
  key: string; // stable id per page+role, e.g. "home:manager"
  label: string; // human name, e.g. "Home tour"
  steps: TourStep[];
};

const SEEN_KEY = 'rst-tours-seen';

function readSeen(): Set<string> {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(list) ? list.map(String) : []);
  } catch {
    return new Set();
  }
}

function writeSeen(seen: Set<string>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
  } catch {
    // Ignore storage failures — the tour still works, we just can't remember.
  }
}

class TourController {
  active = $state(false);
  steps = $state<TourStep[]>([]);
  index = $state(0);
  key = $state('');
  label = $state('');
  // Bumped on every resize/scroll/step so the overlay recomputes geometry.
  tick = $state(0);
  // Tracks which tours have been completed at least once. Used only to soften
  // the first-time hint — never to auto-start a tour.
  seen = $state<Set<string>>(readSeen());

  current = $derived(this.steps[this.index] ?? null);
  total = $derived(this.steps.length);
  isFirst = $derived(this.index <= 0);
  isLast = $derived(this.index >= this.steps.length - 1);

  start(script: TourScript, from = 0): void {
    if (!script.steps.length) return;
    this.key = script.key;
    this.label = script.label;
    this.steps = script.steps;
    this.index = Math.min(Math.max(from, 0), script.steps.length - 1);
    this.active = true;
  }

  next(): void {
    if (this.isLast) {
      this.finish();
    } else {
      this.index += 1;
    }
  }

  back(): void {
    if (!this.isFirst) this.index -= 1;
  }

  goto(i: number): void {
    if (i >= 0 && i < this.steps.length) this.index = i;
  }

  // Explicit early exit (Skip / Close / Esc). Does not mark the tour seen.
  close(): void {
    this.active = false;
    this.steps = [];
    this.index = 0;
    this.key = '';
    this.label = '';
  }

  // Reached the end — remember it, then close.
  finish(): void {
    if (this.key) {
      const seen = new Set(this.seen);
      seen.add(this.key);
      this.seen = seen;
      writeSeen(seen);
    }
    this.close();
  }

  hasSeen(key: string): boolean {
    return this.seen.has(key);
  }

  get hasSeenAny(): boolean {
    return this.seen.size > 0;
  }
}

export const tour = new TourController();
