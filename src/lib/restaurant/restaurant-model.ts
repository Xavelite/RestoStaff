import { asJsonArray } from '../api/json.ts';
import { setupItemCode, slug } from './setup-item-code.ts';
import type { RestaurantReadModel } from '$lib/api/workspace-snapshot';
import { defaultAreaColor, defaultPositionColor, readColorOverride, readStoredAreaColors } from '../ui/position-color.ts';
import type { RestaurantSavePayload } from '$lib/api/mutations';
import {
  SERVICES,
  WEEKDAYS,
  mondayFor,
  todayInTimezone,
  type ServiceKey
} from '../calendar/date.ts';

export type NamedSetupItem = {
  id: string;
  name: string;
  code: string;
  active: boolean;
};

export type JobFunctionDraft = NamedSetupItem & {
  estimatedHourlyCost: number;
  color: string;
};

export type AreaDraft = {
  id: string;
  name: string;
  code: string;
  notes: string;
  active: boolean;
  lunchStart: string;
  lunchEnd: string;
  eveningStart: string;
  eveningEnd: string;
  color: string;
};

export type OpeningDraft = {
  weekday: number;
  lunchOpen: boolean;
  eveningOpen: boolean;
  lunchStart: string;
  lunchEnd: string;
  eveningStart: string;
  eveningEnd: string;
};

export type CoverageDraft = {
  id: string;
  areaId: string;
  jobFunctionId: string;
  serviceKey: ServiceKey;
  coverageScope: 'weekday';
  weekday: number;
  requiredCount: number;
};

export type RestaurantDraft = {
  legalName: string;
  companyNumber: string;
  email: string;
  phone: string;
  address: string;
  postalCode: string;
  city: string;
  jobFunctions: JobFunctionDraft[];
  areas: AreaDraft[];
  opening: OpeningDraft[];
  coverage: CoverageDraft[];
};

function areaDefault(
  snapshot: RestaurantReadModel,
  areaId: string,
  service: ServiceKey,
  edge: 'start_time' | 'end_time'
): string {
  return (
    snapshot.area_service_defaults.find(
      (row) => row.area_id === areaId && row.service_key === service
    )?.[edge] ?? ''
  ).slice(0, 5);
}

function openingValue(
  snapshot: RestaurantReadModel,
  weekday: number,
  service: ServiceKey,
  edge: 'opens_at' | 'closes_at'
): string {
  return (
    snapshot.opening_hours.find(
      (row) => row.weekday === weekday && row.service_key === service
    )?.[edge] ?? ''
  ).slice(0, 5);
}

