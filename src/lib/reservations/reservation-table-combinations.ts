import type {
  ReservationCombinationDraft,
  ReservationTableDraft
} from './reservation-types';

const MIN_COMBINATION_CAPACITY = 2;

type CombinationTable = Pick<
  ReservationTableDraft,
  | 'id'
  | 'room_id'
  | 'label'
  | 'minimum_capacity'
  | 'maximum_capacity'
  | 'active'
  | 'sort_order'
>;

type CombinationCapacityBounds = {
  minimum: number;
  maximum: number;
  recommendedMinimum: number;
};

function combinationMembers(
  tableIds: string[],
  roomId: string,
  tables: CombinationTable[]
): CombinationTable[] {
  const requestedIds = new Set(tableIds);
  return tables
    .filter(
      (table) =>
        table.active &&
        table.room_id === roomId &&
        requestedIds.has(table.id)
    )
    .sort(
      (left, right) =>
        left.sort_order - right.sort_order ||
        left.label.localeCompare(right.label, undefined, { numeric: true })
    );
}

export function combinationCapacityBounds(
  tableIds: string[],
  roomId: string,
  tables: CombinationTable[]
): CombinationCapacityBounds | null {
  const members = combinationMembers(tableIds, roomId, tables);
  if (members.length < 2 || new Set(tableIds).size !== tableIds.length) return null;

  const maximum = members.reduce(
    (total, table) => total + Number(table.maximum_capacity),
    0
  );
  const largestStandaloneTable = Math.max(
    ...members.map((table) => Number(table.maximum_capacity))
  );

  return {
    minimum: MIN_COMBINATION_CAPACITY,
    maximum,
    recommendedMinimum: Math.min(
      maximum,
      Math.max(MIN_COMBINATION_CAPACITY, largestStandaloneTable + 1)
    )
  };
}

export function combinationName(
  tableIds: string[],
  roomId: string,
  tables: CombinationTable[]
): string {
  return combinationMembers(tableIds, roomId, tables)
    .map((table) => table.label.trim())
    .join(' + ');
}

export function isValidTableCombination(
  combination: ReservationCombinationDraft,
  tables: CombinationTable[]
): boolean {
  if (!combination.active) return true;
  const bounds = combinationCapacityBounds(
    combination.table_ids,
    combination.room_id,
    tables
  );
  return Boolean(
    combination.name.trim() &&
      bounds &&
      combination.minimum_capacity >= bounds.minimum &&
      combination.maximum_capacity >= combination.minimum_capacity &&
      combination.maximum_capacity <= bounds.maximum
  );
}

export function reconcileTableCombinations(
  combinations: ReservationCombinationDraft[],
  tables: CombinationTable[]
): ReservationCombinationDraft[] {
  return combinations.map((combination) => {
    if (!combination.active) return combination;
    const tableIds = combinationMembers(
      combination.table_ids,
      combination.room_id,
      tables
    ).map((table) => table.id);
    const bounds = combinationCapacityBounds(
      tableIds,
      combination.room_id,
      tables
    );
    if (!bounds) {
      return {
        ...combination,
        active: false,
        table_ids: tableIds
      };
    }
    const minimumCapacity = Math.min(
      bounds.maximum,
      Math.max(bounds.minimum, Number(combination.minimum_capacity))
    );
    return {
      ...combination,
      table_ids: tableIds,
      name: combinationName(tableIds, combination.room_id, tables),
      minimum_capacity: minimumCapacity,
      maximum_capacity: Math.min(
        bounds.maximum,
        Math.max(minimumCapacity, Number(combination.maximum_capacity))
      )
    };
  });
}
