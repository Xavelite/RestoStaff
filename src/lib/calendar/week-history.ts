import type { Tables } from '$lib/supabase/database.types';
import { weekLabel } from './date';
import { workWeekEventLabel } from './work-week-events';

type WeekHistoryItem = {
  id: string;
  title: string;
  detail?: string;
  when: string;
  actionLabel?: string;
  onaction?: () => void;
  actionDisabled?: boolean;
};

export function workWeekHistoryItems(
  events: Tables<'work_week_events'>[] | null | undefined,
  eventPrefix: 'planning_' | 'actuals_'
): WeekHistoryItem[] {
  return (events ?? [])
    .filter((event) => event.event_type.startsWith(eventPrefix))
    .map((event) => ({
      id: event.id,
      title: workWeekEventLabel(event.event_type),
      detail: `Week ${weekLabel(event.week_start)}${event.reason ? ` · ${event.reason}` : ''}`,
      when: event.created_at
    }));
}