export function restaurantDraft(snapshot: RestaurantReadModel): RestaurantDraft {
  return {
    legalName: snapshot.restaurant.legal_name || snapshot.restaurant.name,
    companyNumber: snapshot.restaurant.company_number ?? '',
    email: snapshot.restaurant.email ?? '',
    phone: snapshot.restaurant.phone ?? '',
    address: snapshot.restaurant.address_line1 ?? '',
    postalCode: snapshot.restaurant.postal_code ?? '',
    city: snapshot.restaurant.city ?? '',
    jobFunctions: snapshot.job_functions.map((row, index) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      active: row.active,
      estimatedHourlyCost: row.estimated_hourly_cost,
      color: readColorOverride(row.metadata) ?? defaultPositionColor(index)
    })),
    areas: (() => {
      const storedColors = readStoredAreaColors(snapshot.restaurant.id);
      return snapshot.work_areas.map((row, index) => ({
        id: row.id,
        name: row.name,
        code: row.code,
        notes: row.notes ?? '',
        active: row.active,
        lunchStart: areaDefault(snapshot, row.id, 'lunch', 'start_time'),
        lunchEnd: areaDefault(snapshot, row.id, 'lunch', 'end_time'),
        eveningStart: areaDefault(snapshot, row.id, 'evening', 'start_time'),
        eveningEnd: areaDefault(snapshot, row.id, 'evening', 'end_time'),
        color: storedColors[row.id] ?? defaultAreaColor(index)
      }));
    })(),
    opening: WEEKDAYS.map((_, index) => {
      const weekday = index + 1;
      const lunch = snapshot.opening_hours.find((row) => row.weekday === weekday && row.service_key === 'lunch');
      const evening = snapshot.opening_hours.find((row) => row.weekday === weekday && row.service_key === 'evening');
      return {
        weekday,
        lunchOpen: lunch?.is_open === true,
        eveningOpen: evening?.is_open === true,
        lunchStart: openingValue(snapshot, weekday, 'lunch', 'opens_at'),
        lunchEnd: openingValue(snapshot, weekday, 'lunch', 'closes_at'),
        eveningStart: openingValue(snapshot, weekday, 'evening', 'opens_at'),
        eveningEnd: openingValue(snapshot, weekday, 'evening', 'closes_at')
      };
    }),
    coverage: (() => {
      // The classic workspace edits coverage explicitly per weekday. Existing
      // legacy default rows are expanded in memory so no staffing value is
      // lost when the restaurant next saves its setup.
      const explicit = new Map<string, CoverageDraft>();
      const defaults = snapshot.coverage_requirements.filter(
        (row) => row.coverage_scope !== 'weekday' || row.weekday == null
      );
      for (const row of snapshot.coverage_requirements) {
        if (row.coverage_scope !== 'weekday' || row.weekday == null) continue;
        const serviceKey = row.service_key === 'evening' ? 'evening' : 'lunch';
        const key = `${row.area_id}|${row.job_function_id}|${serviceKey}|${row.weekday}`;
        explicit.set(key, {
          id: row.id,
          areaId: row.area_id,
          jobFunctionId: row.job_function_id,
          serviceKey,
          coverageScope: 'weekday',
          weekday: row.weekday,
          requiredCount: row.required_count
        });
      }
      for (const row of defaults) {
        const serviceKey = row.service_key === 'evening' ? 'evening' : 'lunch';
        for (let weekday = 1; weekday <= 7; weekday += 1) {
          const key = `${row.area_id}|${row.job_function_id}|${serviceKey}|${weekday}`;
          if (explicit.has(key)) continue;
          explicit.set(key, {
            id: `${row.id}-${weekday}`,
            areaId: row.area_id,
            jobFunctionId: row.job_function_id,
            serviceKey,
            coverageScope: 'weekday',
            weekday,
            requiredCount: row.required_count
          });
        }
      }
      return [...explicit.values()];
    })()
  };
}

const nullable = (value: string) => value.trim() || null;

export { setupItemCode } from './setup-item-code.ts';

function inheritedOpening(
  draft: RestaurantDraft,
  service: ServiceKey
): { start: string; end: string } | null {
  for (const row of draft.opening) {
    const start = service === 'lunch' ? row.lunchStart : row.eveningStart;
    const end = service === 'lunch' ? row.lunchEnd : row.eveningEnd;
    const open = service === 'lunch' ? row.lunchOpen : row.eveningOpen;
    if (open && start && end) return { start, end };
  }
  return null;
}


export function restaurantDraftValidationError(draft: RestaurantDraft): string | null {
  if (!draft.legalName.trim()) return 'Restaurant name is required.';

  // Blank rows are how you add several at once and fill them in over time — they
  // are dropped on save (see restaurantSavePayload), never a reason to block it.
  // Only rows that carry a name reach the server, so integrity is checked
  // against those.
  const areaIds = new Set(draft.areas.filter((area) => area.name.trim()).map((area) => area.id));
  const jobIds = new Set(draft.jobFunctions.filter((job) => job.name.trim()).map((job) => job.id));
  if (draft.coverage.some((row) => !areaIds.has(row.areaId) || !jobIds.has(row.jobFunctionId))) {
    return 'A coverage requirement refers to an area or position that no longer exists.';
  }
  return null;
}

