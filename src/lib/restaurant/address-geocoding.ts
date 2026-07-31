const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000;
const MIN_REQUEST_INTERVAL = 1_050;

export type RestaurantAddressCandidate = {
  displayName: string;
  latitude: number;
  longitude: number;
  street: string;
  postalCode: string;
  city: string;
};

type NominatimResult = {
  display_name?: unknown;
  lat?: unknown;
  lon?: unknown;
  address?: {
    road?: unknown;
    pedestrian?: unknown;
    house_number?: unknown;
    postcode?: unknown;
    city?: unknown;
    town?: unknown;
    village?: unknown;
    municipality?: unknown;
  };
};

type CacheEnvelope = {
  savedAt: number;
  results: RestaurantAddressCandidate[];
};

let lastRequestAt = 0;

const text = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

function cacheKey(query: string): string {
  return `restogogo.restaurant-address.v1.${query.trim().toLowerCase()}`;
}

function readCache(query: string): RestaurantAddressCandidate[] | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey(query)) ?? '') as CacheEnvelope;
    if (Date.now() - cached.savedAt > CACHE_TTL || !Array.isArray(cached.results)) return null;
    return cached.results;
  } catch {
    return null;
  }
}

function writeCache(query: string, results: RestaurantAddressCandidate[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      cacheKey(query),
      JSON.stringify({ savedAt: Date.now(), results } satisfies CacheEnvelope)
    );
  } catch {
    // Location search remains usable when browser storage is unavailable.
  }
}

function candidate(result: NominatimResult): RestaurantAddressCandidate | null {
  const latitude = Number(result.lat);
  const longitude = Number(result.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const address = result.address ?? {};
  const road = text(address.road) || text(address.pedestrian);
  const houseNumber = text(address.house_number);
  return {
    displayName: text(result.display_name),
    latitude,
    longitude,
    street: [road, houseNumber].filter(Boolean).join(' '),
    postalCode: text(address.postcode),
    city:
      text(address.city) ||
      text(address.town) ||
      text(address.village) ||
      text(address.municipality)
  };
}

export function restaurantAddressQuery(input: {
  restaurantName?: string;
  street?: string;
  postalCode?: string;
  city?: string;
}): string {
  const street = text(input.street);
  const restaurantName = text(input.restaurantName);
  const city = [text(input.postalCode), text(input.city)].filter(Boolean).join(' ');
  return [
    restaurantName,
    street,
    city,
    'Belgium'
  ]
    .filter(Boolean)
    .join(', ');
}

export async function searchBelgianRestaurantAddress(
  query: string,
  fetcher: typeof fetch = fetch
): Promise<RestaurantAddressCandidate[]> {
  const normalized = query.trim();
  if (normalized.length < 4) return [];
  const cached = readCache(normalized);
  if (cached) return cached;

  const wait = Math.max(0, MIN_REQUEST_INTERVAL - (Date.now() - lastRequestAt));
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAt = Date.now();

  const url = new URL(NOMINATIM_SEARCH_URL);
  url.searchParams.set('q', normalized);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('countrycodes', 'be');
  url.searchParams.set('limit', '5');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetcher(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error(`Address provider returned ${response.status}.`);
    const payload = (await response.json()) as unknown;
    const results = Array.isArray(payload)
      ? payload
          .map((entry) => candidate(entry as NominatimResult))
          .filter((entry): entry is RestaurantAddressCandidate => Boolean(entry))
      : [];
    writeCache(normalized, results);
    return results;
  } finally {
    clearTimeout(timeout);
  }
}

export function osmEmbedUrl(latitude: number, longitude: number): string {
  const horizontal = 0.007;
  const vertical = 0.004;
  const bbox = [
    longitude - horizontal,
    latitude - vertical,
    longitude + horizontal,
    latitude + vertical
  ].join(',');
  const url = new URL('https://www.openstreetmap.org/export/embed.html');
  url.searchParams.set('bbox', bbox);
  url.searchParams.set('layer', 'mapnik');
  url.searchParams.set('marker', `${latitude},${longitude}`);
  return url.toString();
}

export function osmLocationUrl(latitude: number, longitude: number): string {
  const url = new URL('https://www.openstreetmap.org/');
  url.searchParams.set('mlat', String(latitude));
  url.searchParams.set('mlon', String(longitude));
  url.hash = `map=18/${latitude}/${longitude}`;
  return url.toString();
}

export function googleMapsSearchUrl(input: {
  restaurantName?: string;
  street?: string;
  postalCode?: string;
  city?: string;
}): string {
  const url = new URL('https://www.google.com/maps/search/');
  url.searchParams.set('api', '1');
  url.searchParams.set('query', restaurantAddressQuery(input));
  return url.toString();
}
