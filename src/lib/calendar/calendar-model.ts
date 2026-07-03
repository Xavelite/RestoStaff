import { isSameMonth, monthDates, mondayFor } from './date.ts';
import type { ServiceKey } from './date.ts';

// Operational-card variants. Availability belongs to SlotBackground, not here.
export type CalendarTone =
  | 'empty'
  | 'planned'
  | 'expected'
  | 'actual'
  | 'live'
  | 'absence'
  | 'conflict'
  | 'correction'
  | 'missing'
  | 'payroll'
  | 'pending'
  | 'warning'
  | 'danger';

export type CalendarItem = {
  id: string;
  label: string;
  meta?: string;
  tone: CalendarTone;
  serviceKey?: ServiceKey;
  interaction?: 'details' | 'select';
};

export type SlotBackground =
  | 'neutral'
  | 'available'
  | 'partial'
  | 'unavailable'
  | 'warning'
  | 'conflict';

export type ServiceSlotPresentation = {
  background: SlotBackground;
  card: CalendarItem | null;
  attention?: string;
};

export type CalendarDay = {
  date: string;
  dayNumber: number;
  inMonth: boolean;
  selected: boolean;
  today: boolean;
  past: boolean;
  weekStart: string;
  total?: string;
  slots: Array<{
    key: string;
    serviceKey: ServiceKey;
    presentation: ServiceSlotPresentation;
  }>;
  weekTotal?: string;
};

export function buildMonthDays(input: {
  month: string;
  selectedDate: string;
  today: string;
  slotsForDate: (date: string) => CalendarDay['slots'];
  totalForDate?: (date: string) => string;
  weekTotalForWeek?: (weekStart: string) => string;
}): CalendarDay[] {
  return monthDates(input.month).map((date) => ({
    date,
    dayNumber: Number(date.slice(-2)),
    inMonth: isSameMonth(date, input.month),
    selected: date === input.selectedDate,
    today: date === input.today,
    past: date < input.today,
    weekStart: mondayFor(date),
    total: input.totalForDate?.(date),
    slots: input.slotsForDate(date),
    weekTotal: input.weekTotalForWeek?.(mondayFor(date))
  }));
}
