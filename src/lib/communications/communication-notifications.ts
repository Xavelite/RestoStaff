import type { NotificationItem } from '$lib/notifications/notification-model';
import type { CommunicationsReadModel } from './communications-model.ts';

type WorkspaceRole = 'owner' | 'manager' | 'employee';

// Operational messages surface in the normal notification feed (and, through it,
// in phone push) so someone who is not looking at the app still learns that an
// urgent message is waiting. Managers author messages rather than receive them,
// so only employees derive items here.
export function deriveCommunicationNotifications(input: {
  restaurantId: string;
  role: WorkspaceRole;
  employeeId: string | null;
  communications: CommunicationsReadModel;
}): NotificationItem[] {
  const { role, employeeId, communications } = input;
  if (role !== 'employee' || !employeeId) return [];

  const items: NotificationItem[] = [];
  const recipientByMessage = new Map(
    communications.messageRecipients
      .filter((recipient) => recipient.employee_id === employeeId)
      .map((recipient) => [recipient.message_id, recipient])
  );

  for (const message of communications.messages) {
    const recipient = recipientByMessage.get(message.id);
    if (!recipient) continue;
    items.push({
      key: `operational-message:${message.id}`,
      type: 'operational_message_received',
      audience: 'employee',
      severity: message.priority === 'urgent' ? 'critical' : 'info',
      title: message.priority === 'urgent' ? 'Urgent message' : 'New message',
      body: message.body,
      createdAt: message.created_at,
      actionMode: 'popup',
      targetUrl: '/my-service?communications=messages',
      source: { table: 'operational_messages', id: message.id },
      employeeId,
      readAt: recipient.read_at
    });
  }

  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
