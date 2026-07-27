import { sound } from '$lib/sound/sound.svelte';

type ToastTone = 'info' | 'success' | 'warning' | 'danger';

type ToastMessage = {
  id: number;
  message: string;
  tone: ToastTone;
};

// A toast is already the app's "that happened" signal, so it is the natural
// single place to sound one. Only outcomes get a cue: something worked, or
// something failed. Info and warning stay silent so the room stays quiet.
const TONE_SOUND = { success: 'success', danger: 'error' } as const;

class ToastStore {
  messages = $state<ToastMessage[]>([]);
  #nextId = 1;

  show(message: string, tone: ToastTone = 'info', duration = 4500): number {
    const id = this.#nextId++;
    this.messages = [...this.messages, { id, message, tone }];
    const cue = TONE_SOUND[tone as keyof typeof TONE_SOUND];
    if (cue) sound.play(cue);
    if (duration > 0) globalThis.setTimeout(() => this.dismiss(id), duration);
    return id;
  }

  dismiss(id: number): void {
    this.messages = this.messages.filter((message) => message.id !== id);
  }

  clear(): void {
    this.messages = [];
  }
}

export const toasts = new ToastStore();
