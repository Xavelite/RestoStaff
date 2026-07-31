import { asJsonArray } from '../api/json.ts';
import { slug } from './setup-item-code.ts';
import type { RestaurantReadModel } from '$lib/api/workspace-snapshot';
import { defaultAreaColor, readColorOverride } from '../ui/position-color.ts';
import {
  catalogueAreaColor,
  workspaceAreaByKey
} from './workspace-catalogue.ts';
import { uniqueAreaTechnicalCode } from './area-instance.ts';
import type { RestaurantSavePayload } from '$lib/api/mutations';
import {
  WEEKDAYS,
  configuredServicePeriods,
  mondayFor,
  serviceDefaultHours,
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
  areaIds: string[];
  catalogueKey: string;
  iconKey: string;
};

export type AreaDraft = {
  id: string;
  name: string;
  code: string;
  notes: string;
  active: boolean;
  serviceHours: Record<ServiceKey, { start: string; end: string }>;
  color: string;
  catalogueKey: string;
  iconKey: string;
  instanceNumber: number;
  floorLevel: number | null;
};

export type OpeningDraft = {
  weekday: number;
  services: Record<ServiceKey, { open: boolean; start: string; end: string }>;
};

export type ServiceDraft = {
  id: string;
  serviceKey: ServiceKey;
  name: string;
  active: boolean;
  sortOrder: number;
  defaultStart: string;
  defaultEnd: string;
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

export type DimonaSubmissionMode = 'not_configured' | 'direct' | 'social_secretariat';

export type RestaurantDraft = {
  displayName: string;
  legalName: string;
  companyNumber: string;
  onssEmployerNumber: string;
  establishmentUnitNumber: string;
  jointCommitteeCode: string;
  dimonaSubmissionMode: DimonaSubmissionMode;
  socialSecretariatName: string;
  externalEmployerId: string;
  email: string;
  phone: string;
  websiteUrl: string;
  address: string;
  postalCode: string;
  city: string;
  locationLatitude: number | null;
  locationLongitude: number | null;
  locationLabel: string;
  services: ServiceDraft[];
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
  const employment = snapshot.restaurant_employment_settings ?? {};
  const services = configuredServicePeriods(snapshot.services);
  const settings =
    snapshot.restaurant_settings.settings &&
    typeof snapshot.restaurant_settings.settings === 'object' &&
    !Array.isArray(snapshot.restaurant_settings.settings)
      ? snapshot.restaurant_settings.settings
      : {};
  const profile =
    'restaurant_profile' in settings &&
    settings.restaurant_profile &&
    typeof settings.restaurant_profile === 'object' &&
    !Array.isArray(settings.restaurant_profile)
      ? settings.restaurant_profile
      : {};
  const location =
    'location' in profile &&
    profile.location &&
    typeof profile.location === 'object' &&
    !Array.isArray(profile.location)
      ? profile.location
      : {};
  const latitude = Number('latitude' in location ? location.latitude : NaN);
  const longitude = Number('longitude' in location ? location.longitude : NaN);
  return {
    displayName: snapshot.restaurant.name,
    legalName: snapshot.restaurant.legal_name || snapshot.restaurant.name,
    companyNumber: snapshot.restaurant.company_number ?? '',
    onssEmployerNumber: employment.onss_employer_number ?? '',
    establishmentUnitNumber: employment.establishment_unit_number ?? '',
    jointCommitteeCode: employment.joint_committee_code ?? '302',
    dimonaSubmissionMode:
      employment.dimona_submission_mode === 'direct' || employment.dimona_submission_mode === 'social_secretariat'
        ? employment.dimona_submission_mode
        : 'not_configured',
    socialSecretariatName: employment.social_secretariat_name ?? '',
    externalEmployerId: employment.external_employer_id ?? '',
    email: snapshot.restaurant.email ?? '',
    phone: snapshot.restaurant.phone ?? '',
    websiteUrl:
      'website_url' in profile && typeof profile.website_url === 'string'
        ? profile.website_url
        : '',
    address: snapshot.restaurant.address_line1 ?? '',
    postalCode: snapshot.restaurant.postal_code ?? '',
    city: snapshot.restaurant.city ?? '',
    locationLatitude: Number.isFinite(latitude) ? latitude : null,
    locationLongitude: Number.isFinite(longitude) ? longitude : null,
    locationLabel:
      'label' in location && typeof location.label === 'string' ? location.label : '',
    services: services.map((service, index) => {
      const defaults = serviceDefaultHours(service.service_key, snapshot.services);
      return {
        id: 'id' in service && typeof service.id === 'string' ? service.id : service.service_key,
        serviceKey: service.service_key,
        name: service.name,
        active: service.active,
        sortOrder: service.sort_order ?? index,
        defaultStart: defaults.start,
        defaultEnd: defaults.end
      };
    }),
    jobFunctions: snapshot.job_functions.map((row) => {
      const relations = (snapshot.job_function_areas ?? [])
        .filter((relation) => relation.job_function_id === row.id && relation.active);
      const relationIds = new Set(relations.map((relation) => relation.area_id));
      const relationAreaIds = snapshot.work_areas
        .filter((area) => relationIds.has(area.id))
        .map((area) => area.id);
      const legacyAreaIds =
        row.metadata &&
        typeof row.metadata === 'object' &&
        'area_ids' in row.metadata &&
        Array.isArray(row.metadata.area_ids)
          ? row.metadata.area_ids.filter(
              (areaId): areaId is string => typeof areaId === 'string'
            )
          : [];
      const legacyAreaId =
        row.metadata &&
        typeof row.metadata === 'object' &&
        'area_id' in row.metadata &&
        typeof row.metadata.area_id === 'string'
          ? row.metadata.area_id
          : '';
      const configuredAreaIds = relationAreaIds.length
        ? relationAreaIds
        : legacyAreaIds.length
          ? legacyAreaIds
          : legacyAreaId
            ? [legacyAreaId]
            : [];
      const configured = new Set(configuredAreaIds);
      const areaIds = snapshot.work_areas
        .filter((area) => configured.has(area.id))
        .map((area) => area.id);
      return {
        id: row.id,
        name: row.name,
        code: row.code,
        active: row.active,
        estimatedHourlyCost: row.estimated_hourly_cost,
        areaIds,
        catalogueKey: row.catalogue_key ?? '',
        iconKey: row.icon_key ?? ''
      };
    }),
    areas: snapshot.work_areas.map((row, index) => ({
        id: row.id,
        name: row.name,
        code: row.code,
        notes: row.notes ?? '',
        active: row.active,
        serviceHours: Object.fromEntries(
          services.map((service) => [
            service.service_key,
            {
              start: areaDefault(snapshot, row.id, service.service_key, 'start_time'),
              end: areaDefault(snapshot, row.id, service.service_key, 'end_time')
            }
          ])
        ),
        color:
          row.color ??
          readColorOverride(row.metadata) ??
          catalogueAreaColor(row.catalogue_key) ??
          defaultAreaColor(index),
        catalogueKey: row.catalogue_key ?? '',
        iconKey: row.icon_key ?? '',
        instanceNumber: Math.max(1, Number(row.instance_number) || 1),
        floorLevel: row.floor_level ?? null
      })),
    opening: WEEKDAYS.map((_, index) => {
      const weekday = index + 1;
      return {
        weekday,
        services: Object.fromEntries(
          services.map((service) => {
            const row = snapshot.opening_hours.find(
              (item) =>
                item.weekday === weekday &&
                item.service_key === service.service_key
            );
            const defaults = serviceDefaultHours(service.service_key, snapshot.services);
            return [
              service.service_key,
              {
                open: row?.is_open === true,
                start:
                  openingValue(snapshot, weekday, service.service_key, 'opens_at') ||
                  defaults.start,
                end:
                  openingValue(snapshot, weekday, service.service_key, 'closes_at') ||
                  defaults.end
              }
            ];
          })
        )
      };
    }),
    coverage: (() => {
      // The workspace edits coverage explicitly per weekday. Existing
      // legacy default rows are expanded in memory so no staffing value is
      // lost when the restaurant next saves its setup.
      const explicit = new Map<string, CoverageDraft>();
      const defaults = snapshot.coverage_requirements.filter(
        (row) => row.coverage_scope !== 'weekday' || row.weekday == null
      );
      for (const row of snapshot.coverage_requirements) {
        if (row.coverage_scope !== 'weekday' || row.weekday == null) continue;
        const serviceKey = row.service_key;
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
        const serviceKey = row.service_key;
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

export function normalizedWebsite(value: string): string | null {
  const candidate = value.trim();
  if (!candidate) return null;
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(candidate) ? candidate : `https://${candidate}`);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function inheritedOpening(
  draft: RestaurantDraft,
  service: ServiceKey
): { start: string; end: string } | null {
  for (const row of draft.opening) {
    const period = row.services[service];
    const start = period?.start ?? '';
    const end = period?.end ?? '';
    const open = period?.open === true;
    if (open && start && end) return { start, end };
  }
  return null;
}


export function restaurantDraftValidationError(draft: RestaurantDraft): string | null {
  // Restaurant setup stays progressive. Identity, employer identifiers,
  // opening hours, areas, positions and coverage can all be completed later;
  // only the workspace-facing restaurant name is structurally required.
  if (!draft.displayName.trim()) return 'Restaurant display name is required.';
  const activeServices = draft.services.filter((service) => service.active && service.name.trim());
  if (!activeServices.length) return 'At least one active service period is required.';
  if (new Set(activeServices.map((service) => service.serviceKey)).size !== activeServices.length) {
    return 'Each service period needs a unique key.';
  }
  if (draft.websiteUrl.trim() && !normalizedWebsite(draft.websiteUrl)) {
    return 'Enter a valid restaurant website.';
  }
  return null;
}

export function restaurantSavePayload(
  snapshot: RestaurantReadModel,
  draft: RestaurantDraft
): RestaurantSavePayload {
  const restaurantId = snapshot.restaurant.id;
  const currentSettings =
    snapshot.restaurant_settings.settings &&
    typeof snapshot.restaurant_settings.settings === 'object' &&
    !Array.isArray(snapshot.restaurant_settings.settings)
      ? snapshot.restaurant_settings.settings
      : {};
  const currentProfile =
    'restaurant_profile' in currentSettings &&
    currentSettings.restaurant_profile &&
    typeof currentSettings.restaurant_profile === 'object' &&
    !Array.isArray(currentSettings.restaurant_profile)
      ? currentSettings.restaurant_profile
      : {};
  const hasResolvedLocation =
    draft.locationLatitude != null &&
    Number.isFinite(draft.locationLatitude) &&
    draft.locationLongitude != null &&
    Number.isFinite(draft.locationLongitude);
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
      name: draft.displayName.trim(),
      legal_name: draft.legalName.trim() || draft.displayName.trim(),
      company_number: nullable(draft.companyNumber),
      employment_settings: {
        onss_employer_number: nullable(draft.onssEmployerNumber),
        establishment_unit_number: nullable(draft.establishmentUnitNumber),
        joint_committee_code: draft.jointCommitteeCode.trim() || '302',
        dimona_submission_mode: draft.dimonaSubmissionMode,
        social_secretariat_name: nullable(draft.socialSecretariatName),
        external_employer_id: nullable(draft.externalEmployerId),
        metadata: snapshot.restaurant_employment_settings?.metadata ?? {}
      },
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
      settings: {
        ...currentSettings,
        restaurant_profile: {
          ...currentProfile,
          website_url: normalizedWebsite(draft.websiteUrl),
          location: hasResolvedLocation
            ? {
                latitude: draft.locationLatitude,
                longitude: draft.locationLongitude,
                label: nullable(draft.locationLabel),
                provider: 'openstreetmap'
              }
            : null
        }
      },
      payroll_settings: snapshot.restaurant_settings.payroll_settings ?? {}
    },
    services: asJsonArray(
      draft.services
        .filter((service) => service.name.trim())
        .map((service, index) => ({
          id: service.id,
          restaurant_id: restaurantId,
          service_key: service.serviceKey,
          name: service.name.trim(),
          active: service.active,
          sort_order: index,
          metadata: {
            default_start: service.defaultStart,
            default_end: service.defaultEnd
          }
        }))
    ),
    jobFunctions: asJsonArray(
      draft.jobFunctions
        .map((item, index) => {
          // Linked physical areas are the canonical position relationship.
          // System catalogue selection suggests compatible instances in the
          // client, but managers can then refine the exact set themselves.
          const areaIds = [...new Set(item.areaIds)]
            .filter(Boolean)
            .filter((areaId) =>
              draft.areas.some((area) => area.id === areaId && area.active)
            );
          return {
            ...itemRow(item, index),
            catalogue_key: nullable(item.catalogueKey),
            icon_key: nullable(item.iconKey),
            area_ids: areaIds,
            metadata: {},
            estimated_hourly_cost: Math.max(
              0,
              Number(item.estimatedHourlyCost) || 0
            )
          };
        })
        .filter((item) => item.name)
    ),
    areas: asJsonArray(
      draft.areas
        .map((item, index) => ({
          id: item.id,
          restaurant_id: restaurantId,
          code:
            item.code.trim() ||
            uniqueAreaTechnicalCode(item.name, item.id),
          name: item.name.trim(),
          active: item.active,
          sort_order: index,
          notes: nullable(item.notes),
          catalogue_key: nullable(item.catalogueKey),
          color: item.color,
          icon_key: nullable(item.iconKey),
          instance_number: Math.max(
            1,
            Math.round(Number(item.instanceNumber) || 1)
          ),
          floor_level: item.floorLevel,
          metadata: {
            reservable:
              workspaceAreaByKey.get(item.catalogueKey)?.reservable ?? true
          }
        }))
        .filter((item) => item.name)
    ),
    openingHours: asJsonArray(
      draft.opening.flatMap((item) =>
        draft.services.map((service) => ({
          restaurant_id: restaurantId,
          weekday: item.weekday,
          service_key: service.serviceKey,
          is_open: item.services[service.serviceKey]?.open === true,
          opens_at: nullable(item.services[service.serviceKey]?.start ?? ''),
          closes_at: nullable(item.services[service.serviceKey]?.end ?? '')
        }))
      )
    ),
    areaServiceDefaults: asJsonArray(
      draft.areas.filter((area) => area.name.trim()).flatMap((area) =>
        draft.services.map((service) => {
          const inherited = inheritedOpening(draft, service.serviceKey);
          const areaHours = area.serviceHours[service.serviceKey];
          return {
            restaurant_id: restaurantId,
            area_id: area.id,
            service_key: service.serviceKey,
            start_time:
              nullable(areaHours?.start ?? '') ??
              inherited?.start ??
              null,
            end_time:
              nullable(areaHours?.end ?? '') ??
              inherited?.end ??
              null
          };
        })
      )
    ),
    coverageRequirements: asJsonArray(
      draft.coverage
        .filter((item) =>
          draft.areas.some((area) => area.id === item.areaId && area.name.trim()) &&
          draft.jobFunctions.some((job) => job.id === item.jobFunctionId && job.name.trim())
        )
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
