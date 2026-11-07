/**
 * Constants of the installable app (T30). Colors are the design `background` values
 * (`styles/tokens.css`); `lib/manifest.test.ts` checks that they still match the tokens.
 */

/** Where the service worker is served from: the site root, so its scope is the whole site. */
export const SERVICE_WORKER_URL = '/sw.js';

/** Browser UI color in the light and the dark color scheme (also the splash background). */
export const THEME_COLOR_LIGHT = '#ddf4ff';
export const THEME_COLOR_DARK = '#0f1c26';

export interface ManifestIcon {
  /** Path inside `public/`, with the leading slash. */
  src: string;
  sizes: string;
  type: 'image/png';
  purpose?: 'any' | 'maskable';
}

/** Icons made by `scripts/generate-assets.mjs` (T13). */
export const MANIFEST_ICONS: readonly ManifestIcon[] = [
  { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
];

/** Store category of the app (the install dialogs of some browsers group apps by it). */
export const MANIFEST_CATEGORIES: readonly string[] = ['education'];

export type ScreenshotFormFactor = 'narrow' | 'wide';

/** Pixel size of the install-dialog screenshots: a phone and a desktop window. */
export const SCREENSHOT_SIZES: Record<ScreenshotFormFactor, { width: number; height: number }> = {
  narrow: { width: 390, height: 844 },
  wide: { width: 1280, height: 720 },
};

/** Path of a screenshot inside `public/`, made by `scripts/generate-manifest-screenshots.mjs`. */
export function getScreenshotPath(lang: string, formFactor: ScreenshotFormFactor): string {
  return `/screenshots/home-${lang}-${formFactor}.png`;
}
