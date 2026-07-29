import type { AreaDraft } from '../restaurant/restaurant-model';
import type { ReservationFloorPlansDraft } from './reservation-types';

/**
 * Blank active areas are unfinished inline rows, not restaurant data. Their
 * automatically-created room belongs to the same draft row and must be
 * omitted with it when another completed row is saved.
 */
export function floorPlanDraftWithoutBlankAreas(
  draft: ReservationFloorPlansDraft,
  areas: AreaDraft[]
): ReservationFloorPlansDraft {
  const blankAreaIds = new Set(
    areas
      .filter((area) => area.active && !area.name.trim())
      .map((area) => area.id)
  );
  if (!blankAreaIds.size) return draft;

  const rooms = draft.rooms.filter(
    (room) => !blankAreaIds.has(room.work_area_id)
  );
  const roomIds = new Set(rooms.map((room) => room.id));
  const tables = draft.tables.filter((table) => roomIds.has(table.room_id));
  const tableIds = new Set(tables.map((table) => table.id));
  const combinations = draft.combinations.filter(
    (combination) =>
      roomIds.has(combination.room_id) &&
      combination.table_ids.every((tableId) => tableIds.has(tableId))
  );

  return {
    floors: draft.floors,
    rooms,
    tables,
    combinations
  };
}
