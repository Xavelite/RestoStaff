import type { ManagerOperationsReadModel } from '../api/workspace-snapshot.ts';
import { addDays } from '../calendar/date.ts';
import { mergeDashboardReadModels } from '../dashboard/dashboard-model.ts';

export const MAX_EXPORT_DAYS = 371;
const MAX_OPERATIONS_READ_DAYS = 63;

type OperationsReader = (
  restaurantId: string,
  fromDate: string,
  toDate: string
) => Promise<ManagerOperationsReadModel>;

function elapsedDays(from: string, to: string): number {
  return Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() -
      new Date(`${from}T00:00:00Z`).getTime()) /
      86_400_000
  );
}

/**
 * Operations RPCs accept at most 63 inclusive days. Export periods can span up
 * to 53 complete weeks, so split them into adjacent, non-overlapping reads.
 */
export function exportOperationalReadRanges(
  from: string,
  to: string
): Array<{ from: string; to: string }> {
  const span = elapsedDays(from, to);
  if (!from || !to || !Number.isFinite(span) || span < 0) {
    throw new RangeError('A valid export date range is required.');
  }
  if (span >= MAX_EXPORT_DAYS) {
    throw new RangeError('Export periods cannot exceed 53 weeks.');
  }

  const ranges: Array<{ from: string; to: string }> = [];
  let cursor = from;
  while (cursor <= to) {
    const candidate = addDays(cursor, MAX_OPERATIONS_READ_DAYS - 1);
    const end = candidate < to ? candidate : to;
    ranges.push({ from: cursor, to: end });
    cursor = addDays(end, 1);
  }
  return ranges;
}

export async function getExportOperationsReadModel(
  restaurantId: string,
  from: string,
  to: string,
  read: OperationsReader
): Promise<ManagerOperationsReadModel> {
  const models = await Promise.all(
    exportOperationalReadRanges(from, to).map((range) =>
      read(restaurantId, range.from, range.to)
    )
  );
  return mergeDashboardReadModels(models);
}
