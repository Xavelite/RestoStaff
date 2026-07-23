import type { Tables } from '../supabase/database.types.ts';
import type { ServiceKey } from '../calendar/date.ts';

type NotificationParams = Record<string, string | number>;

const NOTIFICATION_TYPE_CODES = [
  'absence_request_submitted',
  'employee_unavailable_on_planned_shift',
  'employee_forgot_badge_out',
  'employee_badged_late',
  'employee_no_show',
  'worked_during_approved_absence',
  'employee_invite_accepted',
  'employee_availability_updated',
  'published_planning_changed',
  'payroll_export_created',
  'planning_published',
  'absence_request_decided',
  'own_forgot_badge_out',
  'shift_soon',
  'shift_changed_after_publication',
  'operational_message_received'
] as const;

export type NotificationTypeCode = (typeof NOTIFICATION_TYPE_CODES)[number];

const IMPLEMENTED_NOTIFICATION_TYPE_CODES = [
  'absence_request_submitted',
  'employee_unavailable_on_planned_shift',
  'employee_forgot_badge_out',
  'employee_badged_late',
  'employee_no_show',
  'worked_during_approved_absence',
  'employee_invite_accepted',
  'employee_availability_updated',
  'planning_published',
  'absence_request_decided',
  'own_forgot_badge_out',
  'shift_soon',
  'operational_message_received'
] as const satisfies readonly NotificationTypeCode[];

type NotificationAudience = 'manager' | 'employee' | 'both';
type NotificationActionMode = 'popup' | 'route';
type NotificationSeverity = 'critical' | 'attention' | 'info' | 'success';

export type NotificationType = Omit<
  Tables<'notification_types'>,
  'audience' | 'default_action' | 'code'
> & {
  code: NotificationTypeCode;
  audience: NotificationAudience;
  default_action: NotificationActionMode;
};

type NotificationSource = {
  table: string;
  id: string;
};

export type NotificationItem = {
  key: string;
  type: NotificationTypeCode;
  audience: Exclude<NotificationAudience, 'both'>;
  severity: NotificationSeverity;
  title: string;
  titleParams?: NotificationParams;
  body: string;
  bodyParams?: NotificationParams;
  serviceKey?: ServiceKey;
  createdAt: string;
  actionMode: NotificationActionMode;
  targetUrl: string;
  source: NotificationSource;
  employeeId?: string;
  readAt?: string | null;
  dismissedAt?: string | null;
};

export type NotificationFeed = {
  items: NotificationItem[];
  unreadCount: number;
};

export function isNotificationTypeCode(value: string): value is NotificationTypeCode {
  return (NOTIFICATION_TYPE_CODES as readonly string[]).includes(value);
}

export function isImplementedNotificationTypeCode(value: NotificationTypeCode): boolean {
  return (IMPLEMENTED_NOTIFICATION_TYPE_CODES as readonly NotificationTypeCode[]).includes(value);
}
