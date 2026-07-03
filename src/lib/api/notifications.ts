import { supabase } from '$lib/supabase/client';
import type { Tables } from '$lib/supabase/database.types';
import { toApiError } from './error';

export type NotificationTypeRow = Tables<'notification_types'>;
export type NotificationPreferenceRow = Tables<'notification_preferences'>;
export type NotificationReceiptRow = Tables<'notification_receipts'>;

export async function getCurrentProfileId(): Promise<string> {
  const { data, error } = await supabase.rpc('current_profile_id');
  if (error) throw toApiError(error, 'Profile could not be loaded.');
  if (!data) throw new Error('Profile is not linked to this account.');
  return data;
}

export async function getNotificationTypes(): Promise<NotificationTypeRow[]> {
  const { data, error } = await supabase
    .from('notification_types')
    .select('*')
    .eq('active', true)
    .order('sort_order', { ascending: true });
  if (error) throw toApiError(error, 'Notification types could not be loaded.');
  return data ?? [];
}

export async function getNotificationPreferences(input: {
  restaurantId: string;
  profileId: string;
}): Promise<NotificationPreferenceRow[]> {
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('restaurant_id', input.restaurantId)
    .eq('profile_id', input.profileId);
  if (error) throw toApiError(error, 'Notification settings could not be loaded.');
  return data ?? [];
}

export async function saveNotificationPreference(input: {
  restaurantId: string;
  profileId: string;
  notificationType: string;
  inAppEnabled: boolean;
  pushEnabled?: boolean;
}): Promise<void> {
  const { error } = await supabase.from('notification_preferences').upsert(
    {
      restaurant_id: input.restaurantId,
      profile_id: input.profileId,
      notification_type: input.notificationType,
      in_app_enabled: input.inAppEnabled,
      push_enabled: input.pushEnabled ?? false
    },
    { onConflict: 'restaurant_id,profile_id,notification_type' }
  );
  if (error) throw toApiError(error, 'Notification setting could not be saved.');
}

export async function getNotificationReceipts(input: {
  restaurantId: string;
  profileId: string;
}): Promise<NotificationReceiptRow[]> {
  const { data, error } = await supabase
    .from('notification_receipts')
    .select('*')
    .eq('restaurant_id', input.restaurantId)
    .eq('profile_id', input.profileId);
  if (error) throw toApiError(error, 'Notification read state could not be loaded.');
  return data ?? [];
}

export async function saveNotificationReceipt(input: {
  restaurantId: string;
  profileId: string;
  notificationKey: string;
  notificationType: string;
  readAt?: string | null;
  dismissedAt?: string | null;
}): Promise<void> {
  const { error } = await supabase.from('notification_receipts').upsert(
    {
      restaurant_id: input.restaurantId,
      profile_id: input.profileId,
      notification_key: input.notificationKey,
      notification_type: input.notificationType,
      read_at: input.readAt ?? null,
      dismissed_at: input.dismissedAt ?? null
    },
    { onConflict: 'restaurant_id,profile_id,notification_key' }
  );
  if (error) throw toApiError(error, 'Notification state could not be saved.');
}
