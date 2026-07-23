import { supabase } from '$lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type WorkspaceRealtimeEvent =
  | 'planning-saved'
  | 'actuals-updated'
  | 'team-updated'
  | 'restaurant-updated'
  | 'notification-refresh'
  | 'communications-updated';

export type WorkspaceRealtimeEnvelope = {
  restaurantId: string;
  revision?: number | null;
  source: 'planning' | 'actuals' | 'team' | 'restaurant' | 'badge' | 'system' | 'communications';
};

const WORKSPACE_EVENTS = new Set<WorkspaceRealtimeEvent>([
  'planning-saved',
  'actuals-updated',
  'team-updated',
  'restaurant-updated',
  'notification-refresh',
  'communications-updated'
]);

class WorkspaceRealtime {
  connected = $state(false);
  lastEvent = $state<WorkspaceRealtimeEvent | ''>('');
  eventSequence = $state(0);
  #channel: RealtimeChannel | null = null;
  #restaurantId = '';

  #record(event: WorkspaceRealtimeEvent): void {
    this.lastEvent = event;
    this.eventSequence += 1;
  }

  connect(restaurantId: string, onEvent: (event: WorkspaceRealtimeEvent) => void): void {
    if (this.#restaurantId === restaurantId && this.#channel) return;
    this.disconnect();
    this.#restaurantId = restaurantId;
    const channel = supabase.channel(`workspace-db:${restaurantId}`);
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'workspace_realtime_events',
        filter: `restaurant_id=eq.${restaurantId}`
      },
      (payload) => {
        const event = (payload.new as { event?: string } | null)?.event;
        if (event && WORKSPACE_EVENTS.has(event as WorkspaceRealtimeEvent)) {
          const workspaceEvent = event as WorkspaceRealtimeEvent;
          this.#record(workspaceEvent);
          onEvent(workspaceEvent);
        }
      }
    );
    channel.subscribe((status) => {
      this.connected = status === 'SUBSCRIBED';
    });
    this.#channel = channel;
  }

  async publish(
    event: WorkspaceRealtimeEvent,
    payload: WorkspaceRealtimeEnvelope
  ): Promise<void> {
    if (payload.restaurantId !== this.#restaurantId) return;
    if (!this.#channel || !this.connected) {
      this.#record(event);
      return;
    }
    const { error } = await supabase.rpc('publish_workspace_realtime_event', {
      p_restaurant_id: payload.restaurantId,
      p_event: event,
      p_source: payload.source
    });
    if (error) {
      // Realtime refreshes are advisory and must not turn a completed mutation
      // into a visible failure. Keep this session fresh even if signaling fails.
      this.#record(event);
      console.warn('Workspace Realtime signal failed', error.message);
    }
  }

  disconnect(): void {
    if (this.#channel) void supabase.removeChannel(this.#channel);
    this.#channel = null;
    this.#restaurantId = '';
    this.connected = false;
  }
}

export const workspaceRealtime = new WorkspaceRealtime();
