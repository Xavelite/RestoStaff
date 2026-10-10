import { formatHours, hoursBetweenClocks } from '../calendar/date.ts';

export type WeeklyRosterService = {
  key: string;
  label: string;
};

type WeeklyRosterShiftInput = {
  employeeId: string;
  date: string;
  serviceKey: string;
  startsAt: string;
  endsAt: string;
  position: string;
};

type WeeklyRosterShift = {
  startsAt: string;
  endsAt: string;
  position: string;
  hours: number;
};

type WeeklyRosterCell = {
  serviceKey: string;
  shifts: WeeklyRosterShift[];
  hours: number;
};

export type WeeklyRosterDay = {
  date: string;
  label: string;
  staffCount: number;
  totalHours: number;
};

export type WeeklyRosterRow = {
  employeeId: string;
  employeeName: string;
  cells: WeeklyRosterCell[];
  totalHours: number;
};

export type WeeklyRosterExport = {
  restaurantName: string;
  employeeLabel: string;
  totalLabel: string;
  staffLabel: string;
  hoursLabel: string;
  days: WeeklyRosterDay[];
  services: WeeklyRosterService[];
  rows: WeeklyRosterRow[];
  staffCounts: number[];
  serviceHours: number[];
  shiftCount: number;
  totalHours: number;
};

type WeeklyRosterInput = {
  restaurantName: string;
  employeeLabel: string;
  totalLabel: string;
  staffLabel: string;
  hoursLabel: string;
  employees: Array<{ id: string; name: string }>;
  days: Array<{ date: string; label: string }>;
  services: WeeklyRosterService[];
  shifts: WeeklyRosterShiftInput[];
};

function cellIndex(dayIndex: number, serviceIndex: number, serviceCount: number): number {
  return dayIndex * serviceCount + serviceIndex;
}

export function weeklyRosterCellText(cell: WeeklyRosterCell): string {
  return cell.shifts
    .map((shift) => {
      const assignment = shift.position.trim();
      return `${shift.startsAt}-${shift.endsAt}${assignment ? `\n${assignment}` : ''}`;
    })
    .join('\n');
}

export function buildWeeklyRosterExport(input: WeeklyRosterInput): WeeklyRosterExport {
  const dayIndexByDate = new Map(input.days.map((day, index) => [day.date, index]));
  const serviceIndexByKey = new Map(
    input.services.map((service, index) => [service.key, index])
  );
  const shiftsByEmployeeCell = new Map<string, WeeklyRosterShift[]>();

  for (const shift of input.shifts) {
    const dayIndex = dayIndexByDate.get(shift.date);
    const serviceIndex = serviceIndexByKey.get(shift.serviceKey);
    if (dayIndex === undefined || serviceIndex === undefined) continue;
    const index = cellIndex(dayIndex, serviceIndex, input.services.length);
    const key = `${shift.employeeId}|${index}`;
    const list = shiftsByEmployeeCell.get(key) ?? [];
    list.push({
      startsAt: shift.startsAt.slice(0, 5),
      endsAt: shift.endsAt.slice(0, 5),
      position: shift.position,
      hours: hoursBetweenClocks(shift.startsAt, shift.endsAt)
    });
    shiftsByEmployeeCell.set(key, list);
  }

  const cellCount = input.days.length * input.services.length;
  const rows = input.employees.map((employee) => {
    const cells = Array.from({ length: cellCount }, (_, index) => {
      const shifts = (shiftsByEmployeeCell.get(`${employee.id}|${index}`) ?? [])
        .toSorted((left, right) => left.startsAt.localeCompare(right.startsAt));
      return {
        serviceKey: input.services[index % input.services.length]?.key ?? '',
        shifts,
        hours: shifts.reduce((total, shift) => total + shift.hours, 0)
      };
    });
    return {
      employeeId: employee.id,
      employeeName: employee.name,
      cells,
      totalHours: cells.reduce((total, cell) => total + cell.hours, 0)
    };
  });

  const staffCounts = Array.from({ length: cellCount }, (_, index) =>
    rows.reduce((count, row) => count + (row.cells[index]?.shifts.length ? 1 : 0), 0)
  );
  const serviceHours = Array.from({ length: cellCount }, (_, index) =>
    rows.reduce((total, row) => total + (row.cells[index]?.hours ?? 0), 0)
  );
  const days = input.days.map((day, dayIndex) => {
    const start = dayIndex * input.services.length;
    const hours = serviceHours.slice(start, start + input.services.length);
    return {
      ...day,
      staffCount: rows.reduce(
        (count, row) =>
          count +
          (row.cells.slice(start, start + input.services.length).some((cell) => cell.shifts.length) ? 1 : 0),
        0
      ),
      totalHours: hours.reduce((total, value) => total + value, 0)
    };
  });

  return {
    restaurantName: input.restaurantName,
    employeeLabel: input.employeeLabel,
    totalLabel: input.totalLabel,
    staffLabel: input.staffLabel,
    hoursLabel: input.hoursLabel,
    days,
    services: input.services,
    rows,
    staffCounts,
    serviceHours,
    shiftCount: rows.reduce((count, row) => {
      return count + row.cells.reduce((cellCount, cell) => cellCount + cell.shifts.length, 0);
    }, 0),
    totalHours: rows.reduce((total, row) => total + row.totalHours, 0)
  };
}

export function weeklyRosterFlatTable(roster: WeeklyRosterExport): {
  headers: string[];
  rows: Array<Array<string | number>>;
} {
  return {
    headers: [
      roster.employeeLabel,
      ...roster.days.flatMap((day) =>
        roster.services.map((service) => `${day.label} · ${service.label}`)
      ),
      roster.totalLabel
    ],
    rows: roster.rows.map((row) => [
      row.employeeName,
      ...row.cells.map(weeklyRosterCellText),
      formatHours(row.totalHours)
    ])
  };
}
