import type { Database } from '../supabase/database.types';

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
  return code === 'CDI' || code === 'CDD'
    ? 'fixed_schedule'
    : code === 'FREELANCE'
      ? 'manager_only'
      : 'weekly_availability';
}

export function workRegime(value: unknown, contractCode = ''): WorkRegime {
  return value === 'fixed_schedule' ||
    value === 'weekly_availability' ||
    value === 'manager_only'
    ? value
    : 'weekly_availability';
}
