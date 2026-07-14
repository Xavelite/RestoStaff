import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseOpenMeteoForecast,
  weatherCondition,
  weatherImpact,
  weatherLocationKey,
  weatherSymbol
} from '../src/lib/weather/weather.ts';

const location = {
  latitude: 50.85,
  longitude: 4.35,
  name: 'Brussels',
  countryCode: 'BE',
  timezone: 'Europe/Brussels'
};

function forecast(overrides = {}) {
  return parseOpenMeteoForecast(
    {
      current: {
        time: '2026-07-14T12:00',
        temperature_2m: 22.4,
        apparent_temperature: 23.1,
        precipitation: 0,
        weather_code: 2,
        wind_speed_10m: 14,
        is_day: 1,
        ...overrides
      },
      hourly: {
        time: ['2026-07-14T11:00', '2026-07-14T12:00', '2026-07-14T13:00', '2026-07-14T14:00'],
        precipitation_probability: [10, 20, 65, 30]
      },
      daily: {
        time: ['2026-07-14', '2026-07-15'],
        weather_code: [2, 61],
        temperature_2m_max: [25.2, 20.1],
        temperature_2m_min: [16.4, 14.8],
        precipitation_probability_max: [65, 80]
      }
    },
    location
  );
}

test('weather forecast parsing keeps current and daily calendar evidence together', () => {
  const snapshot = forecast();
  assert.equal(snapshot.location.name, 'Brussels');
  assert.equal(snapshot.nextRainChance, 65);
  assert.deepEqual(snapshot.daily[0], {
    date: '2026-07-14',
    code: 2,
    highC: 25.2,
    lowC: 16.4,
    rainChance: 65
  });
});

test('weather codes and service impact stay deterministic', () => {
  assert.equal(weatherCondition(2), 'Partly cloudy');
  assert.equal(weatherSymbol(95), '⚡');
  assert.equal(weatherImpact(forecast()).tone, 'watch');
  assert.equal(weatherImpact(forecast({ wind_speed_10m: 50 })).label, 'Strong wind watch');
});

test('weather cache identity follows restaurant location rather than display casing', () => {
  assert.equal(
    weatherLocationKey({ city: ' Brussels ', postalCode: '1000', countryCode: 'BE' }),
    '1000|brussels|be'
  );
});
