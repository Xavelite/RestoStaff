// Small, self-contained UI sounds. Tones are synthesised with the Web Audio
// API rather than shipped as audio files: nothing to download, nothing for the
// static build or CSP to serve, and the cues stay a few hundred bytes of code.
//
// Sound is a courtesy, never a demand: every cue is short and soft, the user
// can mute it permanently, and browsers only let us make noise after they have
// interacted with the page (see unlock).

type SoundKind = 'notification' | 'message' | 'success' | 'error' | 'popcorn';

const STORAGE_KEY = 'rst-sound-enabled';

// [frequency Hz, start offset ms, duration ms] — deliberately short and quiet.
const VOICES: Record<SoundKind, Array<[number, number, number]>> = {
  // Two-note rise: something arrived and wants a glance.
  notification: [
    [784, 0, 130],
    [1047, 95, 210]
  ],
  // A single soft note for a team message.
  message: [[659, 0, 170]],
  // Small upward flourish when something the user did succeeded.
  success: [
    [659, 0, 95],
    [784, 80, 95],
    [1047, 160, 230]
  ],
  // Low, brief, non-alarming.
  error: [
    [311, 0, 170],
    [247, 115, 250]
  ],
  // Three soft, low pops for the optional workspace pet.
  popcorn: [
    [175, 0, 95],
    [147, 135, 100],
    [210, 285, 115]
  ]
};

const PEAK_GAIN = 0.085;

class SoundController {
  enabled = $state(true);
  #ctx: AudioContext | null = null;

  constructor() {
    if (typeof localStorage === 'undefined') return;
    try {
      this.enabled = localStorage.getItem(STORAGE_KEY) !== 'off';
    } catch {
      // Storage can be unavailable (private mode); default to on.
    }
  }

  setEnabled(value: boolean): void {
    this.enabled = value;
    try {
      localStorage.setItem(STORAGE_KEY, value ? 'on' : 'off');
    } catch {
      // Preference simply will not persist.
    }
    // Turning it on is itself a gesture, so confirm audibly what it sounds like.
    if (value) this.play('message');
  }

  toggle(): void {
    this.setEnabled(!this.enabled);
  }

  #context(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      this.#ctx ??= new Ctor();
    } catch {
      return null;
    }
    return this.#ctx;
  }

  // Browsers start the audio clock suspended until the page has been
  // interacted with. Call this from a real gesture so later cues can play.
  unlock(): void {
    const ctx = this.#context();
    if (ctx?.state === 'suspended') void ctx.resume().catch(() => undefined);
  }

  play(kind: SoundKind): void {
    if (!this.enabled) return;
    const ctx = this.#context();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);

    const now = ctx.currentTime;
    for (const [frequency, startMs, durationMs] of VOICES[kind]) {
      const start = now + startMs / 1000;
      const duration = durationMs / 1000;
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = kind === 'popcorn' ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(frequency, start);
        if (kind === 'popcorn') {
          osc.frequency.exponentialRampToValueAtTime(frequency * 0.48, start + duration);
        }
        // Quick fade in, exponential tail out — no clicks, no ringing.
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.linearRampToValueAtTime(kind === 'popcorn' ? 0.11 : PEAK_GAIN, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + duration + 0.02);
      } catch {
        // A failed cue must never interrupt the actual interaction.
        return;
      }
    }
  }
}

export const sound = new SoundController();
