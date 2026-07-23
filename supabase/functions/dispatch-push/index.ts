import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @deno-types="npm:@types/web-push@3.6.4"
import webPush from 'npm:web-push@3.6.7';
import { addDays, todayInTimezone } from '../../../src/lib/calendar/date.ts';
import { deriveNotifications } from '../../../src/lib/notifications/notification-derived.ts';
import {
  isImplementedNotificationTypeCode,
  isNotificationTypeCode,
  type NotificationItem
} from '../../../src/lib/notifications/notification-model.ts';
import { notificationPushCopy } from '../../../src/lib/notifications/push-copy.ts';
import { deriveCommunicationNotifications } from '../../../src/lib/communications/communication-notifications.ts';
import { parseCommunicationsReadModel } from '../../../src/lib/communications/communications-model.ts';
import type {
  EmployeeOperationsReadModel,
  ManagerOperationsReadModel,
  TeamReadModel
} from '../../../src/lib/api/workspace-snapshot.ts';
import type { Database, Json, Tables } from '../../../src/lib/supabase/database.types.ts';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const dispatchSecret = Deno.env.get('PUSH_DISPATCH_SECRET') ?? '';
const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? '';

const LOOKBACK_DAYS = 14;
const LOOKAHEAD_DAYS = 48;
const MAX_SUBSCRIPTIONS = 500;
const MAX_DELIVERIES = 200;
const RETRY_AFTER_MINUTES = 15;
const MAX_ATTEMPTS = 5;

type PushSubscriptionRow = Tables<'push_subscriptions'>;
type PushDeliveryRow = Tables<'push_notification_deliveries'>;
type Membership = Pick<
  Tables<'restaurant_memberships'>,
  'restaurant_id' | 'profile_id' | 'role' | 'status'
>;
type RestaurantTimezone = Pick<Tables<'restaurant_settings'>, 'restaurant_id' | 'timezone'>;
type DispatchContext = {
  role: 'owner' | 'manager' | 'employee';
  employee_id: string | null;
  timezone: string;
  operations: ManagerOperationsReadModel | EmployeeOperationsReadModel;
  team: TeamReadModel | null;
  communications: Json;
};

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function roleApplies(audience: string, role: string): boolean {
  return audience === 'both' || (role === 'employee' ? audience === 'employee' : audience === 'manager');
}

function pushEnabled(
  type: Tables<'notification_types'>,
  preferences: Tables<'notification_preferences'>[]
): boolean {
  return preferences.find((row) => row.notification_type === type.code)?.push_enabled ??
    type.default_push_enabled;
}

function targetUrl(item: NotificationItem, restaurantId: string): string {
  const target = new URL(item.targetUrl, 'https://restogogo.invalid');
  target.searchParams.set('push_key', item.key);
  target.searchParams.set('push_type', item.type);
  target.searchParams.set('push_restaurant', restaurantId);
  return `${target.pathname}${target.search}`;
}

function retryable(delivery: PushDeliveryRow, now: Date): boolean {
  if (delivery.status === 'sent' || delivery.attempt_count >= MAX_ATTEMPTS) return false;
  return now.getTime() - new Date(delivery.last_attempt_at).getTime() >= RETRY_AFTER_MINUTES * 60_000;
}

