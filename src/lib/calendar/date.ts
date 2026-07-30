export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const DEFAULT_SERVICE_KEYS = ['lunch', 'evening'] as const;
export type ServiceKey = string;

export type ServicePeriod = {
  service_key: string;
  name: string;
  active: boolean;
  sort_order: number;
  metadata?: unknown;
};

const SERVICE_DISPLAY: Record<string, { label: string; icon: string }> = {
  lunch: { label: 'Lunch', icon: '☀' },
  evening: { label: 'Evening', icon: '☾' }
};

const DEFAULT_PERIODS: ServicePeriod[] = [
  {
    service_key: 'lunch',
    name: 'Lunch',
    active: true,
    sort_order: 0,
    metadata: { default_start: '12:00', default_end: '15:00' }
  },
  {
    service_key: 'evening',
    name: 'Evening',
    active: true,
    sort_order: 1,
    metadata: { default_start: '18:00', default_end: '23:00' }
  }
];

function metadataClock(metadata: unknown, key: 'default_start' | 'default_end'): string {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return '';
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === 'string' && /^\d{2}:\d{2}/.test(value) ? value.slice(0, 5) : '';
}

export function activeServicePeriods(
  services: readonly ServicePeriod[] | null | undefined
): ServicePeriod[] {
  const configured = (services ?? [])
    .filter((service) => service.active && service.service_key.trim())
    .sort((left, right) =>
      left.sort_order - right.sort_order ||
      left.name.localeCompare(right.name)
    );
  return configured.length ? configured : DEFAULT_PERIODS.map((service) => ({ ...service }));
}

export function configuredServiceKeys(
  services: readonly ServicePeriod[] | null | undefined
): ServiceKey[] {
  const configured = (services ?? [])
    .filter((service) => service.service_key.trim())
    .sort((left, right) =>
      left.sort_order - right.sort_order ||
      left.name.localeCompare(right.name)
    )
    .map((service) => service.service_key);
  return configured.length ? configured : [...DEFAULT_SERVICE_KEYS];
}

export function activeServiceKeys(
  services: readonly ServicePeriod[] | null | undefined
): ServiceKey[] {
  return activeServicePeriods(services).map((service) => service.service_key);
}

/**
 * Active services define new work. Inactive services return only when the
 * period still contains a shift, badge entry or other durable evidence for
 * them, so archiving configuration never hides operational history.
 */
export function serviceKeysWithEvidence(
  services: readonly ServicePeriod[] | null | undefined,
  evidenceKeys: Iterable<string>
): ServiceKey[] {
  const visible = new Set(activeServiceKeys(services));
  for (const key of evidenceKeys) {
    if (key.trim()) visible.add(key);
  }
  const configured = configuredServiceKeys(services);
  const ordered = configured.filter((key) => visible.has(key));
  const configuredSet = new Set(configured);
  const unknown = [...visible]
    .filter((key) => !configuredSet.has(key))
    .sort((left, right) => left.localeCompare(right));
  return [...ordered, ...unknown];
}

export function serviceDefaultHours(
  serviceKey: ServiceKey,
  services?: readonly ServicePeriod[] | null
): { start: string; end: string } {
  const service = services?.find((item) => item.service_key === serviceKey);
  const start = metadataClock(service?.metadata, 'default_start');
  const end = metadataClock(service?.metadata, 'default_end');
  if (start && end) return { start, end };
  if (serviceKey === 'lunch') return { start: '12:00', end: '15:00' };
  if (serviceKey === 'evening') return { start: '18:00', end: '23:00' };
  return { start: '09:00', end: '17:00' };
}

export function serviceDisplay(
  serviceKey: ServiceKey,
  services?: readonly ServicePeriod[] | null
): { label: string; icon: string } {
  const configured = services?.find((service) => service.service_key === serviceKey);
  const fallback = SERVICE_DISPLAY[serviceKey];
  const start = serviceDefaultHours(serviceKey, services).start;
  return {
    label: configured?.name || fallback?.label || humanizeServiceKey(serviceKey),
    icon: fallback?.icon ?? (start < '16:00' ? '☀' : '☾')
  };
}

function humanizeServiceKey(serviceKey: string): string {
  const label = serviceKey.trim().replace(/[-_]+/g, ' ');
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : 'Service';
}

