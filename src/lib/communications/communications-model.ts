import type { Json, Tables } from '../supabase/database.types.ts';

export type OperationalMessage = Tables<'operational_messages'> & {
  sender_name: string | null;
};
export type MessageRecipient = Tables<'operational_message_recipients'>;

export type CommunicationsReadModel = {
  employees: Tables<'employees'>[];
  messages: OperationalMessage[];
  messageRecipients: MessageRecipient[];
};

type UnknownRecord = Record<string, unknown>;

function record(value: Json): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function rows<T>(value: UnknownRecord, key: string): T[] {
  return Array.isArray(value[key]) ? (value[key] as T[]) : [];
}

export function parseCommunicationsReadModel(value: Json): CommunicationsReadModel {
  const data = record(value);
  return {
    employees: rows(data, 'employees'),
    messages: rows(data, 'messages'),
    messageRecipients: rows(data, 'message_recipients')
  };
}
