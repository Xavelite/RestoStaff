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
