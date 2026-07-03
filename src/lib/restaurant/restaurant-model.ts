import { asJsonArray } from '../api/json.ts';
import type { RestaurantReadModel } from '$lib/api/workspace-snapshot';
import type { RestaurantSavePayload } from '$lib/api/mutations';
import {
  SERVICES,
  WEEKDAYS,
  mondayFor,
  todayInTimezone,
  type ServiceKey
} from '$lib/calendar/date';

export type NamedSetupItem = {
  id: string;
  name: string;
  code: string;
  active: boolean;
};

export type JobFunctionDraft = NamedSetupItem & {
  estimatedHourlyCost: number;
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
};

export type OpeningDraft = {
  weekday: number;
  open: boolean;
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
  coverageScope: 'default' | 'weekday';
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
    jobFunctions: snapshot.job_functions.map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      active: row.active,
      estimatedHourlyCost: row.estimated_hourly_cost
    })),
    areas: snapshot.work_areas.map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      notes: row.notes ?? '',
      active: row.active,
      lunchStart: areaDefault(snapshot, row.id, 'lunch', 'start_time'),
      lunchEnd: areaDefault(snapshot, row.id, 'lunch', 'end_time'),
      eveningStart: areaDefault(snapshot, row.id, 'evening', 'start_time'),
      eveningEnd: areaDefault(snapshot, row.id, 'evening', 'end_time')
    })),
    opening: WEEKDAYS.map((_, index) => {
      const weekday = index + 1;
      const rows = snapshot.opening_hours.filter((row) => row.weekday === weekday);
      return {
        weekday,
        open: rows.some((row) => row.is_open),
        lunchStart: openingValue(snapshot, weekday, 'lunch', 'opens_at'),
        lunchEnd: openingValue(snapshot, weekday, 'lunch', 'closes_at'),
        eveningStart: openingValue(snapshot, weekday, 'evening', 'opens_at'),
        eveningEnd: openingValue(snapshot, weekday, 'evening', 'closes_at')
      };
    }),
    coverage: snapshot.coverage_requirements.map((row) => {
      return {
        id: row.id,
        areaId: row.area_id,
        jobFunctionId: row.job_function_id,
        serviceKey: row.service_key === 'evening' ? 'evening' : 'lunch',
        coverageScope: row.coverage_scope === 'weekday' ? 'weekday' : 'default',
        weekday: row.weekday ?? 1,
        requiredCount: row.required_count
      };
    })
  };
}

const nullable = (value: string) => value.trim() || null;

export function slug(value: string, fallback: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || fallback
  );
}

function inheritedOpening(
  draft: RestaurantDraft,
  service: ServiceKey
): { start: string; end: string } | null {
  for (const row of draft.opening) {
    const start = service === 'lunch' ? row.lunchStart : row.eveningStart;
    const end = service === 'lunch' ? row.lunchEnd : row.eveningEnd;
    if (row.open && start && end) return { start, end };
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
    metadata: {}
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
      timezone: 'Europe/Brussels',
      locale: 'fr-BE',
      currency_code: 'EUR',
      active_week_start:
        snapshot.restaurant_settings.active_week_start ??
        mondayFor(todayInTimezone('Europe/Brussels')),
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
          is_open: item.open,
          opens_at: nullable(service === 'lunch' ? item.lunchStart : item.eveningStart),
          closes_at: nullable(service === 'lunch' ? item.lunchEnd : item.eveningEnd)
        }))
      )
    ),
    areaServiceDefaults: asJsonArray(
      draft.areas.flatMap((area) =>
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
          coverage_scope: item.coverageScope,
          weekday: item.coverageScope === 'weekday' ? item.weekday : null,
          required_count: Math.max(0, Math.round(Number(item.requiredCount) || 0)),
          active: true,
          sort_order: index
        }))
        .filter((item) => item.area_id && item.job_function_id)
    )
  };
}
