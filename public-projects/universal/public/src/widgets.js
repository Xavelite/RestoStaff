import { icon } from "./icons.js";
import { escapeHTML as esc } from "./model.js";

const weatherCache = new Map();
const requests = new Set();
const timers = new Map();
let onTick = () => {};
export function setWidgetNotifier(fn) {
  onTick = fn;
}
export function weatherLabel(code) {
  if (code === 0) return "Clear skies";
  if (code < 4) return "Partly cloudy";
  if (code < 50) return "Misty";
  if (code < 70) return "Rainy";
  if (code < 80) return "Snowy";
  if (code < 90) return "Rain showers";
  return "Thunderstorms";
}
export function weatherIcon(code) {
  return code === 0 ? "sun" : code < 50 ? "cloud" : "rain";
}
function weatherKey(c) {
  return `${c.latitude},${c.longitude}`;
}
export async function refreshWeather(card, force = false) {
  const key = weatherKey(card);
  const cached = weatherCache.get(key);
  if (
    requests.has(key) ||
    (!force && cached && Date.now() - cached.fetched < 600000)
  )
    return;
  requests.add(key);
  try {
    const params = new URLSearchParams({
      latitude: card.latitude,
      longitude: card.longitude,
      current: "temperature_2m,weather_code",
      daily: "temperature_2m_max,temperature_2m_min",
      timezone: "auto",
      forecast_days: 1,
    });
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?${params}`,
      { signal: AbortSignal.timeout(12000) },
    );
    if (!res.ok) throw Error("Weather unavailable");
    const data = await res.json();
    if (!Number.isFinite(data.current?.temperature_2m))
      throw Error("Invalid forecast");
    weatherCache.set(key, {
      temperature: Math.round(data.current.temperature_2m),
      code: data.current.weather_code,
      high: Math.round(data.daily.temperature_2m_max[0]),
      low: Math.round(data.daily.temperature_2m_min[0]),
      fetched: Date.now(),
    });
  } catch {
    weatherCache.set(key, { ...cached, error: true, fetched: Date.now() });
  }
  requests.delete(key);
  onTick();
}
export async function findCities(query) {
  const res = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`,
    { signal: AbortSignal.timeout(10000) },
  );
  if (!res.ok) throw Error("City search is unavailable. Try again shortly.");
  const data = await res.json();
  return data.results || [];
}
export function timerState(card) {
  if (!timers.has(card.id))
    timers.set(card.id, {
      remaining: (card.minutes || 25) * 60,
      end: null,
      done: false,
    });
  const t = timers.get(card.id);
  if (t.end) {
    t.remaining = Math.max(0, Math.ceil((t.end - Date.now()) / 1000));
    if (t.remaining === 0) {
      t.end = null;
      t.done = true;
    }
  }
  return t;
}
export function toggleTimer(card) {
  const t = timerState(card);
  if (t.end) {
    t.end = null;
  } else {
    if (t.remaining === 0) t.remaining = (card.minutes || 25) * 60;
    t.done = false;
    t.end = Date.now() + t.remaining * 1000;
  }
  onTick();
}
export function resetTimer(card) {
  timers.delete(card.id);
  onTick();
}
export function clearTimers() {
  timers.clear();
}
export function widgetBody(card) {
  if (card.widget === "clock")
    return `<div class="widget-eyebrow">${icon("clock")}<span>${esc(card.title || "Local time")}</span><span class="live-dot"></span></div><div class="clock-time" data-clock="${esc(card.id)}">${clockTime(card)}</div><div class="widget-foot"><span>${esc(card.timezone.split("/").pop().replaceAll("_", " "))}</span><span data-clock-date="${esc(card.id)}">${clockDate(card)}</span></div><div class="clock-decoration" aria-hidden="true"></div>`;
  if (card.widget === "weather") return weatherBody(card);
  if (card.widget === "note")
    return `<div class="widget-eyebrow">${icon("note")}<span>${esc(card.title)}</span></div><textarea class="quick-note" data-note="${esc(card.id)}" maxlength="10000" spellcheck="false" placeholder="A thought worth keeping…" aria-label="${esc(card.title)}">${esc(card.note)}</textarea><div class="widget-foot"><span data-note-status="${esc(card.id)}">Saved as you write</span>${icon("edit")}</div>`;
  return `<div class="widget-eyebrow">${icon("timer")}<span>${esc(card.title)}</span></div><div class="focus-timer" data-timer="${esc(card.id)}">${timerText(card)}</div><div class="focus-bottom"><span data-timer-label="${esc(card.id)}">${timerLabel(card)}</span><div class="focus-controls"><button class="icon-btn" data-action="reset-timer" data-id="${esc(card.id)}" title="Reset timer" aria-label="Reset ${esc(card.title)}">${icon("reset")}</button><button class="timer-start" data-action="toggle-timer" data-id="${esc(card.id)}" aria-label="Start ${esc(card.title)}">${icon("play")}</button></div></div>`;
}
export function weatherBody(c) {
  const w = weatherCache.get(weatherKey(c));
  return `<div class="widget-eyebrow">${icon("globe")}<span>${esc(c.city)}</span><span class="live-dot ${w?.error ? "offline" : ""}" title="${w?.error ? "Weather unavailable" : "Live weather"}"></span></div><div class="weather-main"><div><div class="weather-temp">${w?.temperature != null ? `${w.temperature}<sup>°</sup>` : '<span class="weather-loading">—°</span>'}</div><span class="weather-condition">${w?.temperature != null ? weatherLabel(w.code) : w?.error ? "Weather unavailable" : "Checking the skies…"}</span></div><div class="weather-symbol">${icon(w?.temperature != null ? weatherIcon(w.code) : "cloud")}</div></div><div class="widget-foot"><span>${w?.temperature != null ? `H: ${w.high}° &nbsp; L: ${w.low}°` : "Current temperature"}</span>${w?.error ? `<button class="text-btn" data-action="retry-weather" data-id="${esc(c.id)}">Retry</button>` : '<a href="https://open-meteo.com/" target="_blank" rel="noopener" title="Weather data by Open-Meteo">Open-Meteo ↗</a>'}</div>`;
}
export function clockTime(c) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: c.timezone,
  }).format(new Date());
}
export function clockDate(c) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: c.timezone,
  }).format(new Date());
}
export function timerText(c) {
  const t = timerState(c);
  return `${String(Math.floor(t.remaining / 60)).padStart(2, "0")}:${String(t.remaining % 60).padStart(2, "0")}`;
}
export function timerLabel(c) {
  const t = timerState(c);
  return t.done
    ? "Nice work. Take a breath."
    : t.end
      ? "One thing at a time."
      : t.remaining < (c.minutes || 25) * 60
        ? "Ready when you are."
        : "A little time, just for this.";
}
