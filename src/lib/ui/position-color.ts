// Deterministic default colour per position (job function). Each position gets
// a stable colour from a curated palette so its staff badges read identically
// on Schedule and Timesheet, and two positions never collide. Assignment is by
// the position's order in the active catalogue (sort_order, then name).
//
// An owner override is honoured when present: job_functions.metadata.color. The
// helper reads it here already, so the day the save RPC round-trips that field
// the override lights up with no further UI work.

const POSITION_PALETTE = [
  '#2f6fed', // blue
  '#e8590c', // orange
  '#2f9e44', // green
  '#9c36b5', // violet
  '#1098ad', // teal
  '#e03131', // red
  '#f08c00', // amber
  '#5c7cfa', // indigo
  '#c2255c', // magenta
  '#3b7bdb' // sky
] as const;

// Areas wear a deeper, calmer palette than positions so the two never read as
// the same kind of thing on a shared surface (Coverage): a position is a vivid
// chip, an area is a deep rail.
const AREA_PALETTE = [
  '#0f766e', // deep teal
  '#7c2d12', // rust
  '#3730a3', // deep indigo
  '#166534', // forest
  '#9d174d', // deep rose
  '#1e3a8a', // navy
  '#78350f', // umber
  '#5b21b6', // deep violet
  '#115e59', // pine
  '#374151' // slate
] as const;

type JobFunctionLike = {
  id: string;
  sort_order?: number | null;
  name?: string | null;
  active?: boolean | null;
  metadata?: unknown;
};

type AreaLike = {
  id: string;
  sort_order?: number | null;
  name?: string | null;
  metadata?: unknown;
};

function readOverride(metadata: unknown): string | null {
  if (metadata && typeof metadata === 'object' && 'color' in metadata) {
    const value = (metadata as { color?: unknown }).color;
    if (typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)) return value;
  }
  return null;
}

/** Position id → colour. Stable across sessions; overrides win over the palette. */
export function buildPositionColorMap(jobFunctions: JobFunctionLike[]): Map<string, string> {
  const ordered = [...jobFunctions].sort(
    (a, b) =>
      (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
      (a.name ?? '').localeCompare(b.name ?? '')
  );
  const map = new Map<string, string>();
  ordered.forEach((item, index) => {
    map.set(item.id, readOverride(item.metadata) ?? POSITION_PALETTE[index % POSITION_PALETTE.length]);
  });
  return map;
}

/** Area id → colour. Stable across sessions; overrides win over the palette. */
export function buildAreaColorMap(areas: AreaLike[]): Map<string, string> {
  const ordered = [...areas].sort(
    (a, b) =>
      (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
      (a.name ?? '').localeCompare(b.name ?? '')
  );
  const map = new Map<string, string>();
  ordered.forEach((item, index) => {
    map.set(item.id, readOverride(item.metadata) ?? AREA_PALETTE[index % AREA_PALETTE.length]);
  });
  return map;
}

/**
 * Employee id → colour of their primary position. Employees with no primary
 * position are simply absent from the map (callers fall back to neutral).
 */
export function buildEmployeeColorMap(
  jobFunctions: JobFunctionLike[],
  employeeJobFunctions: Array<{
    employee_id: string;
    job_function_id: string;
    is_primary?: boolean | null;
    active?: boolean | null;
  }>
): Map<string, string> {
  const positionColors = buildPositionColorMap(jobFunctions);
  const map = new Map<string, string>();
  for (const link of employeeJobFunctions) {
    if (link.active === false || !link.is_primary) continue;
    const color = positionColors.get(link.job_function_id);
    if (color) map.set(link.employee_id, color);
  }
  // Fall back to any active link when no primary is flagged, so a badge still
  // takes on a position colour rather than the neutral default.
  for (const link of employeeJobFunctions) {
    if (link.active === false || map.has(link.employee_id)) continue;
    const color = positionColors.get(link.job_function_id);
    if (color) map.set(link.employee_id, color);
  }
  return map;
}
