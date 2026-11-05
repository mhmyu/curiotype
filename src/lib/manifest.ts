import { MANIFEST_ICONS, THEME_COLOR_LIGHT } from '@/config/pwa';
import type { ManifestIcon } from '@/config/pwa';
import { LOCALE_TAGS } from '@/i18n/config';
import type { Language } from '@/i18n/config';

/** Web app manifest of one interface language (the install prompt reads the one linked from the page). */
export interface WebManifest {
  id: string;
  name: string;
  short_name: string;
  description: string;
  lang: string;
  start_url: string;
  scope: string;
  display: 'standalone';
  theme_color: string;
  background_color: string;
  icons: ManifestIcon[];
}

/** Path of the manifest of a language, e.g. `/en/manifest.webmanifest`. */
export function getManifestPath(lang: Language): string {
  return `/${lang}/manifest.webmanifest`;
}

/**
 * Builds the manifest of a language. Each language has its own, so an app installed from `/en/`
 * opens `/en/` (a single manifest with `start_url: "/"` would always open the default language).
 * The scope is the whole site, so the language switcher and every page stay inside the app.
 */
export function buildManifest(options: {
  lang: Language;
  name: string;
  description: string;
}): WebManifest {
  const { lang, name, description } = options;
  const home = `/${lang}/`;
  return {
    id: home,
    name,
    short_name: name,
    description,
    lang: LOCALE_TAGS[lang],
    start_url: home,
    scope: '/',
    display: 'standalone',
    theme_color: THEME_COLOR_LIGHT,
    background_color: THEME_COLOR_LIGHT,
    icons: MANIFEST_ICONS.map((icon) => ({ ...icon })),
  };
}
