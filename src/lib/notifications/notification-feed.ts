import {
  getEmployeeOperationsReadModel,
  getManagerOperationsReadModel,
  getTeamReadModel,
  type WorkspaceRole
} from '$lib/api/workspace';
import {
  getCurrentProfileId,
  getNotificationPreferences,
  getNotificationReceipts,
  getNotificationTypes,
  saveNotificationPreference,
  saveNotificationReceipt,
  type NotificationPreferenceRow,
  type NotificationReceiptRow,
  type NotificationTypeRow
} from '$lib/api/notifications';
import { addDays, todayInTimezone } from '$lib/calendar/date';
import { deriveNotifications } from './notification-derived';
import type {
  NotificationFeed,
  NotificationItem,
  NotificationType,
  NotificationTypeCode
} from './notification-model';
import { isImplementedNotificationTypeCode, isNotificationTypeCode } from './notification-model';

export type NotificationLoadInput = {
  restaurantId: string;
  role: WorkspaceRole;
  employeeId: string | null;
  timezone: string;
};

const NOTIFICATION_LOOKBACK_DAYS = 14;
const NOTIFICATION_LOOKAHEAD_DAYS = 48;
const NOTIFICATION_MAX_READ_SPAN_DAYS = 63;

export type NotificationSettings = {
  profileId: string;
  types: NotificationType[];
  preferences: NotificationPreferenceRow[];
};

export type LoadedNotifications = NotificationSettings & {
  feed: NotificationFeed;
};

function typeRow(row: NotificationTypeRow): NotificationType | null {
  if (!isNotificationTypeCode(row.code)) return null;
  const action = row.default_action === 'popup' ? 'popup' : 'route';
  const audience = row.audience === 'employee' || row.audience === 'manager' || row.audience === 'both'
    ? row.audience
    : 'both';
  return { ...row, code: row.code, audience, default_action: action };
}

function preferenceEnabled(
  type: NotificationType,
  preferences: NotificationPreferenceRow[]
): boolean {
  return (
    preferences.find((preference) => preference.notification_type === type.code)?.in_app_enabled ??
    type.default_in_app_enabled
  );
}

function appliesToRole(type: NotificationType, role: WorkspaceRole): boolean {
  if (type.audience === 'both') return true;
  if (role === 'employee') return type.audience === 'employee';
  return type.audience === 'manager';
}

function notificationRange(timezone: string): { today: string; from: string; to: string } {
  const today = todayInTimezone(timezone || 'Europe/Brussels');
  const from = addDays(today, -NOTIFICATION_LOOKBACK_DAYS);
  const to = addDays(today, NOTIFICATION_LOOKAHEAD_DAYS);
  const span = NOTIFICATION_LOOKBACK_DAYS + NOTIFICATION_LOOKAHEAD_DAYS + 1;
  if (span > NOTIFICATION_MAX_READ_SPAN_DAYS) {
    throw new Error('Notification read window exceeds the operational read contract.');
  }
  return { today, from, to };
}

function applyState(input: {
  items: NotificationItem[];
  types: NotificationType[];
  preferences: NotificationPreferenceRow[];
  receipts: NotificationReceiptRow[];
  role: WorkspaceRole;
}): NotificationFeed {
  const typeByCode = new Map(input.types.map((type) => [type.code, type]));
  const receiptByKey = new Map(input.receipts.map((receipt) => [receipt.notification_key, receipt]));
  const items = input.items
    .filter((item) => {
      const type = typeByCode.get(item.type);
      return type && appliesToRole(type, input.role) && preferenceEnabled(type, input.preferences);
    })
    .map((item) => {
      const receipt = receiptByKey.get(item.key);
      return {
        ...item,
        readAt: receipt?.read_at ?? null,
        dismissedAt: receipt?.dismissed_at ?? null
      };
    })
    .filter((item) => !item.dismissedAt);

  return {
    items,
    unreadCount: items.filter((item) => !item.readAt).length
  };
}

export async function loadNotificationSettings(input: {
  restaurantId: string;
}): Promise<NotificationSettings> {
  const profileId = await getCurrentProfileId();
  const [typeRows, preferences] = await Promise.all([
    getNotificationTypes(),
    getNotificationPreferences({ restaurantId: input.restaurantId, profileId })
  ]);
  return {
    profileId,
    types: typeRows
      .map(typeRow)
      .filter((row): row is NotificationType => Boolean(row))
      .filter((type) => isImplementedNotificationTypeCode(type.code)),
    preferences
  };
}

export async function loadNotificationFeed(
  input: NotificationLoadInput,
  settings: NotificationSettings
): Promise<NotificationFeed> {
  const timezone = input.timezone || 'Europe/Brussels';
  const { today, from, to } = notificationRange(timezone);
  const now = new Date();
  const receipts = await getNotificationReceipts({
    restaurantId: input.restaurantId,
    profileId: settings.profileId
  });

  const rawItems = input.role === 'employee'
    ? deriveNotifications({
        restaurantId: input.restaurantId,
        role: 'employee',
        employeeId: input.employeeId,
        today,
        now,
        timezone,
        operations: await getEmployeeOperationsReadModel(input.restaurantId, from, to)
      })
    : deriveNotifications({
        restaurantId: input.restaurantId,
        role: input.role,
        employeeId: input.employeeId,
        today,
        now,
        timezone,
        operations: await getManagerOperationsReadModel(input.restaurantId, from, to),
        team: await getTeamReadModel(input.restaurantId).catch(() => null)
      });

  return applyState({
    items: rawItems,
    types: settings.types,
    preferences: settings.preferences,
    receipts,
    role: input.role
  });
}

export async function loadNotifications(
  input: NotificationLoadInput
): Promise<LoadedNotifications> {
  const settings = await loadNotificationSettings({ restaurantId: input.restaurantId });
  const feed = await loadNotificationFeed(input, settings);
  return { ...settings, feed };
}

export async function markNotificationRead(input: {
  restaurantId: string;
  profileId: string;
  item: NotificationItem;
}): Promise<void> {
  await saveNotificationReceipt({
    restaurantId: input.restaurantId,
    profileId: input.profileId,
    notificationKey: input.item.key,
    notificationType: input.item.type,
    readAt: new Date().toISOString(),
    dismissedAt: input.item.dismissedAt ?? null
  });
}

export async function dismissNotification(input: {
  restaurantId: string;
  profileId: string;
  item: NotificationItem;
}): Promise<void> {
  const now = new Date().toISOString();
  await saveNotificationReceipt({
    restaurantId: input.restaurantId,
    profileId: input.profileId,
    notificationKey: input.item.key,
    notificationType: input.item.type,
    readAt: input.item.readAt ?? now,
    dismissedAt: now
  });
}

export async function setNotificationTypeEnabled(input: {
  restaurantId: string;
  profileId: string;
  notificationType: NotificationTypeCode;
  enabled: boolean;
}): Promise<void> {
  await saveNotificationPreference({
    restaurantId: input.restaurantId,
    profileId: input.profileId,
    notificationType: input.notificationType,
    inAppEnabled: input.enabled,
    pushEnabled: false
  });
}
