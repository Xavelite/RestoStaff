import { supabase } from '$lib/supabase/client';
import { toApiError } from '$lib/api/error';
import { parseCommunicationsReadModel } from './communications-model';

export async function getCommunications(restaurantId: string) {
  const { data, error } = await supabase.rpc('get_communications_read_model', {
    p_restaurant_id: restaurantId
  });
  if (error) throw toApiError(error, 'Messages could not be loaded.');
  return parseCommunicationsReadModel(data);
}

export async function sendOperationalMessage(input: {
  restaurantId: string;
  body: string;
  employeeIds: string[];
  priority: 'normal' | 'urgent';
  acknowledgementRequired: boolean;
}): Promise<void> {
  const { error } = await supabase.rpc('send_operational_message', {
    p_restaurant_id: input.restaurantId,
    p_body: input.body,
    p_employee_ids: input.employeeIds,
    p_priority: input.priority,
    p_acknowledgement_required: input.acknowledgementRequired
  });
  if (error) throw toApiError(error, 'Message could not be sent.');
}

export async function markOperationalMessage(
  restaurantId: string,
  messageId: string,
  acknowledge = false
): Promise<void> {
  const { error } = await supabase.rpc('mark_operational_message', {
    p_restaurant_id: restaurantId,
    p_message_id: messageId,
    p_acknowledge: acknowledge
  });
  if (error) throw toApiError(error, 'Message state could not be saved.');
}
