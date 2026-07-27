export type AreaInstanceIdentity = {
  id: string;
  name: string;
  active: boolean;
  catalogueKey: string;
  instanceNumber: number;
};

/**
 * The same physical work area is represented with camelCase in editable
 * restaurant drafts and snake_case in database read models. Display helpers
 * accept either shape so every workspace derives the locator in one place.
 */
type AreaInstanceRow = {
  id: string;
  name: string;
  active: boolean;
  catalogueKey?: string | null;
  catalogue_key?: string | null;
  instanceNumber?: number | null;
  instance_number?: number | null;
  floorLevel?: number | null;
  floor_level?: number | null;
};

function areaInstanceIdentity(
  area: AreaInstanceRow
): AreaInstanceIdentity & { floorLevel: number } {
  return {
    id: area.id,
    name: area.name,
    active: area.active,
    catalogueKey: area.catalogueKey ?? area.catalogue_key ?? '',
    instanceNumber: Math.max(
      1,
      Number(area.instanceNumber ?? area.instance_number) || 1
    ),
    floorLevel: Math.trunc(
      Number(area.floorLevel ?? area.floor_level) || 0
    )
  };
}

function normalizedAreaTypeName(name: string): string {
  return name
    .trim()
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function areaTypeKey(
  area: Pick<AreaInstanceIdentity, 'catalogueKey' | 'name'>
): string {
  return area.catalogueKey
    ? `catalogue:${area.catalogueKey}`
    : `custom:${normalizedAreaTypeName(area.name)}`;
}

export function areaInstanceLetter(value: number): string {
  let number = Math.max(1, Math.trunc(Number(value) || 1));
  let result = '';
  while (number > 0) {
    number -= 1;
    result = String.fromCharCode(65 + (number % 26)) + result;
    number = Math.floor(number / 26);
  }
  return result;
}

function areaFloorToken(level: number): string {
  const normalized = Math.trunc(Number(level) || 0);
  return normalized > 0 ? `+${normalized}` : String(normalized);
}

export function duplicateAreaTypeCount(
  area: Pick<AreaInstanceIdentity, 'id' | 'name' | 'active' | 'catalogueKey'>,
  areas: ReadonlyArray<
    Pick<AreaInstanceIdentity, 'id' | 'name' | 'active' | 'catalogueKey'>
  >
): number {
  const typeKey = areaTypeKey(area);
  if (typeKey === 'custom:') return 1;
  return areas.filter(
    (candidate) =>
      candidate.active &&
      areaTypeKey(candidate) === typeKey
  ).length;
}

export function areaInstanceLocator(
  area: Pick<AreaInstanceIdentity, 'instanceNumber'>,
  floorLevel: number
): string {
  return `${areaFloorToken(floorLevel)}.${areaInstanceLetter(area.instanceNumber)}`;
}

export function areaInstanceLabel(
  area: AreaInstanceIdentity,
  areas: ReadonlyArray<AreaInstanceIdentity>,
  floorLevel: number
): string {
  return duplicateAreaTypeCount(area, areas) > 1
    ? `${area.name} (${areaInstanceLocator(area, floorLevel)})`
    : area.name;
}

/**
 * Reader-facing label for a row. The editable `name` remains the canonical
 * base name ("Bar"); the physical locator is derived only when duplicate
 * active catalogue types need disambiguation.
 */
export function areaInstanceRowLabel(
  area: AreaInstanceRow,
  areas: ReadonlyArray<AreaInstanceRow>
): string {
  const identities = areas.map(areaInstanceIdentity);
  const identity =
    identities.find((candidate) => candidate.id === area.id) ??
    areaInstanceIdentity(area);
  return areaInstanceLabel(identity, identities, identity.floorLevel);
}

export function areaInstanceLabelMap(
  areas: ReadonlyArray<AreaInstanceRow>
): Map<string, string> {
  const identities = areas.map(areaInstanceIdentity);
  return new Map(
    identities.map((area) => [
      area.id,
      areaInstanceLabel(area, identities, area.floorLevel)
    ])
  );
}

export function nextAreaInstanceNumber(
  catalogueKey: string,
  areas: ReadonlyArray<
    Pick<
      AreaInstanceIdentity,
      'id' | 'name' | 'catalogueKey' | 'instanceNumber'
    >
  >,
  currentAreaId = '',
  customName = ''
): number {
  const targetType = areaTypeKey({
    catalogueKey,
    name: customName
  });
  if (targetType === 'custom:') return 1;
  return (
    areas.reduce((maximum, area) => {
      if (
        areaTypeKey(area) !== targetType ||
        area.id === currentAreaId
      ) {
        return maximum;
      }
      return Math.max(maximum, Math.max(1, Number(area.instanceNumber) || 1));
    }, 0) + 1
  );
}

export function uniqueAreaTechnicalCode(name: string, id: string): string {
  const base =
    name
      .trim()
      .toLocaleLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'area';
  return `${base}-${id.slice(0, 8)}`;
}
