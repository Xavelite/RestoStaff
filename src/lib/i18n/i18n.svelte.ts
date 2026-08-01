/**
 * Message plumbing without a dictionary.
 *
 * The French and Dutch dictionaries were deleted deliberately: they had grown to
 * ~6,600 lines assembled through 122 incremental `Object.assign` calls over a
 * flat, global key space, where a later block silently redefined an earlier key.
 * `Clear` meant "Effacer" in one place and "Dégagé" in another; `Off` meant both
 * "Absent" and "Désactivé". Those are not typos, they are two different meanings
 * fighting over one English word, and no amount of coverage testing finds them
 * because every key did have *a* translation.
 *
 * So the seam stays and the content goes. Every `t('…')` call site is untouched,
 * which keeps the app translatable later without another sweep of 98 files, and
 * a rebuilt dictionary can arrive namespaced by domain with unique typed keys.
 *
 * Locale itself is NOT stubbed. `intlLocale` still drives every date, time and
 * number format in the product, so switching to French still yields Belgian
 * French dates — only the message text is English until the dictionary returns.
 */

export type AppLocale = 'en' | 'fr' | 'nl';
type TranslationParams = Record<string, string | number>;

const DEFAULT_LOCALE: AppLocale = 'en';
export const ACCOUNT_LOCALE_METADATA_KEY = 'preferred_language';

export const languageOptions: ReadonlyArray<{ value: AppLocale; label: string; nativeLabel: string }> = [
  { value: 'en', label: 'English', nativeLabel: 'English' },
  { value: 'fr', label: 'French', nativeLabel: 'Français' },
  { value: 'nl', label: 'Dutch', nativeLabel: 'Nederlands' }
];

export function normalizeLocale(value: unknown): AppLocale {
  if (typeof value !== 'string') return DEFAULT_LOCALE;
  const language = value.trim().toLowerCase().split(/[-_]/)[0];
  return language === 'fr' || language === 'nl' ? language : DEFAULT_LOCALE;
}

export function localeCode(locale: AppLocale): string {
  if (locale === 'fr') return 'fr-BE';
  if (locale === 'nl') return 'nl-BE';
  return 'en-GB';
}

function interpolate(message: string, params: TranslationParams): string {
  return message.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match
  );
}

/**
 * True for every message: the source string is itself the rendered text while
 * no dictionary exists. Kept so callers that branch on availability still work.
 */
export function hasTranslation(_locale: AppLocale, _message: string): boolean {
  return true;
}

export function translate(
  _locale: AppLocale,
  message: string,
  params: TranslationParams = {}
): string {
  return interpolate(message, params);
}

class I18nStore {
  locale = $state<AppLocale>(DEFAULT_LOCALE);

  get intlLocale(): string {
    return localeCode(this.locale);
  }

  setLocale(locale: unknown): void {
    const next = normalizeLocale(locale);
    if (this.locale !== next) this.locale = next;
  }

  t(message: string, params: TranslationParams = {}): string {
    return translate(this.locale, message, params);
  }
}

export const i18n = new I18nStore();

export function t(message: string, params: TranslationParams = {}): string {
  return i18n.t(message, params);
}
