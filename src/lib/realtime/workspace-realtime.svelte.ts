import { supabase } from '$lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type WorkspaceRealtimeEvent =
  | 'planning-saved'
  | 'actuals-updated'
  | 'team-updated'
  | 'restaurant-updated'
  | 'notification-refresh';

export type WorkspaceRealtimeEnvelope = {
  restaurantId: string;
  revision?: number | null;
  source: 'planning' | 'actuals' | 'team' | 'restaurant' | 'badge' | 'system';
};

class WorkspaceRealtime {
  connected = $state(false);
  lastEvent = $state<WorkspaceRealtimeEvent | ''>('');
  #channel: RealtimeChannel | null = null;
  #restaurantId = '';

  connect(restaurantId: string, onEvent: (event: WorkspaceRealtimeEvent) => void): void {
    if (this.#restaurantId === restaurantId && this.#channel) return;
    this.disconnect();
    this.#restaurantId = restaurantId;
    const channel = supabase.channel(`workspace:${restaurantId}`, {
      config: { private: true, broadcast: { self: false } }
    });
    const events: WorkspaceRealtimeEvent[] = [
      'planning-saved',
      'actuals-updated',
      'team-updated',
      'restaurant-updated',
      'notification-refresh'
    ];
    for (const event of events) {
      channel.on('broadcast', { event }, () => {
        this.lastEvent = event;
        onEvent(event);
      });
    }
    channel.subscribe((status) => {
      this.connected = status === 'SUBSCRIBED';
    });
    this.#channel = channel;
  }

  async publish(
    event: WorkspaceRealtimeEvent,
    payload: WorkspaceRealtimeEnvelope
  ): Promise<void> {
    if (!this.#channel || !this.connected || payload.restaurantId !== this.#restaurantId) return;
    await this.#channel.send({
      type: 'broadcast',
      event,
      payload
    });
  }

  disconnect(): void {
    if (this.#channel) void supabase.removeChannel(this.#channel);
    this.#channel = null;
    this.#restaurantId = '';
    this.connected = false;
  }
}

export const workspaceRealtime = new WorkspaceRealtime();