function statusCode(error: unknown): number | null {
  const value = (error as { statusCode?: unknown })?.statusCode;
  return typeof value === 'number' ? value : null;
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  if (!url || !serviceKey || !dispatchSecret || !vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    return json({ error: 'Push dispatch is not configured.' }, 500);
  }
  if (request.headers.get('x-restogogo-push-secret') !== dispatchSecret) {
    return json({ error: 'Push dispatch authentication failed.' }, 401);
  }

  let dryRun = false;
  try {
    dryRun = Boolean((await request.json())?.dry_run);
  } catch {
    // An empty scheduler request is valid.
  }

  webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  const admin = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const now = new Date();
  const counters = { subscriptions: 0, contexts: 0, candidates: 0, sent: 0, failed: 0, disabled: 0 };

  const { data: subscriptions, error: subscriptionsError } = await admin
    .from('push_subscriptions')
    .select('*')
    .eq('active', true)
    .order('updated_at', { ascending: true })
    .limit(MAX_SUBSCRIPTIONS);
  if (subscriptionsError) return json({ error: 'Push subscriptions could not be loaded.' }, 500);
  if (!subscriptions?.length) return json({ ok: true, dry_run: dryRun, ...counters });
  counters.subscriptions = subscriptions.length;

  const profileIds = [...new Set(subscriptions.map((row) => row.profile_id))];
  const [{ data: memberships, error: membershipsError }, { data: types, error: typesError }] =
    await Promise.all([
      admin.from('restaurant_memberships')
        .select('restaurant_id,profile_id,role,status')
        .in('profile_id', profileIds)
        .eq('status', 'active'),
      admin.from('notification_types').select('*').eq('active', true)
    ]);
  if (membershipsError || typesError) return json({ error: 'Push delivery context could not be loaded.' }, 500);

  const activeTypes = (types ?? []).filter(
    (row) => isNotificationTypeCode(row.code) && isImplementedNotificationTypeCode(row.code)
  );
  const restaurantIds = [...new Set((memberships ?? []).map((row) => row.restaurant_id))];
  const { data: restaurantSettings, error: restaurantSettingsError } = restaurantIds.length
    ? await admin.from('restaurant_settings').select('restaurant_id,timezone').in('restaurant_id', restaurantIds)
    : { data: [] as RestaurantTimezone[], error: null };
  if (restaurantSettingsError) return json({ error: 'Restaurant timezones could not be loaded.' }, 500);
  const timezoneByRestaurant = new Map(
    (restaurantSettings ?? []).map((row) => [row.restaurant_id, row.timezone])
  );
  let deliveryBudget = MAX_DELIVERIES;

  for (const membership of (memberships ?? []) as Membership[]) {
    if (deliveryBudget <= 0) break;
    const profileSubscriptions = subscriptions.filter((row) => row.profile_id === membership.profile_id);
    if (!profileSubscriptions.length) continue;

    const timezone = timezoneByRestaurant.get(membership.restaurant_id) || 'Europe/Brussels';
    const today = todayInTimezone(timezone);
    const from = addDays(today, -LOOKBACK_DAYS);
    const to = addDays(today, LOOKAHEAD_DAYS);
    const { data: rawContext, error: contextError } = await admin.rpc('get_push_dispatch_context', {
      p_profile_id: membership.profile_id,
      p_restaurant_id: membership.restaurant_id,
      p_from_date: from,
      p_to_date: to
    });
    if (contextError || !rawContext || typeof rawContext !== 'object') continue;
    const context = rawContext as unknown as DispatchContext;
    counters.contexts += 1;

    const contextToday = todayInTimezone(context.timezone || timezone);
    const operationalItems = context.role === 'employee'
      ? deriveNotifications({
          restaurantId: membership.restaurant_id,
          role: 'employee',
          employeeId: context.employee_id,
          today: contextToday,
          now,
          timezone: context.timezone,
          operations: context.operations as EmployeeOperationsReadModel
        })
      : deriveNotifications({
          restaurantId: membership.restaurant_id,
          role: context.role,
          employeeId: context.employee_id,
          today: contextToday,
          now,
          timezone: context.timezone,
          operations: context.operations as ManagerOperationsReadModel,
          team: context.team
        });
    const items = [
      ...operationalItems,
      ...deriveCommunicationNotifications({
        restaurantId: membership.restaurant_id,
        role: context.role,
        employeeId: context.employee_id,
        communications: parseCommunicationsReadModel(context.communications)
      })
    ];

    const { data: preferences, error: preferencesError } = await admin
      .from('notification_preferences')
      .select('*')
      .eq('restaurant_id', membership.restaurant_id)
      .eq('profile_id', membership.profile_id);
    if (preferencesError) continue;
    const typeByCode = new Map(activeTypes.map((row) => [row.code, row]));
    const eligible = items.filter((item) => {
      const type = typeByCode.get(item.type);
      return type && roleApplies(type.audience, context.role) &&
        pushEnabled(type, preferences ?? []);
    });

    for (const subscription of profileSubscriptions) {
      if (deliveryBudget <= 0) break;
      const enabledAt = new Date(subscription.enabled_at).getTime() - 5 * 60_000;
      const deviceItems = eligible.filter((item) => new Date(item.createdAt).getTime() >= enabledAt);
      if (!deviceItems.length) continue;
      const keys = deviceItems.map((item) => item.key);
      const { data: deliveries } = await admin.from('push_notification_deliveries')
        .select('*')
        .eq('subscription_id', subscription.id)
        .eq('restaurant_id', membership.restaurant_id)
        .in('notification_key', keys);
      const deliveryByKey = new Map((deliveries ?? []).map((row) => [row.notification_key, row]));

      for (const item of deviceItems) {
        if (deliveryBudget <= 0) break;
        const previous = deliveryByKey.get(item.key);
        if (previous && !retryable(previous, now)) continue;
        counters.candidates += 1;
        if (dryRun) continue;

        let deliveryId = previous?.id ?? '';
        if (previous) {
          const { error } = await admin.from('push_notification_deliveries').update({
            status: 'pending',
            attempt_count: previous.attempt_count + 1,
            last_attempt_at: now.toISOString(),
            error_message: null
          }).eq('id', previous.id);
          if (error) continue;
        } else {
          const { data: inserted, error } = await admin.from('push_notification_deliveries').insert({
            subscription_id: subscription.id,
            restaurant_id: membership.restaurant_id,
            notification_key: item.key,
            notification_type: item.type
          }).select('id').single();
          if (error || !inserted) continue;
          deliveryId = inserted.id;
        }

        deliveryBudget -= 1;
        const copy = notificationPushCopy(item, subscription.locale);
        try {
          await webPush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth_key }
            },
            JSON.stringify({
              ...copy,
              url: targetUrl(item, membership.restaurant_id),
              key: item.key,
              type: item.type,
              restaurantId: membership.restaurant_id,
              severity: item.severity
            }),
            { TTL: item.type === 'shift_soon' ? 86_400 : 604_800, urgency: item.severity === 'critical' ? 'high' : 'normal' }
          );
          await admin.from('push_notification_deliveries').update({
            status: 'sent', sent_at: new Date().toISOString(), error_message: null
          }).eq('id', deliveryId);
          counters.sent += 1;
        } catch (error) {
          const code = statusCode(error);
          const message = error instanceof Error ? error.message : String(error);
          await admin.from('push_notification_deliveries').update({
            status: 'failed', error_message: message.slice(0, 1000)
          }).eq('id', deliveryId);
          counters.failed += 1;
          if (code === 404 || code === 410) {
            await admin.from('push_subscriptions').update({
              active: false, revoked_at: new Date().toISOString()
            }).eq('id', subscription.id);
            counters.disabled += 1;
          }
        }
      }
    }
  }

  return json({ ok: true, dry_run: dryRun, ...counters });
});
