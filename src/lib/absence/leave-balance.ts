import type { EmployeeOperationsReadModel, TeamReadModel } from '$lib/api/workspace-snapshot';

type LeaveBalance = {
  entitlement: number;
  approved: number;
  pending: number;
  remaining: number;
};

function overlappingDays(
  start: string,
  end: string,
  rangeStart: string,
  rangeEnd: string,
  partialDay: boolean
): number {
  const boundedStart = start < rangeStart ? rangeStart : start;
  const boundedEnd = end > rangeEnd ? rangeEnd : end;
  if (boundedEnd < boundedStart) return 0;
  const startAt = Date.parse(`${boundedStart}T00:00:00Z`);
  const endAt = Date.parse(`${boundedEnd}T00:00:00Z`);
  return ((endAt - startAt) / 86_400_000 + 1) * (partialDay ? 0.5 : 1);
}

export function leaveBalanceForEmployee(
  snapshot: EmployeeOperationsReadModel | TeamReadModel,
  employeeId: string,
  asOfDate: string
): LeaveBalance {
  const year = Number(asOfDate.slice(0, 4));
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const contract = snapshot.employee_contracts.find(
    (item) => item.employee_id === employeeId && item.active && item.is_current
  );
  const holidayIds = new Set(
    snapshot.absence_types
      .filter((type) => type.category === 'holiday')
      .map((type) => type.id)
  );
  const relevant = snapshot.absences.filter(
    (absence) =>
      absence.employee_id === employeeId &&
      holidayIds.has(absence.absence_type_id) &&
      absence.start_date <= yearEnd &&
      absence.end_date >= yearStart
  );
  const totalFor = (status: 'approved' | 'pending') =>
    relevant
      .filter((absence) => absence.status === status)
      .reduce(
        (sum, absence) =>
          sum +
          overlappingDays(
            absence.start_date,
            absence.end_date,
            yearStart,
            yearEnd,
            Boolean(absence.service_key)
          ),
        0
      );
  const entitlement = Number(contract?.annual_leave_entitlement_days ?? 0);
  const approved = totalFor('approved');
  const pending = totalFor('pending');
  return {
    entitlement,
    approved,
    pending,
    remaining: Math.max(0, entitlement - approved)
  };
}
