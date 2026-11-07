import { existsSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MANIFEST_CATEGORIES,
  MANIFEST_ICONS,
  SCREENSHOT_SIZES,
  SERVICE_WORKER_URL,
  THEME_COLOR_DARK,
  THEME_COLOR_LIGHT,
  getScreenshotPath,
} from '@/config/pwa';
import { LANGUAGES, LOCALE_TAGS } from '@/i18n/config';
import { getDictionary } from '@/i18n';
import { buildManifest, getManifestPath } from './manifest';
import type { ManifestText } from './manifest';

const text: ManifestText = {
  statsName: 's',
  collectionName: 'c',
  screenshotNarrow: 'n',
  screenshotWide: 'w',
};

function manifestOf(lang: (typeof LANGUAGES)[number]) {
  const ui = getDictionary(lang);
  return buildManifest({
    lang,
    name: ui.meta.siteName,
    description: ui.meta.description,
    text: {
      statsName: ui.nav.stats,
      collectionName: ui.nav.collection,
      screenshotNarrow: ui.pwa.screenshotNarrow,
      screenshotWide: ui.pwa.screenshotWide,
    },
  });
}

/** Width and height from the IHDR chunk of a PNG file. */
function pngSize(path: string): { width: number; height: number } {
  const data = readFileSync(path);
  expect(data.subarray(1, 4).toString('ascii')).toBe('PNG');
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

const tokens = readFileSync('src/styles/tokens.css', 'utf8');

describe('buildManifest', () => {
  it.each(LANGUAGES)('opens the %s home page and keeps the whole site in scope', (lang) => {
    const ui = getDictionary(lang);
    const manifest = manifestOf(lang);
    expect(manifest.start_url).toBe(`/${lang}/`);
    expect(manifest.id).toBe(`/${lang}/`);
    expect(manifest.scope).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.lang).toBe(LOCALE_TAGS[lang]);
    expect(manifest.name).toBe(ui.meta.siteName);
    expect(manifest.short_name).toBe(ui.meta.siteName);
    expect(manifest.description).toBe(ui.meta.description);
  });

  it('uses the design background for the theme and the splash screen', () => {
    const manifest = buildManifest({ lang: 'id', name: 'x', description: 'y', text });
    expect(manifest.theme_color).toBe(THEME_COLOR_LIGHT);
    expect(manifest.background_color).toBe(THEME_COLOR_LIGHT);
  });

  it('does not share the icon list with the module constant', () => {
    const manifest = buildManifest({ lang: 'id', name: 'x', description: 'y', text });
    manifest.icons[0].sizes = '1x1';
    expect(MANIFEST_ICONS[0].sizes).toBe('192x192');
  });

  it('lists a regular and a maskable icon, and every file exists', () => {
    const purposes = MANIFEST_ICONS.map((icon) => icon.purpose);
    expect(purposes).toContain('any');
    expect(purposes).toContain('maskable');
    expect(MANIFEST_ICONS.some((icon) => icon.sizes === '192x192')).toBe(true);
    expect(MANIFEST_ICONS.some((icon) => icon.sizes === '512x512')).toBe(true);
    for (const icon of MANIFEST_ICONS) expect(existsSync(`public${icon.src}`)).toBe(true);
  });
});

describe('buildManifest: categories, shortcuts, screenshots', () => {
  it('is an education app', () => {
    expect(MANIFEST_CATEGORIES).toEqual(['education']);
    expect(manifestOf('id').categories).toEqual(['education']);
  });

  it.each(LANGUAGES)('has Statistics and Collection shortcuts inside the %s pages', (lang) => {
    const ui = getDictionary(lang);
    const { shortcuts, scope } = manifestOf(lang);
    expect(shortcuts.map((shortcut) => shortcut.name)).toEqual([ui.nav.stats, ui.nav.collection]);
    expect(shortcuts.map((shortcut) => shortcut.url)).toEqual([`/${lang}/stats/`, `/${lang}/collection/`]);
    for (const shortcut of shortcuts) {
      expect(shortcut.url.startsWith(scope)).toBe(true);
      expect(shortcut.icons.length).toBeGreaterThan(0);
      for (const icon of shortcut.icons) {
        expect(icon.purpose).not.toBe('maskable');
        expect(existsSync(`public${icon.src}`)).toBe(true);
      }
    }
  });

  it.each(LANGUAGES)('has a narrow and a wide %s screenshot whose files have the declared size', (lang) => {
    const ui = getDictionary(lang);
    const { screenshots } = manifestOf(lang);
    expect(screenshots.map((shot) => shot.form_factor)).toEqual(['narrow', 'wide']);
    expect(screenshots.map((shot) => shot.label)).toEqual([ui.pwa.screenshotNarrow, ui.pwa.screenshotWide]);
    for (const shot of screenshots) {
      const { width, height } = SCREENSHOT_SIZES[shot.form_factor];
      expect(shot.src).toBe(getScreenshotPath(lang, shot.form_factor));
      expect(shot.sizes).toBe(`${width}x${height}`);
      expect(shot.type).toBe('image/png');
      expect(existsSync(`public${shot.src}`)).toBe(true);
      expect(pngSize(`public${shot.src}`)).toEqual({ width, height });
      expect(statSync(`public${shot.src}`).size).toBeLessThan(300_000);
    }
  });

  it('keeps the narrow screenshot portrait and the wide one landscape', () => {
    expect(SCREENSHOT_SIZES.narrow.height).toBeGreaterThan(SCREENSHOT_SIZES.narrow.width);
    expect(SCREENSHOT_SIZES.wide.width).toBeGreaterThan(SCREENSHOT_SIZES.wide.height);
  });
});

describe('getManifestPath', () => {
  it('is one file per language', () => {
    expect(getManifestPath('en')).toBe('/en/manifest.webmanifest');
    expect(getManifestPath('id')).toBe('/id/manifest.webmanifest');
  });
});

describe('PWA colors', () => {
  it('match the light and dark `background` tokens', () => {
    const light = /:root\s*\{[^}]*--background:\s*(#[0-9a-f]{6})/i.exec(tokens)?.[1];
    const dark = /prefers-color-scheme:\s*dark\)\s*\{\s*:root:not\(\[data-theme='light'\]\)\s*\{[^}]*--background:\s*(#[0-9a-f]{6})/i.exec(
      tokens,
    )?.[1];
    expect(THEME_COLOR_LIGHT).toBe(light);
    expect(THEME_COLOR_DARK).toBe(dark);
  });

  it('serves the worker from the site root, so its scope is the whole site', () => {
    expect(SERVICE_WORKER_URL).toBe('/sw.js');
  });
});