export function serviceLabel(
  serviceKey: string,
  services?: readonly ServicePeriod[] | null
): string {
  return serviceDisplay(serviceKey, services).label;
}

const DAY_MS = 86_400_000;

function isoDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00Z`);
  return date.toISOString().slice(0, 10);
}

export function addDays(value: string, amount: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return isoDate(date);
}

export function mondayFor(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  return addDays(value, -((date.getUTCDay() + 6) % 7));
}

export function weekday(value: string): number {
  const day = new Date(`${value}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

export function dateForWeekday(weekStart: string, weekdayNumber: number): string {
  return addDays(weekStart, weekdayNumber - 1);
}

export function monthStart(value: string): string {
  return `${value.slice(0, 7)}-01`;
}

export function addMonths(value: string, amount: number): string {
  const date = new Date(`${monthStart(value)}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return isoDate(date);
}

export function monthDates(value: string): string[] {
  const first = monthStart(value);
  const start = mondayFor(first);
  const month = new Date(`${first}T00:00:00Z`).getUTCMonth();
  const dates: string[] = [];
  for (let index = 0; index < 42; index += 1) dates.push(addDays(start, index));
  const lastWeek = dates.slice(-7);
  return lastWeek.every(
    (date) => new Date(`${date}T00:00:00Z`).getUTCMonth() !== month
  )
    ? dates.slice(0, 35)
    : dates;
}

export function isSameMonth(date: string, monthReference: string): boolean {
  return date.slice(0, 7) === monthReference.slice(0, 7);
}

export function monthLabel(value: string, locale = 'en-GB'): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(`${monthStart(value)}T00:00:00Z`));
}

export function weekdayLabel(value: string, locale = 'en-GB'): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    timeZone: 'UTC'
  }).format(new Date(`${value}T00:00:00Z`));
}

export function weekdayDateLabel(value: string, locale = 'en-GB'): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(`${value}T00:00:00Z`));
}

export function weekLabel(weekStart: string, locale = 'en-GB'): string {
  const start = new Date(`${weekStart}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return '';
  const formatter = new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC'
  });
  return `${formatter.format(start)} – ${formatter.format(new Date(start.getTime() + 6 * DAY_MS))}`;
}

export function todayInTimezone(timezone: string, now = new Date()): string {
  return localDateTimeParts(now, timezone).date;
}

export function localDateTimeParts(
  now: Date,
  timezone: string
): { date: string; minutes: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    })
      .formatToParts(now)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute)
  };
}

export function greetingForMinutes(minutes: number): string {
  if (minutes < 12 * 60) return 'Good morning';
  if (minutes < 18 * 60) return 'Good afternoon';
  return 'Good evening';
}

export function clockMinutes(value: string | null | undefined): number | null {
  const match = String(value ?? '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59
    ? hours * 60 + minutes
    : null;
}

export function clockLabel(value: string | null | undefined): string {
  const minutes = clockMinutes(value);
  return minutes === null
    ? ''
    : `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function hoursBetweenClocks(
  start: string | null | undefined,
  end: string | null | undefined
): number {
  const from = clockMinutes(start);
  const to = clockMinutes(end);
  if (from === null || to === null) return 0;
  return (to >= from ? to - from : to + 1440 - from) / 60;
}

export function hoursBetweenInstants(
  start: string | null | undefined,
  end: string | null | undefined
): number {
  if (!start || !end) return 0;
  const duration = new Date(end).getTime() - new Date(start).getTime();
  return Number.isFinite(duration) && duration > 0 ? duration / 3_600_000 : 0;
}

export function formatHours(value: number): string {
  const minutes = Math.max(0, Math.round(value * 60));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder
    ? `${hours}h${String(remainder).padStart(2, '0')}`
    : `${hours}h`;
}

export function instantToLocalInput(
  value: string | null | undefined,
  timezone: string
): string {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    })
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function localInputToInstant(value: string, timezone: string): string {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/
  );
  if (!match) return '';
  const desiredUtc = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5])
  );
  let candidate = desiredUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
      })
        .formatToParts(new Date(candidate))
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value])
    );
    const representedUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute)
    );
    candidate += desiredUtc - representedUtc;
  }
  return new Date(candidate).toISOString();
}
