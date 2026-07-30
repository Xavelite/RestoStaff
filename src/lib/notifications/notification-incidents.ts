import type {
  NotificationItem,
  NotificationTypeCode
} from './notification-model';

const SERVICE_INCIDENT_TYPES = new Set<NotificationTypeCode>([
  'employee_unavailable_on_planned_shift',
  'employee_forgot_badge_out',
  'employee_badged_late',
  'employee_no_show',
  'worked_during_approved_absence'
]);

export type NotificationIncident = {
  key: string;
  primary: NotificationItem;
  items: NotificationItem[];
  unreadCount: number;
};

function incidentDate(item: NotificationItem): string {
  const date = item.bodyParams?.date;
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? date
    : item.createdAt.slice(0, 10);
}

function groupKey(item: NotificationItem): string {
  if (!SERVICE_INCIDENT_TYPES.has(item.type)) return `item:${item.key}`;
  return [
    'service',
    item.type,
    incidentDate(item),
    item.serviceKey ?? 'all-day',
    item.targetUrl
  ].join(':');
}

export function groupNotificationIncidents(
  items: NotificationItem[]
): NotificationIncident[] {
  const groups = new Map<string, NotificationItem[]>();
  for (const item of items) {
    const key = groupKey(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return [...groups].map(([key, grouped]) => ({
    key,
    primary: grouped[0],
    items: grouped,
    unreadCount: grouped.filter((item) => !item.readAt).length
  }));
}
