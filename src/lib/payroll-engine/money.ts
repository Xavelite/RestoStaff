export type MoneyCents = bigint;

export function cents(value: string | number | bigint | null | undefined): MoneyCents {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new RangeError('Money cents must be a safe integer.');
    return BigInt(value);
  }
  const normalized = String(value ?? '').trim();
  if (!/^-?\d+$/.test(normalized)) return 0n;
  return BigInt(normalized);
}

export function parseEuroCents(input: string): MoneyCents | null {
  const normalized = input.trim().replace(',', '.');
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(normalized);
  if (!match) return null;
  return BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
}

export function parseHourlyRate(input: string): string | null {
  const normalized = input.trim().replace(',', '.');
  const match = /^(\d+)(?:\.(\d{0,4}))?$/.exec(normalized);
  if (!match) return null;
  return `${match[1]}.${(match[2] ?? '').padEnd(4, '0')}`;
}

export function multiplyBasisPoints(amount: MoneyCents, basisPoints: number): MoneyCents {
  if (!Number.isSafeInteger(basisPoints)) throw new RangeError('Basis points must be an integer.');
  const numerator = amount * BigInt(basisPoints);
  return (numerator + 5000n) / 10000n;
}

export function amountForMinutes(minutes: number, hourlyRateTenThousandths: bigint): MoneyCents {
  if (!Number.isSafeInteger(minutes) || minutes < 0) throw new RangeError('Minutes must be a non-negative integer.');
  // hourlyRateTenThousandths is EUR * 10,000. Divide by 60 and by 100 to
  // produce cents, adding half the denominator for deterministic half-up rounding.
  const numerator = BigInt(minutes) * hourlyRateTenThousandths;
  return (numerator + 3000n) / 6000n;
}

export function formatCents(value: string | number | bigint, locale = 'en-GB'): string {
  const amount = cents(value);
  const negative = amount < 0n;
  const absolute = negative ? -amount : amount;
  const whole = absolute / 100n;
  const fraction = String(absolute % 100n).padStart(2, '0');
  const commaDecimal = locale.startsWith('fr') || locale.startsWith('nl');
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, commaDecimal ? '.' : ',');
  return `${negative ? '-' : ''}€${grouped}${commaDecimal ? ',' : '.'}${fraction}`;
}

