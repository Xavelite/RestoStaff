import { env } from '$env/dynamic/public';
import {
  parseOpenMeteoForecast,
  weatherLocationKey,
  type DailyWeather,
  type ResolvedWeatherLocation,
  type RestaurantWeatherSnapshot,
  type WeatherLocationInput
} from './weather';

const DEFAULT_GEOCODING_ENDPOINT = 'https://geocoding-api.open-meteo.com/v1/search';
const DEFAULT_FORECAST_ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
const GEOCODE_TTL = 30 * 24 * 60 * 60 * 1000;
const FORECAST_TTL = 20 * 60 * 1000;

type CacheEnvelope<T> = { savedAt: number; value: T };
type GeocodingResult = {
  latitude?: number;
  longitude?: number;
  name?: string;
  country_code?: string;
  timezone?: string;
  postcodes?: string[];
  admin1?: string;
  admin2?: string;
};

function readCache<T>(key: string, maxAge: number): T | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const cached = JSON.parse(localStorage.getItem(key) ?? '') as CacheEnvelope<T>;
    return Date.now() - cached.savedAt <= maxAge ? cached.value : null;
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, value: T): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), value } satisfies CacheEnvelope<T>));
  } catch {
    // Weather stays optional when browser storage is unavailable.
  }
}

async function fetchJson(url: URL): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Weather provider returned ${response.status}.`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function scoreLocation(candidate: GeocodingResult, input: WeatherLocationInput): number {
  const city = input.city.trim().toLowerCase();
  const postalCode = String(input.postalCode ?? '').trim().toLowerCase();
  let score = candidate.country_code?.toLowerCase() === input.countryCode?.toLowerCase() ? 8 : 0;
  if (candidate.name?.toLowerCase() === city) score += 8;
  if ([candidate.name, candidate.admin1, candidate.admin2].some((value) => value?.toLowerCase().includes(city))) score += 4;
  if (postalCode && candidate.postcodes?.some((value) => value.toLowerCase() === postalCode)) score += 6;
  return score;
}

async function resolveLocation(input: WeatherLocationInput): Promise<ResolvedWeatherLocation> {
  const key = `restogogo.weather.location.v1.${weatherLocationKey(input)}`;
  const cached = readCache<ResolvedWeatherLocation>(key, GEOCODE_TTL);
  if (cached) return cached;

  const endpoint = env.PUBLIC_WEATHER_GEOCODING_ENDPOINT || DEFAULT_GEOCODING_ENDPOINT;
  const url = new URL(endpoint);
  // City-level resolution is intentional: Open-Meteo's search accepts a city
  // or a postal code, but combining both can return no result. The postcode is
  // still used to rank candidates when the provider supplies postcode data.
  url.searchParams.set('name', input.city);
  url.searchParams.set('count', '8');
  url.searchParams.set('language', 'en');
  if (input.countryCode) url.searchParams.set('countryCode', input.countryCode.toUpperCase());
  const payload = (await fetchJson(url)) as { results?: GeocodingResult[] };
  const best = [...(payload.results ?? [])].sort((left, right) => scoreLocation(right, input) - scoreLocation(left, input))[0];
  if (!best || !Number.isFinite(best.latitude) || !Number.isFinite(best.longitude)) {
    throw new Error('Restaurant location could not be resolved for weather.');
  }
  const location: ResolvedWeatherLocation = {
    latitude: Number(best.latitude),
    longitude: Number(best.longitude),
    name: input.city || best.name || 'Restaurant',
    countryCode: best.country_code || input.countryCode || '',
    timezone: best.timezone || input.timezone || 'auto'
  };
  writeCache(key, location);
  return location;
}

async function fetchForecast(location: ResolvedWeatherLocation): Promise<RestaurantWeatherSnapshot> {
  const cacheKey = `restogogo.weather.forecast.v1.${location.latitude.toFixed(3)}|${location.longitude.toFixed(3)}`;
  const cached = readCache<RestaurantWeatherSnapshot>(cacheKey, FORECAST_TTL);
  if (cached) return cached;

  const endpoint = env.PUBLIC_WEATHER_FORECAST_ENDPOINT || DEFAULT_FORECAST_ENDPOINT;
  const url = new URL(endpoint);
  url.searchParams.set('latitude', String(location.latitude));
  url.searchParams.set('longitude', String(location.longitude));
  url.searchParams.set('timezone', location.timezone || 'auto');
  url.searchParams.set('forecast_days', '16');
  url.searchParams.set('past_days', '7');
  url.searchParams.set('current', 'temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,is_day');
  url.searchParams.set('hourly', 'precipitation_probability');
  url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max');
  const snapshot = parseOpenMeteoForecast(await fetchJson(url), location);
  writeCache(cacheKey, snapshot);
  return snapshot;
}

class RestaurantWeatherStore {
  snapshot = $state<RestaurantWeatherSnapshot | null>(null);
  loading = $state(false);
  error = $state('');
  private loadedKey = '';
  private request: Promise<void> | null = null;

  async load(location: WeatherLocationInput, force = false): Promise<void> {
    if (typeof window === 'undefined' || !location.city.trim()) return;
    const key = weatherLocationKey(location);
    if (!force && key === this.loadedKey && (this.snapshot || this.request)) return this.request ?? undefined;
    this.loadedKey = key;
    this.loading = true;
    this.error = '';
    this.request = (async () => {
      try {
        this.snapshot = await fetchForecast(await resolveLocation(location));
      } catch (error) {
        this.snapshot = null;
        this.error = error instanceof Error ? error.message : String(error);
      } finally {
        this.loading = false;
        this.request = null;
      }
    })();
    return this.request;
  }

  dailyFor(date: string): DailyWeather | null {
    return this.snapshot?.daily.find((day) => day.date === date) ?? null;
  }
}

export const restaurantWeather = new RestaurantWeatherStore();
