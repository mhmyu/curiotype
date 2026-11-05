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
