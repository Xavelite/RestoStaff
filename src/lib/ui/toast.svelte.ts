export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

export type ToastMessage = {
  id: number;
  message: string;
  tone: ToastTone;
};

class ToastStore {
  messages = $state<ToastMessage[]>([]);
  #nextId = 1;

  show(message: string, tone: ToastTone = 'info', duration = 4500): number {
    const id = this.#nextId++;
    this.messages = [...this.messages, { id, message, tone }];
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
