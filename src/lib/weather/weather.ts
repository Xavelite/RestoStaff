export type WeatherLocationInput = {
  city: string;
  postalCode?: string;
  countryCode?: string;
  timezone?: string;
};

export type ResolvedWeatherLocation = {
  latitude: number;
  longitude: number;
  name: string;
  countryCode: string;
  timezone: string;
};

export type DailyWeather = {
  date: string;
  code: number;
  highC: number;
  lowC: number;
  rainChance: number;
};

export type RestaurantWeatherSnapshot = {
  location: ResolvedWeatherLocation;
  observedAt: string;
  temperatureC: number;
  apparentC: number;
  precipitationMm: number;
  windKph: number;
  code: number;
  isDay: boolean;
  nextRainChance: number;
  daily: DailyWeather[];
};

type WeatherImpact = {
  tone: 'calm' | 'watch' | 'risk';
  label: string;
  detail: string;
};

type OpenMeteoForecast = {
  current?: Record<string, unknown>;
  hourly?: Record<string, unknown>;
  daily?: Record<string, unknown>;
};

function finite(value: unknown, fallback = 0): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function numberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.map((item) => finite(item)) : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

export function weatherSymbol(code: number, isDay = true): string {
  if (code === 0) return isDay ? '☀' : '☾';
  if (code === 1) return isDay ? '🌤' : '☾';
  if (code === 2) return '⛅';
  if (code === 3) return '☁';
  if ([45, 48].includes(code)) return '≋';
  if ([51, 53, 55, 56, 57].includes(code)) return '☂';
  if ([61, 63, 65, 66, 67].includes(code)) return '☔';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return '❄';
  if ([80, 81, 82].includes(code)) return '☔';
  if ([95, 96, 99].includes(code)) return '⚡';
  return '◌';
}

export function weatherCondition(code: number): string {
  if (code === 0) return 'Clear';
  if (code === 1) return 'Mostly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if ([45, 48].includes(code)) return 'Fog';
  if ([51, 53, 55, 56, 57].includes(code)) return 'Drizzle';
  if ([61, 63, 65, 66, 67].includes(code)) return 'Rain';
  if ([71, 73, 75, 77].includes(code)) return 'Snow';
  if ([80, 81, 82, 85, 86].includes(code)) return 'Showers';
  if ([95, 96, 99].includes(code)) return 'Thunderstorm';
  return 'Mixed weather';
}

export function weatherImpact(snapshot: RestaurantWeatherSnapshot): WeatherImpact {
  if (snapshot.windKph >= 45) {
    return {
      tone: 'risk',
      label: 'Strong wind watch',
      detail: 'Secure outdoor service and keep arrivals flexible.'
    };
  }
  if (snapshot.nextRainChance >= 75 || snapshot.precipitationMm >= 1.5) {
    return {
      tone: 'risk',
      label: 'Rain likely',
      detail: 'Plan guest arrivals and outdoor seating around wet conditions.'
    };
  }
  if (snapshot.nextRainChance >= 45 || snapshot.precipitationMm > 0) {
    return {
      tone: 'watch',
      label: 'Rain watch',
      detail: 'Keep the terrace plan flexible through the next services.'
    };
  }
  if (snapshot.apparentC >= 30) {
    return {
      tone: 'watch',
      label: 'Heat watch',
      detail: 'Plan water, breaks and cooler stations for the team.'
    };
  }
  if (snapshot.apparentC <= 2) {
    return {
      tone: 'watch',
      label: 'Cold watch',
      detail: 'Allow for slower arrivals and cold outdoor conditions.'
    };
  }
  if (snapshot.windKph >= 30) {
    return {
      tone: 'watch',
      label: 'Wind watch',
      detail: 'Keep an eye on outdoor service and signage.'
    };
  }
  return {
    tone: 'calm',
    label: 'Weather looks service-friendly',
    detail: 'No meaningful weather pressure is expected for the next services.'
  };
}

export function parseOpenMeteoForecast(
  value: unknown,
  location: ResolvedWeatherLocation
): RestaurantWeatherSnapshot {
  const payload = (value && typeof value === 'object' ? value : {}) as OpenMeteoForecast;
  const current = payload.current ?? {};
  const hourly = payload.hourly ?? {};
  const daily = payload.daily ?? {};
  const hourlyTimes = stringArray(hourly.time);
  const rainChances = numberArray(hourly.precipitation_probability);
  const observedAt = String(current.time ?? '');
  const observedHour = observedAt.slice(0, 13);
  const currentIndex = Math.max(0, hourlyTimes.findIndex((time) => time.slice(0, 13) === observedHour));
  const nextRainChance = Math.max(0, ...rainChances.slice(currentIndex, currentIndex + 12));
  const dates = stringArray(daily.time);
  const codes = numberArray(daily.weather_code);
  const highs = numberArray(daily.temperature_2m_max);
  const lows = numberArray(daily.temperature_2m_min);
  const dailyRain = numberArray(daily.precipitation_probability_max);

  if (!observedAt || !dates.length) throw new Error('Weather provider returned an incomplete forecast.');

  return {
    location,
    observedAt,
    temperatureC: finite(current.temperature_2m),
    apparentC: finite(current.apparent_temperature),
    precipitationMm: finite(current.precipitation),
    windKph: finite(current.wind_speed_10m),
    code: finite(current.weather_code),
    isDay: finite(current.is_day, 1) === 1,
    nextRainChance,
    daily: dates.map((date, index) => ({
      date,
      code: codes[index] ?? 0,
      highC: highs[index] ?? 0,
      lowC: lows[index] ?? 0,
      rainChance: dailyRain[index] ?? 0
    }))
  };
}

export function weatherLocationKey(location: WeatherLocationInput): string {
  return [location.postalCode, location.city, location.countryCode]
    .map((part) => String(part ?? '').trim().toLowerCase())
    .filter(Boolean)
    .join('|');
}
