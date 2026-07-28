// Shared colour identity for positions, areas and employees.
//
// Areas are the strong colour anchor. Positions inherit the same hue as a
// deliberately lighter tint, so the relationship stays visible throughout
// Restaurant, Team, Planning and Time & attendance.

import {
  catalogueAreaColor,
  workspaceAreaByKey
} from '../restaurant/workspace-catalogue.ts';

const POSITION_PALETTE = [
  '#60a5fa', // blue
  '#fb923c', // orange
  '#34d399', // green
  '#a78bfa', // violet
  '#22d3ee', // cyan
  '#fb7185', // rose
  '#fbbf24', // amber
  '#818cf8', // indigo
  '#f472b6', // pink
  '#38bdf8' // sky
] as const;

export const AREA_PALETTE = [
  '#f97316', // orange
  '#3b82f6', // blue
  '#10b981', // emerald
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#6366f1', // indigo
  '#f43f5e', // rose
  '#84cc16', // lime
  '#64748b' // slate
] as const;

type JobFunctionLike = {
  id: string;
  sort_order?: number | null;
  name?: string | null;
  active?: boolean | null;
  color?: string | null;
  areaIds?: readonly string[] | null;
  catalogueKey?: string | null;
};

type AreaLike = {
  id: string;
  restaurant_id?: string | null;
  sort_order?: number | null;
  name?: string | null;
  active?: boolean | null;
  metadata?: unknown;
  color?: string | null;
  icon_key?: string | null;
  catalogue_key?: string | null;
  catalogueKey?: string | null;
};

type JobFunctionAreaLike = {
  job_function_id: string;
  area_id: string;
  active?: boolean | null;
};

function validWorkspaceColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

export function readColorOverride(metadata: unknown): string | null {
  if (metadata && typeof metadata === 'object' && 'color' in metadata) {
    const value = (metadata as { color?: unknown }).color;
    if (validWorkspaceColor(value)) return value;
  }
  return null;
}

function defaultPositionColor(index: number): string {
  return POSITION_PALETTE[index % POSITION_PALETTE.length];
}

export function defaultAreaColor(index: number): string {
  return AREA_PALETTE[index % AREA_PALETTE.length];
}

function areaOrder(areas: readonly AreaLike[]): Map<string, number> {
  return new Map(
    [...areas]
      .sort(
        (left, right) =>
          (left.sort_order ?? 0) - (right.sort_order ?? 0) ||
          (left.name ?? '').localeCompare(right.name ?? '') ||
          left.id.localeCompare(right.id)
      )
      .map((area, index) => [area.id, index])
  );
}

export function linkedAreasForPosition<T extends AreaLike>(
  positionId: string,
  areas: readonly T[],
  relationships: readonly JobFunctionAreaLike[]
): T[] {
  const linkedIds = new Set(
    relationships
      .filter(
        (relationship) =>
          relationship.active !== false &&
          relationship.job_function_id === positionId
      )
      .map((relationship) => relationship.area_id)
  );
  return areas
    .filter((area) => area.active !== false && linkedIds.has(area.id))
    .toSorted(
      (left, right) =>
        (left.sort_order ?? 0) - (right.sort_order ?? 0) ||
        (left.name ?? '').localeCompare(right.name ?? '') ||
        left.id.localeCompare(right.id)
    );
}

export function positionAreaVisualIdentity(
  positionId: string,
  areas: readonly AreaLike[],
  relationships: readonly JobFunctionAreaLike[],
  colors: ReadonlyMap<string, string> = buildAreaColorMap([...areas]),
  fallbackColor = ''
): { areaId: string; icon: string; color: string } | null {
  // A position always gets a glyph. When it spans areas that do not share one
  // look — or is tied to none — it falls back to the default icon rather than
  // rendering nothing, so a roster never shows a bare colour bar where every
  // other row has an icon. The fallback wears the position's own colour, so the
  // glyph stays keyed to the same identity the rest of the row uses.
  const neutral = { areaId: '', icon: '', color: fallbackColor || 'var(--cl-muted)' };
  const linkedAreas = linkedAreasForPosition(positionId, areas, relationships);
  const first = linkedAreas[0];
  if (!first) return neutral;
  const iconFor = (area: AreaLike) =>
    area.icon_key ||
    workspaceAreaByKey.get(area.catalogueKey ?? area.catalogue_key ?? '')?.icon ||
    '';
  const firstIcon = iconFor(first);
  const firstColor = colors.get(first.id) ?? 'var(--cl-muted)';
  const hasOneVisualIdentity = linkedAreas.every(
    (area) =>
      iconFor(area) === firstIcon &&
      (colors.get(area.id) ?? 'var(--cl-muted)') === firstColor
  );
  return hasOneVisualIdentity
    ? { areaId: first.id, icon: firstIcon, color: firstColor }
    : neutral;
}

