import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

globalThis.$state = (value) => value;

const {
  ACCOUNT_LOCALE_METADATA_KEY,
  hasTranslation,
  localeCode,
  normalizeLocale,
  translate
} = await import('../src/lib/i18n/i18n.svelte.ts');

test('account locale normalization keeps English as the explicit fallback', () => {
  assert.equal(ACCOUNT_LOCALE_METADATA_KEY, 'preferred_language');
  assert.equal(normalizeLocale(undefined), 'en');
  assert.equal(normalizeLocale('fr-BE'), 'fr');
  assert.equal(normalizeLocale('nl_BE'), 'nl');
  assert.equal(normalizeLocale('de'), 'en');
  assert.equal(localeCode('en'), 'en-GB');
  assert.equal(localeCode('fr'), 'fr-BE');
  assert.equal(localeCode('nl'), 'nl-BE');
});

test('translations interpolate operational values without losing unknown placeholders', () => {
  assert.equal(translate('fr', 'Ready until {time}', { time: '18:30' }), "Prêt jusqu'à 18:30");
  assert.equal(translate('nl', '{count} services / week', { count: 9 }), '9 diensten / week');
  assert.equal(translate('fr', 'Unknown {value}', {}), 'Unknown {value}');
});

test('notification templates localize dynamic employee events', () => {
  assert.equal(
    translate('fr', '{name} submitted availability', { name: 'Sarah' }),
    'Sarah a envoyé ses disponibilités'
  );
  assert.equal(translate('nl', 'Week of {week}', { week: '2026-06-29' }), 'Week van 2026-06-29');
});

test('dynamic request and service-slot states are localized', () => {
  const dynamicLabels = [
    'rejected',
    'cancelled',
    'No activity',
    'Available',
    'Partly available',
    'Unavailable',
    'Leave pending',
    'Time off',
    'Change pending',
    'Schedule change',
    'Scheduled',
    'Missing badge',
    'Working now',
    'Worked',
    'Corrected',
    'Conflict',
    'submitted',
    'draft',
    'not submitted',
    'Pending submission',
    'Time off draft',
    'Pending request',
    'Tap the shift to request time off.',
    'No planned shift.',
    'Availability is maintained by your manager.',
    'Past availability is read-only.',
    'Availability is locked once the week is published.',
    'Worked time cannot be replaced by availability.',
    'Approved leave already covers this service.',
    'An approved schedule change covers this service.',
    'Past services are read-only.',
    'Worked time cannot be changed through employee self-service.',
    'A time-off request is already pending for this service.',
    'An approved schedule change already covers this service.',
    'A schedule change is already pending for this service.',
    'You can only request time off on a scheduled shift.',
    'Fixed-schedule employees request time off from planned shifts.'
  ];

  for (const locale of ['fr', 'nl']) {
    for (const message of dynamicLabels) assert.equal(hasTranslation(locale, message), true, `${locale}: ${message}`);
  }
});

test('critical account and workflow vocabulary exists in both added languages', () => {
  const critical = [
    'Account settings',
    'Language',
    'Schedule',
    'Timesheet',
    'My service',
    'My time',
    'Who are you?',
    'Clock in',
    'Request time off',
    'Ready for payroll approval.',
    'Restaurant setup saved.',
    'Partly cloudy',
    'Rain',
    'Strong wind watch',
    'Rain likely',
    'Rain watch',
    'Heat watch',
    'Cold watch',
    'Wind watch',
    'Weather looks service-friendly'
  ];

  for (const locale of ['fr', 'nl']) {
    for (const message of critical) assert.equal(hasTranslation(locale, message), true, `${locale}: ${message}`);
  }
});

test('every literal translation call has French and Dutch coverage', () => {
  function sourceFiles(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory() ? sourceFiles(target) : [target];
    });
  }

  const keys = new Set();
  for (const file of sourceFiles('src').filter((name) => /\.(svelte|ts)$/.test(name))) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\bt\(\s*(['"])((?:\\.|(?!\1).)*)\1/g)) {
      keys.add(match[2].replaceAll("\\'", "'").replaceAll('\\"', '"'));
    }
  }

  for (const locale of ['fr', 'nl']) {
    const missing = [...keys].filter((message) => !hasTranslation(locale, message));
    assert.deepEqual(missing, [], `${locale} is missing: ${missing.join(', ')}`);
  }
});
