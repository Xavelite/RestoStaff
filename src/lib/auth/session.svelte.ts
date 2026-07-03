import { supabase } from '$lib/supabase/client';
import type { Session, User, Subscription } from '@supabase/supabase-js';

// Single reactive source of truth for "who is signed in".
// Initialised once at app start and kept in sync with Supabase auth events.
// Components read auth.session / auth.user / auth.ready reactively.
class AuthStore {
  session = $state<Session | null>(null);
  ready = $state(false);
  error = $state('');
  #started = false;
  #subscription: Subscription | null = null;

  get user(): User | null {
    return this.session?.user ?? null;
  }

  async init(): Promise<void> {
    if (this.#started) return;
    this.#started = true;
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      this.session = data.session;
      this.#subscription = supabase.auth.onAuthStateChange((_event, next) => {
        this.session = next;
      }).data.subscription;
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      this.session = null;
    } finally {
      this.ready = true;
    }
  }

  async signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  destroy(): void {
    this.#subscription?.unsubscribe();
    this.#subscription = null;
    this.#started = false;
  }
}

export const auth = new AuthStore();
