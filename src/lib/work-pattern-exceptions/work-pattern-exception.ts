import type { Tables } from '../supabase/database.types.ts';

export type WorkPatternException = Tables<'work_pattern_exceptions'>;
type WorkPatternExceptionStatus = WorkPatternException['status'];
export type WorkPatternExceptionEvent = Tables<'work_pattern_exception_events'>;

export function workPatternExceptionOverlaps(
  exception: WorkPatternException,
  employeeId: string,
  date: string,
  serviceKey: string
): boolean {
  return (
    exception.employee_id === employeeId &&
    (exception.status === 'pending' || exception.status === 'approved') &&
    exception.start_date <= date &&
    exception.end_date >= date &&
    (!exception.service_key || exception.service_key === serviceKey)
  );
}
