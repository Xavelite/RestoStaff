// Shared colour identity for positions, areas and employees.
//
// Areas are the strong colour anchor. Positions inherit the same hue as a
// deliberately lighter tint, so the relationship stays visible throughout
// Restaurant, Team, Planning and Time & attendance.

import { catalogueAreaColor } from '../restaurant/workspace-catalogue.ts';

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
  metadata?: unknown;
  color?: string | null;
  primaryAreaId?: string | null;
  areaIds?: readonly string[] | null;
  catalogueKey?: string | null;
};

type AreaLike = {
  id: string;
  restaurant_id?: string | null;
  sort_order?: number | null;
  name?: string | null;
  metadata?: unknown;
  color?: string | null;
  catalogue_key?: string | null;
  catalogueKey?: string | null;
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

function readPrimaryAreaId(item: JobFunctionLike): string | null {
  if (item.primaryAreaId) return item.primaryAreaId;
  if (item.metadata && typeof item.metadata === 'object' && 'area_id' in item.metadata) {
    const value = (item.metadata as { area_id?: unknown }).area_id;
    return typeof value === 'string' && value ? value : null;
  }
  return null;
}

function readAreaIds(item: JobFunctionLike): string[] {
  if (Array.isArray(item.areaIds)) {
    return item.areaIds.filter((value): value is string => typeof value === 'string' && Boolean(value));
  }
  if (item.metadata && typeof item.metadata === 'object' && 'area_ids' in item.metadata) {
    const value = (item.metadata as { area_ids?: unknown }).area_ids;
    if (Array.isArray(value)) {
      return value.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry));
    }
  }
  const primary = readPrimaryAreaId(item);
  return primary ? [primary] : [];
}

function inferredAreaId(item: JobFunctionLike, areas: AreaLike[]): string | null {
  const normalized = (item.name ?? '').toLowerCase();
  const direct = areas.find((area) => normalized.includes((area.name ?? '').toLowerCase()));
  if (direct) return direct.id;
  const hint =
    /cook|chef|kitchen|dish/.test(normalized)
      ? /kitchen|cuisine/
      : /bar|bartend/.test(normalized)
        ? /bar/
        : /wait|server|host|runner/.test(normalized)
          ? /hall|room|salle/
          : null;
  return hint ? areas.find((area) => hint.test((area.name ?? '').toLowerCase()))?.id ?? null : null;
}

function mixHex(base: string, target: '#ffffff' | '#000000', amount: number): string {
  const source = base.slice(1).match(/.{2}/g)?.map((part) => Number.parseInt(part, 16)) ?? [55, 65, 81];
  const destination = target === '#ffffff' ? 255 : 0;
  return `#${source
    .map((channel) => Math.round(channel + (destination - channel) * amount).toString(16).padStart(2, '0'))
    .join('')}`;
}

/**
 * Position id → colour. A position inherits the identity of its primary area;
 * sibling positions receive stable lighter tints so the restaurant keeps one visual
 * language. Legacy colours remain a fallback while no area is linked.
 */
export function buildPositionColorMap(
  jobFunctions: JobFunctionLike[],
  areas: AreaLike[] = []
): Map<string, string> {
  const ordered = [...jobFunctions].sort(
    (a, b) =>
      (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
      (a.name ?? '').localeCompare(b.name ?? '')
  );
  const areaColors = buildAreaColorMap(areas);
  const positionIndexByArea = new Map<string, number>();
  const map = new Map<string, string>();
  ordered.forEach((item, index) => {
    const linkedAreaIds = readAreaIds(item);
    const primaryAreaId = readPrimaryAreaId(item);
    const areaId =
      primaryAreaId && linkedAreaIds.includes(primaryAreaId)
        ? primaryAreaId
        : linkedAreaIds.length === 1
        ? linkedAreaIds[0]
        : inferredAreaId(item, areas);
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
    map.set(item.id, direct ?? readColorOverride(item.metadata) ?? defaultPositionColor(index));
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
  areas: AreaLike[] = []
): Map<string, string> {
  const positionColors = buildPositionColorMap(jobFunctions, areas);
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
