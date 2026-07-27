export type AreaInstanceIdentity = {
  id: string;
  name: string;
  active: boolean;
  catalogueKey: string;
  instanceNumber: number;
  floorLevel: number;
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
): AreaInstanceIdentity {
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
    .toLowerCase()
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
  area: AreaInstanceIdentity,
  areas: ReadonlyArray<AreaInstanceIdentity>
): string {
  const floorToken = areaFloorToken(area.floorLevel);
  const typeKey = areaTypeKey(area);
  const currentAreas = areas.some((candidate) => candidate.id === area.id)
    ? areas.map((candidate) => (candidate.id === area.id ? area : candidate))
    : [...areas, area];
  const floorPeers = currentAreas
    .filter(
      (candidate) =>
        candidate.active &&
        areaTypeKey(candidate) === typeKey &&
        candidate.floorLevel === area.floorLevel
    )
    .toSorted(
      (left, right) =>
        left.instanceNumber - right.instanceNumber ||
        left.id.localeCompare(right.id)
    );

  if (floorPeers.length <= 1) return floorToken;

  const floorIndex = floorPeers.findIndex(
    (candidate) => candidate.id === area.id
  );
  const letter = areaInstanceLetter(
    floorIndex >= 0 ? floorIndex + 1 : floorPeers.length + 1
  );
  return `${floorToken}.${letter}`;
}

export function areaInstanceLabel(
  area: AreaInstanceIdentity,
  areas: ReadonlyArray<AreaInstanceIdentity>
): string {
  return duplicateAreaTypeCount(area, areas) > 1
    ? `${area.name} (${areaInstanceLocator(area, areas)})`
    : area.name;
}

/**
 * Reader-facing label for a row. The editable `name` remains the canonical
 * base name ("Bar"). Duplicate types on separate floors use only the floor
 * token ("Bar (+1)"). A floor-local letter is added only when that floor has
 * several active instances of the same type ("Bar (+1.A)", "Bar (+1.B)").
 */
export function areaInstanceRowLabel(
  area: AreaInstanceRow,
  areas: ReadonlyArray<AreaInstanceRow>
): string {
  const identities = areas.map(areaInstanceIdentity);
  const identity =
    identities.find((candidate) => candidate.id === area.id) ??
    areaInstanceIdentity(area);
  return areaInstanceLabel(identity, identities);
}

export function areaInstanceLabelMap(
  areas: ReadonlyArray<AreaInstanceRow>
): Map<string, string> {
  const identities = areas.map(areaInstanceIdentity);
  return new Map(
    identities.map((area) => [
      area.id,
      areaInstanceLabel(area, identities)
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
