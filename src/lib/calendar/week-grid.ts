import type { ServiceSlotPresentation } from './calendar-model';
import type { ServiceKey } from './date';

// Shape shared by every weekly board (Planning, Actuals, My service). The grid is
// always employees (rows) × weekdays (columns) × service slots. Modules fill the
// CalendarItem per slot; the layout and interaction are identical everywhere.

export type WeekColumn = {
  weekday: number;
  label: string;
  date: string;
  today: boolean;
  past: boolean;
};

export type WeekSlot = {
  key: string;
  serviceKey: ServiceKey;
  presentation: ServiceSlotPresentation;
};

export type WeekCell = {
  date: string;
  slots: WeekSlot[];
};

export type WeekRow = {
  id: string;
  name: string;
  meta?: string;
  total?: string;
  cells: WeekCell[];
};
