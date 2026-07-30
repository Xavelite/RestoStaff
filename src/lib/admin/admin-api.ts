import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
import { supabase } from '$lib/supabase/client';
import { parseAdminDashboard, type JsonRecord } from './admin-model';

export type {
  AdminDashboard,
  AdminEvent,
  AdminRestaurant,
  AdminUser
} from './admin-model';

export type AdminFeedback = {
  id: string;
  restaurantId: string | null;
  restaurantName: string | null;
  reporterName: string | null;
  reporterEmail: string | null;
  category: 'problem' | 'suggestion' | 'confusing' | 'visual';
  message: string;
  pagePath: string;
  appRelease: string;
  actorRole: string | null;
  locale: string;
  viewport: string;
  status: 'new' | 'reviewing' | 'resolved' | 'closed';
  adminNote: string;
  createdAt: string;
};

export type AdminPilotAccessRequest = {
  authUserId: string;
  email: string;
  status: 'pending' | 'approved' | 'declined';
  requestNote: string;
  reviewNote: string;
  requestedAt: string;
  reviewedAt: string | null;
};

export type AdminRestaurantEntitlements = {
  restaurantId: string;
  restaurantName: string;
  modules: Record<string, 'enabled' | 'preview' | 'disabled'>;
};

// Platform-admin RPCs authenticate with the caller's manager session; the
// server re-checks require_platform_admin on every call, so a hidden route is
// never the security boundary.
async function adminRpc(name: string, payload: JsonRecord = {}): Promise<JsonRecord> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in first.');
  const response = await fetch(`${PUBLIC_SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: PUBLIC_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const result = (await response.json().catch(() => ({}))) as JsonRecord;
  if (!response.ok) {
    throw new Error(String(result.message ?? result.error ?? 'Admin request failed.'));
  }
  return result;
}

export async function getAdminDashboard() {
  return parseAdminDashboard(await adminRpc('admin_dashboard'));
}

export async function amIPlatformAdmin(): Promise<boolean> {
  try {
    const result = await adminRpc('am_i_platform_admin');
    return (result as unknown) === true;
  } catch {
    return false;
  }
}

export async function setRestaurantActive(restaurantId: string, active: boolean): Promise<void> {
  await adminRpc('admin_set_restaurant_active', { p_restaurant_id: restaurantId, p_active: active });
}

export async function deleteRestaurant(restaurantId: string): Promise<void> {
  await adminRpc('admin_delete_restaurant', { p_restaurant_id: restaurantId });
}

export async function setUserSuspended(profileId: string, suspended: boolean): Promise<void> {
  await adminRpc('admin_set_user_suspended', { p_profile_id: profileId, p_suspended: suspended });
}

export async function deleteUser(profileId: string): Promise<void> {
  await adminRpc('admin_delete_user', { p_profile_id: profileId });
}

export async function getAdminFeedback(): Promise<AdminFeedback[]> {
  const { data, error } = await supabase.rpc('get_admin_feedback');
  if (error) throw new Error(error.message);
  if (!Array.isArray(data)) return [];
  return data.flatMap((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
    const row = raw as JsonRecord;
    const status = String(row.status ?? 'new') as AdminFeedback['status'];
    const category = String(row.category ?? 'problem') as AdminFeedback['category'];
    return [{
      id: String(row.id ?? ''),
      restaurantId: typeof row.restaurant_id === 'string' ? row.restaurant_id : null,
      restaurantName: typeof row.restaurant_name === 'string' ? row.restaurant_name : null,
      reporterName: typeof row.reporter_name === 'string' ? row.reporter_name : null,
      reporterEmail: typeof row.reporter_email === 'string' ? row.reporter_email : null,
      category,
      message: String(row.message ?? ''),
      pagePath: String(row.page_path ?? ''),
      appRelease: String(row.app_release ?? ''),
      actorRole: typeof row.actor_role === 'string' ? row.actor_role : null,
      locale: String(row.locale ?? 'en'),
      viewport: String(row.viewport ?? ''),
      status,
      adminNote: String(row.admin_note ?? ''),
      createdAt: String(row.created_at ?? '')
    }];
  });
}

export async function updateAdminFeedback(
  feedbackId: string,
  status: AdminFeedback['status'],
  note: string
): Promise<void> {
  const { error } = await supabase.rpc('admin_update_feedback', {
    p_feedback_id: feedbackId,
    p_status: status,
    p_admin_note: note
  });
  if (error) throw new Error(error.message);
}

export async function getAdminPilotAccessRequests(): Promise<AdminPilotAccessRequest[]> {
  const { data, error } = await supabase.rpc('admin_list_pilot_access_requests');
  if (error) throw new Error(error.message);
  if (!Array.isArray(data)) return [];
  return data.flatMap((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
    const row = raw as JsonRecord;
    const status =
      row.status === 'approved' || row.status === 'declined'
        ? row.status
        : 'pending';
    return [{
      authUserId: String(row.auth_user_id ?? ''),
      email: String(row.email ?? ''),
      status,
      requestNote: String(row.request_note ?? ''),
      reviewNote: String(row.review_note ?? ''),
      requestedAt: String(row.requested_at ?? ''),
      reviewedAt: typeof row.reviewed_at === 'string' ? row.reviewed_at : null
    }];
  });
}

export async function reviewPilotAccess(
  authUserId: string,
  approved: boolean,
  note = ''
): Promise<void> {
  const { error } = await supabase.rpc('admin_review_pilot_access', {
    p_auth_user_id: authUserId,
    p_approved: approved,
    p_note: note.trim() || undefined
  });
  if (error) throw new Error(error.message);
}

export async function getAdminRestaurantEntitlements(): Promise<AdminRestaurantEntitlements[]> {
  const result = await adminRpc('admin_restaurant_module_entitlements');
  const rows = Array.isArray(result) ? result : [];
  return rows.flatMap((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
    const row = raw as JsonRecord;
    const modules =
      row.modules && typeof row.modules === 'object' && !Array.isArray(row.modules)
        ? Object.fromEntries(
            Object.entries(row.modules as JsonRecord).filter(
              (entry): entry is [string, 'enabled' | 'preview' | 'disabled'] =>
                entry[1] === 'enabled' ||
                entry[1] === 'preview' ||
                entry[1] === 'disabled'
            )
          )
        : {};
    return [{
      restaurantId: String(row.restaurant_id ?? ''),
      restaurantName: String(row.restaurant_name ?? ''),
      modules
    }];
  });
}

export async function setRestaurantModuleEntitlement(
  restaurantId: string,
  moduleKey: string,
  state: 'enabled' | 'preview' | 'disabled'
): Promise<void> {
  await adminRpc('admin_set_restaurant_module_entitlement', {
    p_restaurant_id: restaurantId,
    p_module_key: moduleKey,
    p_state: state
  });
}
