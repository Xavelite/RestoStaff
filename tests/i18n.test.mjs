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

test('messages interpolate operational values without losing unknown placeholders', () => {
  assert.equal(translate('fr', 'Ready until {time}', { time: '18:30' }), 'Ready until 18:30');
  assert.equal(translate('nl', '{count} services / week', { count: 9 }), '9 services / week');
  // An unmatched placeholder survives rather than collapsing to an empty string,
  // so a missing parameter is visible instead of silently blanking a sentence.
  assert.equal(translate('fr', 'Unknown {value}', {}), 'Unknown {value}');
});

test('notification templates interpolate dynamic employee events', () => {
  assert.equal(
    translate('fr', '{name} submitted availability', { name: 'Sarah' }),
    'Sarah submitted availability'
  );
  assert.equal(translate('nl', 'Week of {week}', { week: '2026-06-29' }), 'Week of 2026-06-29');
});

// The French and Dutch dictionaries were removed deliberately. The three tests
// that used to live here asserted per-key coverage, which now passes for every
// possible string and so guards nothing. What still needs guarding is that the
// dictionary does not quietly grow back: the previous one reached ~6,600 lines
// of incremental `Object.assign` blocks over a flat global key space, where a
// later block silently redefined an earlier key and changed visible meaning on
// unrelated pages.
test('the message layer stays dictionary-free until it is rebuilt deliberately', async () => {
  const source = readFileSync('src/lib/i18n/i18n.svelte.ts', 'utf8');

  assert.doesNotMatch(source, /Object\.assign\(/, 'incremental locale blocks are back');
  assert.ok(
    source.split('\n').length < 200,
    'the message layer grew a dictionary again; rebuild it namespaced instead'
  );

  // Locale is not stubbed: it still drives every date, time and number format.
  assert.equal(localeCode('fr'), 'fr-BE');
  assert.equal(hasTranslation('fr', 'anything at all'), true);
  assert.equal(translate('nl', 'Clock in'), 'Clock in');
});
