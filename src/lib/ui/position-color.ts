// Shared colour identity for positions, areas and employees.
//
// Positions use a lighter, vivid palette because they are operational labels.
// Areas use a deeper palette because they are structural locations. Defaults are
// deterministic; owner-selected overrides take precedence.

export const POSITION_PALETTE = [
  '#2563eb', // blue
  '#ea580c', // orange
  '#16a34a', // green
  '#9333ea', // violet
  '#0891b2', // cyan
  '#dc2626', // red
  '#d97706', // amber
  '#4f46e5', // indigo
  '#db2777', // pink
  '#0284c7' // sky
] as const;

export const AREA_PALETTE = [
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

const AREA_STORAGE_PREFIX = 'rst-area-colors:';

type JobFunctionLike = {
  id: string;
  sort_order?: number | null;
  name?: string | null;
  active?: boolean | null;
  metadata?: unknown;
  color?: string | null;
};

type AreaLike = {
  id: string;
  restaurant_id?: string | null;
  sort_order?: number | null;
  name?: string | null;
  metadata?: unknown;
  color?: string | null;
};

export function validWorkspaceColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

export function readColorOverride(metadata: unknown): string | null {
  if (metadata && typeof metadata === 'object' && 'color' in metadata) {
    const value = (metadata as { color?: unknown }).color;
    if (validWorkspaceColor(value)) return value;
  }
  return null;
}

export function defaultPositionColor(index: number): string {
  return POSITION_PALETTE[index % POSITION_PALETTE.length];
}

export function defaultAreaColor(index: number): string {
  return AREA_PALETTE[index % AREA_PALETTE.length];
}

function areaStorageKey(restaurantId: string): string {
  return `${AREA_STORAGE_PREFIX}${restaurantId}`;
}

export function readStoredAreaColors(restaurantId: string): Record<string, string> {
  if (!restaurantId || typeof localStorage === 'undefined') return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(areaStorageKey(restaurantId)) ?? '{}') as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => validWorkspaceColor(entry[1]))
    );
  } catch {
    return {};
  }
}

export function storeAreaColors(restaurantId: string, entries: Array<{ id: string; color: string }>): void {
  if (!restaurantId || typeof localStorage === 'undefined') return;
  const payload = Object.fromEntries(entries.filter((entry) => validWorkspaceColor(entry.color)).map((entry) => [entry.id, entry.color]));
  try {
    localStorage.setItem(areaStorageKey(restaurantId), JSON.stringify(payload));
  } catch {
    // Storage is a browser convenience until area colours are persisted by DB.
  }
}

/** Position id → colour. Stable across sessions; metadata overrides win. */
export function buildPositionColorMap(jobFunctions: JobFunctionLike[]): Map<string, string> {
  const ordered = [...jobFunctions].sort(
    (a, b) =>
      (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
      (a.name ?? '').localeCompare(b.name ?? '')
  );
  const map = new Map<string, string>();
  ordered.forEach((item, index) => {
    const direct = validWorkspaceColor(item.color) ? item.color : null;
    map.set(item.id, direct ?? readColorOverride(item.metadata) ?? defaultPositionColor(index));
  });
  return map;
}

/** Area id → colour. Local owner preferences bridge the current DB gap. */
export function buildAreaColorMap(areas: AreaLike[]): Map<string, string> {
  const ordered = [...areas].sort(
    (a, b) =>
      (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
      (a.name ?? '').localeCompare(b.name ?? '')
  );
  const restaurantId = ordered.find((item) => item.restaurant_id)?.restaurant_id ?? '';
  const stored = readStoredAreaColors(restaurantId);
  const map = new Map<string, string>();
  ordered.forEach((item, index) => {
    const direct = validWorkspaceColor(item.color) ? item.color : null;
    map.set(item.id, direct ?? readColorOverride(item.metadata) ?? stored[item.id] ?? defaultAreaColor(index));
  });
  return map;
}

/**
 * Employee id → colour of their primary position. Employees with no primary
 * position inherit the first active assignment, then the neutral UI colour.
 */
export function buildEmployeeColorMap(
  jobFunctions: JobFunctionLike[],
  assignments: Array<{
    employee_id: string;
    job_function_id: string;
    is_primary?: boolean | null;
    active?: boolean | null;
  }>
): Map<string, string> {
  const positionColors = buildPositionColorMap(jobFunctions);
  const map = new Map<string, string>();
  for (const link of assignments) {
    if (link.active === false || !link.is_primary) continue;
    const color = positionColors.get(link.job_function_id);
    if (color) map.set(link.employee_id, color);
  }
  for (const link of assignments) {
    if (link.active === false || map.has(link.employee_id)) continue;
    const color = positionColors.get(link.job_function_id);
    if (color) map.set(link.employee_id, color);
  }
  return map;
}
