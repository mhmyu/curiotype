/** Single source of truth for supported site languages. */
export const LANGUAGES = ['id', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = 'id';

/**
 * Language of the sentences being typed: the name of a folder under
 * `src/content/sentences/` (see `lib/content-langs.ts`). It is separate from the
 * interface language (the URL segment): a user can read the interface in one
 * language and type sentences in another, so it is a plain string, not `Language`.
 */
export type ContentLang = string;

/** Language names written in their own language (used by the language switcher). */
export const LANGUAGE_NAMES: Record<Language, string> = {
  id: 'Bahasa Indonesia',
  en: 'English',
};

/**
 * Locale tags used in `hreflang` links and the sitemap (BCP 47: language-REGION).
 * The URL segment stays the short code (`/id/`, `/en/`).
 */
export const LOCALE_TAGS: Record<Language, string> = {
  id: 'id-ID',
  en: 'en-US',
};

/** Open Graph writes locales with an underscore: `id_ID`, `en_US`. */
export function getOgLocale(lang: Language): string {
  return LOCALE_TAGS[lang].replace('-', '_');
}
