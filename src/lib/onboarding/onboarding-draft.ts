import {
  starterWorkspaceAreas,
  starterWorkspacePositions
} from '../restaurant/workspace-catalogue.ts';

export type SetupItem = { id: string; name: string; catalogueKey: string };
export type AssignmentInput = { areaId: string; jobFunctionId: string };
export type ServiceInput = {
  id: string;
  serviceKey: string;
  name: string;
  startTime: string;
  endTime: string;
  openDays: boolean[];
};
export type EmployeeInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  jobFunctionId: string;
};
export type OnboardingDraft = {
  step: number;
  firstName: string;
  lastName: string;
  restaurantName: string;
  city: string;
  services: ServiceInput[];
  areas: SetupItem[];
  functions: SetupItem[];
  assignments: AssignmentInput[];
  employees: EmployeeInput[];
};

type LegacyDraft = Partial<OnboardingDraft> & {
  lunchStart?: string;
  lunchEnd?: string;
  eveningStart?: string;
  eveningEnd?: string;
  openDays?: boolean[];
};

const DEFAULT_OPEN_DAYS = [true, true, true, true, true, true, false];

export function createInitialOnboardingDraft(): OnboardingDraft {
  const areas = starterWorkspaceAreas();
  const positions = starterWorkspacePositions(areas.map((area) => area.key));

  return {
    step: 0,
    firstName: '',
    lastName: '',
    restaurantName: '',
    city: '',
    services: [
      {
        id: 'service-lunch',
        serviceKey: 'lunch',
        name: 'Day',
        startTime: '12:00',
        endTime: '15:00',
        openDays: [...DEFAULT_OPEN_DAYS]
      },
      {
        id: 'service-evening',
        serviceKey: 'evening',
        name: 'Night',
        startTime: '18:00',
        endTime: '23:00',
        openDays: [...DEFAULT_OPEN_DAYS]
      }
    ],
    areas: areas.map((area) => ({
      id: `area-${area.key}`,
      name: area.label,
      catalogueKey: area.key
    })),
    functions: positions.map((position) => ({
      id: `position-${position.key}`,
      name: position.label,
      catalogueKey: position.key
    })),
    assignments: positions.flatMap((position) =>
      position.areaKeys
        .filter((areaKey) => areas.some((area) => area.key === areaKey))
        .map((areaKey) => ({
          areaId: `area-${areaKey}`,
          jobFunctionId: `position-${position.key}`
        }))
    ),
    employees: []
  };
}

function normalizeItems(source: unknown, fallback: SetupItem[]): SetupItem[] {
  if (!Array.isArray(source)) return structuredClone(fallback);
  return source
    .map((item, index) => {
      const record = item as Partial<SetupItem>;
      return {
        id: String(record.id || globalThis.crypto?.randomUUID?.() || `item-${index}`),
        name: String(record.name ?? ''),
        catalogueKey: String(record.catalogueKey ?? '')
      };
    })
    .filter((item) => item.id);
}

function normalizeServices(candidate: LegacyDraft, initial: OnboardingDraft): ServiceInput[] {
  const source = Array.isArray(candidate.services)
    ? candidate.services
    : candidate.lunchStart || candidate.eveningStart
      ? [
          {
            id: 'service-lunch',
            serviceKey: 'lunch',
            name: 'Day',
            startTime: candidate.lunchStart ?? '12:00',
            endTime: candidate.lunchEnd ?? '15:00',
            openDays: candidate.openDays
          },
          {
            id: 'service-evening',
            serviceKey: 'evening',
            name: 'Night',
            startTime: candidate.eveningStart ?? '18:00',
            endTime: candidate.eveningEnd ?? '23:00',
            openDays: candidate.openDays
          }
        ]
      : initial.services;

  return source.map((service, serviceIndex) => ({
    id: String(service.id || `service-${serviceIndex + 1}`),
    serviceKey:
      typeof service.serviceKey === 'string' &&
      /^[a-z][a-z0-9-]{0,39}$/.test(service.serviceKey)
        ? service.serviceKey
        : String(service.id) === 'service-lunch'
          ? 'lunch'
          : String(service.id) === 'service-evening'
            ? 'evening'
            : '',
    name: String(service.name ?? ''),
    startTime: String(service.startTime ?? ''),
    endTime: String(service.endTime ?? ''),
    openDays: Array.from({ length: 7 }, (_, dayIndex) =>
      typeof service.openDays?.[dayIndex] === 'boolean'
        ? Boolean(service.openDays[dayIndex])
        : initial.services[0].openDays[dayIndex]
    )
  }));
}

export function normalizeOnboardingDraft(
  candidate: Partial<OnboardingDraft>,
  stepCount: number
): OnboardingDraft {
  const initial = createInitialOnboardingDraft();
  const legacy = candidate as LegacyDraft;
  const merged = { ...structuredClone(initial), ...candidate };

  return {
    ...merged,
    step: Math.min(Math.max(1, stepCount) - 1, Math.max(0, Number(merged.step ?? 0))),
    services: normalizeServices(legacy, initial),
    areas: normalizeItems(merged.areas, initial.areas),
    functions: normalizeItems(merged.functions, initial.functions),
    assignments: Array.isArray(merged.assignments) ? merged.assignments : initial.assignments,
    employees: Array.isArray(merged.employees) ? merged.employees : []
  };
}

export function onboardingServiceKey(service: ServiceInput, index: number): string {
  if (/^[a-z][a-z0-9-]{0,39}$/.test(service.serviceKey)) return service.serviceKey;

  const normalized = service.name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return /^[a-z]/.test(normalized) ? normalized : `service-${index + 1}`;
}
