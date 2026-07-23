import type { Database } from '../supabase/database.types.ts';

type OperationalEnums = Database['public']['Enums'];

export type WorkRegime = OperationalEnums['work_regime'];

export type WorkArea = {
  id: string;
  restaurant_id: string;
  name: string;
  code: string;
  notes: string | null;
  active: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
};

export type AreaServiceDefault = {
  id?: string;
  restaurant_id: string;
  area_id: string;
  service_key: string;
  start_time: string | null;
  end_time: string | null;
  created_at?: string;
  updated_at?: string;
};

export type EmployeeJobFunction = {
  restaurant_id: string;
  employee_id: string;
  job_function_id: string;
  is_primary: boolean;
  active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type RecurringScheduleSlot = {
  id: string;
  restaurant_id: string;
  employee_id: string;
  weekday: number;
  service_key: string;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
};

export const CONTRACT_TYPE_CODES = [
  'CDI',
  'CDD',
  'FLEXI',
  'STUDENT',
  'EXTRA',
  'FREELANCE'
] as const;

export const ABSENCE_TYPE_CODES = [
  'HOLIDAY',
  'SICK',
  'UNPAID',
  'PUBLIC_HOLIDAY',
  'OTHER'
] as const;

export function defaultWorkRegime(contractCode: string): WorkRegime {
  const code = contractCode.trim().toUpperCase();
  return contractRequiresFixedSchedule(code)
    ? 'fixed_schedule'
    : code === 'FREELANCE'
      ? 'manager_only'
      : 'weekly_availability';
}

function contractRequiresFixedSchedule(contractCode: string): boolean {
  const code = contractCode.trim().toUpperCase();
  return code === 'CDI' || code === 'CDD';
}

// How someone is scheduled is a separate decision from what contract they are
// on: a CDI can be placed by the manager, and an extra can hold a recurring
// schedule. A stored regime therefore always wins. The contract code is only a
// fallback for rows saved before the regime was recorded.
export function workRegime(value: unknown, contractCode = ''): WorkRegime {
  if (value === 'fixed_schedule' || value === 'weekly_availability' || value === 'manager_only') {
    return value;
  }
  // Nothing usable stored: fall back to what the contract implies — but never
  // silently to manager_only, which would stop asking someone for their
  // availability without anyone having decided that.
  const implied = defaultWorkRegime(contractCode);
  return implied === 'manager_only' ? 'weekly_availability' : implied;
}
