import {
  MANIFEST_CATEGORIES,
  MANIFEST_ICONS,
  SCREENSHOT_SIZES,
  THEME_COLOR_LIGHT,
  getScreenshotPath,
} from '@/config/pwa';
import type { ManifestIcon, ScreenshotFormFactor } from '@/config/pwa';
import { LOCALE_TAGS } from '@/i18n/config';
import type { Language } from '@/i18n/config';

export interface ManifestShortcut {
  name: string;
  url: string;
  icons: ManifestIcon[];
}

export interface ManifestScreenshot {
  src: string;
  sizes: string;
  type: 'image/png';
  form_factor: ScreenshotFormFactor;
  label: string;
}

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
  categories: string[];
  icons: ManifestIcon[];
  shortcuts: ManifestShortcut[];
  screenshots: ManifestScreenshot[];
}

/** The words of a manifest that depend on the language (from the dictionary). */
export interface ManifestText {
  statsName: string;
  collectionName: string;
  screenshotNarrow: string;
  screenshotWide: string;
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
  /** Names of the shortcuts and the descriptions of the screenshots, in this language. */
  text: ManifestText;
}): WebManifest {
  const { lang, name, description, text } = options;
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
    categories: [...MANIFEST_CATEGORIES],
    icons: MANIFEST_ICONS.map((icon) => ({ ...icon })),
    // Long-press the installed app icon to jump to a page. Both pages work without the home page.
    shortcuts: [
      { name: text.statsName, url: `/${lang}/stats/`, icons: [shortcutIcon()] },
      { name: text.collectionName, url: `/${lang}/collection/`, icons: [shortcutIcon()] },
    ],
    screenshots: (['narrow', 'wide'] as const).map((formFactor) => {
      const { width, height } = SCREENSHOT_SIZES[formFactor];
      return {
        src: getScreenshotPath(lang, formFactor),
        sizes: `${width}x${height}`,
        type: 'image/png' as const,
        form_factor: formFactor,
        label: formFactor === 'narrow' ? text.screenshotNarrow : text.screenshotWide,
      };
    }),
  };
}

/** Shortcut icon: the regular 192px app icon (shortcuts must not use the maskable one). */
function shortcutIcon(): ManifestIcon {
  const icon = MANIFEST_ICONS.find((candidate) => candidate.sizes === '192x192' && candidate.purpose === 'any');
  if (!icon) throw new Error('MANIFEST_ICONS needs a regular 192x192 icon for the shortcuts.');
  return { ...icon };
}