function readAreaIds(
  item: JobFunctionLike,
  relationships: readonly JobFunctionAreaLike[],
  order: ReadonlyMap<string, number>
): string[] {
  const linked = Array.isArray(item.areaIds)
    ? item.areaIds
    : relationships
        .filter(
          (relationship) =>
            relationship.active !== false && relationship.job_function_id === item.id
        )
        .map((relationship) => relationship.area_id);
  return [...new Set(linked.filter((value): value is string => typeof value === 'string' && Boolean(value)))]
    .sort(
      (left, right) =>
        (order.get(left) ?? Number.MAX_SAFE_INTEGER) -
          (order.get(right) ?? Number.MAX_SAFE_INTEGER) ||
        left.localeCompare(right)
    );
}

function mixHex(base: string, target: '#ffffff' | '#000000', amount: number): string {
  const source = base.slice(1).match(/.{2}/g)?.map((part) => Number.parseInt(part, 16)) ?? [55, 65, 81];
  const destination = target === '#ffffff' ? 255 : 0;
  return `#${source
    .map((channel) => Math.round(channel + (destination - channel) * amount).toString(16).padStart(2, '0'))
    .join('')}`;
}

/**
 * Position id -> colour. Linked physical areas are canonical. When a position
 * spans several areas, their stable workspace order supplies one visual family;
 * no relationship is treated as "primary".
 */
export function buildPositionColorMap(
  jobFunctions: JobFunctionLike[],
  areas: AreaLike[] = [],
  relationships: readonly JobFunctionAreaLike[] = []
): Map<string, string> {
  const ordered = [...jobFunctions].sort(
    (a, b) =>
      (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
      (a.name ?? '').localeCompare(b.name ?? '')
  );
  const areaColors = buildAreaColorMap(areas);
  const linkedAreaOrder = areaOrder(areas);
  const positionIndexByArea = new Map<string, number>();
  const map = new Map<string, string>();
  ordered.forEach((item, index) => {
    const linkedAreaIds = readAreaIds(item, relationships, linkedAreaOrder);
    const areaId = linkedAreaIds[0] ?? null;
    const areaColor = areaId ? areaColors.get(areaId) : null;
    if (areaId && areaColor) {
      const siblingIndex = positionIndexByArea.get(areaId) ?? 0;
      positionIndexByArea.set(areaId, siblingIndex + 1);
      const variants = [
        mixHex(areaColor, '#ffffff', 0.2),
        mixHex(areaColor, '#ffffff', 0.32),
        mixHex(areaColor, '#ffffff', 0.42),
        mixHex(areaColor, '#ffffff', 0.5)
      ];
      map.set(item.id, variants[siblingIndex % variants.length]);
      return;
    }
    const direct = validWorkspaceColor(item.color) ? item.color : null;
    map.set(item.id, direct ?? defaultPositionColor(index));
  });
  return map;
}

/** Area id → colour. Restaurant metadata is the persistent source of truth. */
export function buildAreaColorMap(areas: AreaLike[]): Map<string, string> {
  const ordered = [...areas].sort(
    (a, b) =>
      (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
      (a.name ?? '').localeCompare(b.name ?? '')
  );
  const map = new Map<string, string>();
  ordered.forEach((item, index) => {
    const direct = validWorkspaceColor(item.color) ? item.color : null;
    const catalogueKey = item.catalogueKey ?? item.catalogue_key;
    map.set(
      item.id,
      direct ??
        readColorOverride(item.metadata) ??
        catalogueAreaColor(catalogueKey) ??
        defaultAreaColor(index)
    );
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
  }>,
  areas: AreaLike[] = [],
  relationships: readonly JobFunctionAreaLike[] = []
): Map<string, string> {
  const positionColors = buildPositionColorMap(jobFunctions, areas, relationships);
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