export function restaurantSavePayload(
  snapshot: RestaurantReadModel,
  draft: RestaurantDraft
): RestaurantSavePayload {
  const restaurantId = snapshot.restaurant.id;
  const itemRow = (item: NamedSetupItem, index: number) => ({
    id: item.id,
    restaurant_id: restaurantId,
    code: item.code.trim() || slug(item.name, `item-${index + 1}`),
    name: item.name.trim(),
    active: item.active,
    sort_order: index,
    metadata: 'color' in item ? { color: item.color } : {}
  });

  return {
    restaurant: {
      name: draft.legalName.trim(),
      legal_name: draft.legalName.trim(),
      company_number: nullable(draft.companyNumber),
      email: nullable(draft.email),
      phone: nullable(draft.phone),
      address_line1: nullable(draft.address),
      postal_code: nullable(draft.postalCode),
      city: nullable(draft.city),
      country_code: 'BE',
      active: true
    },
    settings: {
      timezone: snapshot.restaurant_settings.timezone || 'Europe/Brussels',
      locale: snapshot.restaurant_settings.locale || 'fr-BE',
      currency_code: snapshot.restaurant_settings.currency_code || 'EUR',
      active_week_start:
        snapshot.restaurant_settings.active_week_start ??
        mondayFor(todayInTimezone(snapshot.restaurant_settings.timezone || 'Europe/Brussels')),
      week_start_weekday: 1,
      settings: snapshot.restaurant_settings.settings ?? {},
      payroll_settings: snapshot.restaurant_settings.payroll_settings ?? {}
    },
    jobFunctions: asJsonArray(
      draft.jobFunctions
        .map((item, index) => ({
          ...itemRow(item, index),
          estimated_hourly_cost: Math.max(0, Number(item.estimatedHourlyCost) || 0)
        }))
        .filter((item) => item.name)
    ),
    areas: asJsonArray(
      draft.areas
        .map((item, index) => ({
          id: item.id,
          restaurant_id: restaurantId,
          code: item.code.trim() || slug(item.name, `area-${index + 1}`),
          name: item.name.trim(),
          active: item.active,
          sort_order: index,
          notes: nullable(item.notes)
        }))
        .filter((item) => item.name)
    ),
    openingHours: asJsonArray(
      draft.opening.flatMap((item) =>
        SERVICES.map((service) => ({
          restaurant_id: restaurantId,
          weekday: item.weekday,
          service_key: service,
          is_open: service === 'lunch' ? item.lunchOpen : item.eveningOpen,
          opens_at: nullable(service === 'lunch' ? item.lunchStart : item.eveningStart),
          closes_at: nullable(service === 'lunch' ? item.lunchEnd : item.eveningEnd)
        }))
      )
    ),
    areaServiceDefaults: asJsonArray(
      draft.areas.filter((area) => area.name.trim()).flatMap((area) =>
        SERVICES.map((service) => {
          const inherited = inheritedOpening(draft, service);
          return {
            restaurant_id: restaurantId,
            area_id: area.id,
            service_key: service,
            start_time:
              nullable(service === 'lunch' ? area.lunchStart : area.eveningStart) ??
              inherited?.start ??
              null,
            end_time:
              nullable(service === 'lunch' ? area.lunchEnd : area.eveningEnd) ??
              inherited?.end ??
              null
          };
        })
      )
    ),
    coverageRequirements: asJsonArray(
      draft.coverage
        .map((item, index) => ({
          restaurant_id: restaurantId,
          area_id: item.areaId,
          job_function_id: item.jobFunctionId,
          service_key: item.serviceKey,
          coverage_scope: 'weekday',
          weekday: item.weekday,
          required_count: Math.max(0, Math.round(Number(item.requiredCount) || 0)),
          active: true,
          sort_order: index
        }))
        .filter((item) => item.area_id && item.job_function_id)
    )
  };
}
