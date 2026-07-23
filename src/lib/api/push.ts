import { supabase } from '$lib/supabase/client';
import { toApiError } from './error';

export type BrowserPushSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export async function registerPushSubscription(input: {
  restaurantId: string;
  subscription: BrowserPushSubscription;
  locale: string;
  deviceName: string;
  userAgent: string;
}): Promise<void> {
  const { error } = await supabase.rpc('register_push_subscription', {
    p_restaurant_id: input.restaurantId,
    p_endpoint: input.subscription.endpoint,
    p_p256dh: input.subscription.p256dh,
    p_auth_key: input.subscription.auth,
    p_locale: input.locale,
    p_device_name: input.deviceName,
    p_user_agent: input.userAgent
  });
  if (error) throw toApiError(error, 'This device could not be connected to phone notifications.');
}

export async function unregisterPushSubscription(endpoint: string): Promise<void> {
  const { error } = await supabase.rpc('unregister_push_subscription', {
    p_endpoint: endpoint
  });
  if (error) throw toApiError(error, 'Phone notifications could not be disconnected.');
}
