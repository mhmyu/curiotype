import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MANIFEST_ICONS, SERVICE_WORKER_URL, THEME_COLOR_DARK, THEME_COLOR_LIGHT } from '@/config/pwa';
import { LANGUAGES, LOCALE_TAGS } from '@/i18n/config';
import { getDictionary } from '@/i18n';
import { buildManifest, getManifestPath } from './manifest';

const tokens = readFileSync('src/styles/tokens.css', 'utf8');

describe('buildManifest', () => {
  it.each(LANGUAGES)('opens the %s home page and keeps the whole site in scope', (lang) => {
    const ui = getDictionary(lang);
    const manifest = buildManifest({ lang, name: ui.meta.siteName, description: ui.meta.description });
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
    const manifest = buildManifest({ lang: 'id', name: 'x', description: 'y' });
    expect(manifest.theme_color).toBe(THEME_COLOR_LIGHT);
    expect(manifest.background_color).toBe(THEME_COLOR_LIGHT);
  });

  it('does not share the icon list with the module constant', () => {
    const manifest = buildManifest({ lang: 'id', name: 'x', description: 'y' });
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
