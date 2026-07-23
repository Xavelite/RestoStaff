import { env } from '$env/dynamic/public';
import { supabase } from '$lib/supabase/client';
import { toApiError } from '$lib/api/error';
import type { WorkspaceRole } from '$lib/api/workspace';

export type FeedbackCategory = 'problem' | 'suggestion' | 'confusing' | 'visual';

export async function submitPilotFeedback(input: {
  restaurantId: string | null;
  category: FeedbackCategory;
  message: string;
  pagePath: string;
  actorRole: WorkspaceRole | 'platform_admin' | null;
  locale: 'en' | 'fr' | 'nl';
}): Promise<void> {
  const viewport = typeof window === 'undefined' ? '' : `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio}`;
  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const { error } = await supabase.rpc('submit_pilot_feedback', {
    p_restaurant_id: input.restaurantId as string,
    p_category: input.category,
    p_message: input.message,
    p_page_path: input.pagePath,
    p_app_release: env.PUBLIC_APP_RELEASE || 'development',
    p_actor_role: input.actorRole ?? '',
    p_locale: input.locale,
    p_viewport: viewport,
    p_user_agent: userAgent
  });
  if (error) throw toApiError(error, 'Feedback could not be sent.');
}
