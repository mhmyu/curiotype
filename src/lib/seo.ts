import { DEFAULT_LANGUAGE, LANGUAGES, LOCALE_TAGS } from '@/i18n/config';
import type { Language } from '@/i18n/config';
import { getLocalePath } from '@/i18n';

/** Open Graph image size in pixels (the images themselves are generated in T13). */
export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const;

/** Absolute URL of a localized page, e.g. localeUrl(site, 'en', 'settings'). */
export function localeUrl(site: URL | string, lang: Language, path = ''): string {
  return new URL(getLocalePath(lang, path), site).href;
}

/** Absolute URL of the Open Graph image of a language. */
export function ogImageUrl(site: URL | string, lang: Language): string {
  return new URL(`/og/${lang}.png`, site).href;
}

export interface AlternateLink {
  /** Value of the `hreflang` attribute: a locale tag or `x-default`. */
  hreflang: string;
  href: string;
}

/**
 * `hreflang` alternates for one page in every language, plus `x-default` (the default
 * language), so search engines can pick the right version.
 */
export function buildAlternates(site: URL | string, path = ''): AlternateLink[] {
  const links = LANGUAGES.map((lang) => ({
    hreflang: LOCALE_TAGS[lang],
    href: localeUrl(site, lang, path),
  }));
  links.push({ hreflang: 'x-default', href: localeUrl(site, DEFAULT_LANGUAGE, path) });
  return links;
}

export interface WebApplicationInput {
  site: URL | string;
  lang: Language;
  name: string;
  description: string;
}

/** schema.org `WebApplication` description of the home page of one language. */
export function buildWebApplicationJsonLd(input: WebApplicationInput): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: input.name,
    description: input.description,
    url: localeUrl(input.site, input.lang),
    inLanguage: LOCALE_TAGS[input.lang],
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Any',
    browserRequirements: 'Requires JavaScript',
    isAccessibleForFree: true,
  };
}

/**
 * Serializes JSON-LD for an inline `<script type="application/ld+json">`. The characters
 * `<`, `>` and `&` and the two JavaScript line separators are escaped, so a value can
 * never end the script element early.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** Content of `robots.txt`: everything is allowed; the sitemap line needs the public origin. */
export function buildRobotsTxt(site: URL | string | undefined): string {
  const lines = ['User-agent: *', 'Allow: /'];
  if (site) lines.push('', `Sitemap: ${new URL('sitemap-index.xml', site).href}`);
  return `${lines.join('\n')}\n`;
}
