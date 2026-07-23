export type JsonRecord = Record<string, unknown>;

export type AdminMembership = {
  restaurantId: string;
  restaurant: string;
  restaurantActive: boolean;
  role: string;
  status: string;
};

export type AdminRestaurant = {
  id: string;
  name: string;
  city: string | null;
  active: boolean;
  createdAt: string;
  ownerName: string | null;
  ownerEmail: string | null;
  employeeCount: number;
  memberCount: number;
  shiftCount: number;
  timeEntryCount: number;
  absenceCount: number;
  payrollExportCount: number;
  lastActivity: string | null;
};

export type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  emailConfirmedAt: string | null;
  suspended: boolean;
  isAdmin: boolean;
  memberships: AdminMembership[];
};

export type AdminEvent = {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  detail: JsonRecord;
  createdAt: string;
  adminName: string | null;
  adminEmail: string | null;
};

export type AdminDashboard = {
  restaurants: AdminRestaurant[];
  users: AdminUser[];
  events: AdminEvent[];
  stats: {
    restaurantCount: number;
    activeRestaurantCount: number;
    userCount: number;
    active7d: number;
    suspendedUserCount: number;
    unassignedUserCount: number;
  };
};

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function parseAdminDashboard(data: JsonRecord): AdminDashboard {
  const restaurants = (Array.isArray(data.restaurants) ? data.restaurants : []).map((raw) => {
    const restaurant = raw as JsonRecord;
    return {
      id: str(restaurant.id),
      name: str(restaurant.name),
      city: restaurant.city ? str(restaurant.city) : null,
      active: restaurant.active === true,
      createdAt: str(restaurant.created_at),
      ownerName: restaurant.owner_name ? str(restaurant.owner_name) : null,
      ownerEmail: restaurant.owner_email ? str(restaurant.owner_email) : null,
      employeeCount: num(restaurant.employee_count),
      memberCount: num(restaurant.member_count),
      shiftCount: num(restaurant.shift_count),
      timeEntryCount: num(restaurant.time_entry_count),
      absenceCount: num(restaurant.absence_count),
      payrollExportCount: num(restaurant.payroll_export_count),
      lastActivity: restaurant.last_activity ? str(restaurant.last_activity) : null
    } satisfies AdminRestaurant;
  });

  const users = (Array.isArray(data.users) ? data.users : []).map((raw) => {
    const user = raw as JsonRecord;
    return {
      id: str(user.id),
      email: str(user.email),
      name: user.name ? str(user.name) : null,
      createdAt: str(user.created_at),
      lastSignInAt: user.last_sign_in_at ? str(user.last_sign_in_at) : null,
      emailConfirmedAt: user.email_confirmed_at ? str(user.email_confirmed_at) : null,
      suspended: user.suspended === true,
      isAdmin: user.is_admin === true,
      memberships: (Array.isArray(user.memberships) ? user.memberships : []).map((rawMembership) => {
        const membership = rawMembership as JsonRecord;
        return {
          restaurantId: str(membership.restaurant_id),
          restaurant: str(membership.restaurant),
          restaurantActive: membership.restaurant_active === true,
          role: str(membership.role),
          status: str(membership.status)
        };
      })
    } satisfies AdminUser;
  });

  const events = (Array.isArray(data.events) ? data.events : []).map((raw) => {
    const event = raw as JsonRecord;
    return {
      id: str(event.id),
      action: str(event.action),
      targetType: str(event.target_type),
      targetId: event.target_id ? str(event.target_id) : null,
      detail:
        event.detail !== null && typeof event.detail === 'object' && !Array.isArray(event.detail)
          ? (event.detail as JsonRecord)
          : {},
      createdAt: str(event.created_at),
      adminName: event.admin_name ? str(event.admin_name) : null,
      adminEmail: event.admin_email ? str(event.admin_email) : null
    } satisfies AdminEvent;
  });

  const stats = (data.stats ?? {}) as JsonRecord;
  return {
    restaurants,
    users,
    events,
    stats: {
      restaurantCount: num(stats.restaurant_count),
      activeRestaurantCount: num(stats.active_restaurant_count),
      userCount: num(stats.user_count),
      active7d: num(stats.active_7d),
      suspendedUserCount: num(stats.suspended_user_count),
      unassignedUserCount: num(stats.unassigned_user_count)
    }
  };
}
