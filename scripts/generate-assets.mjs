// Generates the brand assets: favicon, app icons and Open Graph images.
//
//   pnpm assets:generate
//
// Everything is drawn from the design palette (light mode values; the logo looks the same in
// both modes). The PNG files are rendered with the Chromium that Playwright already provides, so
// no extra dependency is needed and nothing is fetched from the network: the fonts come from the
// @fontsource-variable packages and are embedded in the page as data URIs. The generated files
// are committed; run this script again only when the palette, the logo, the names or the
// taglines change. To use your own artwork instead, replace the files at the same paths.
//
// Set CHROMIUM_PATH to use a specific Chromium binary (for example when Playwright's own browser
// is not installed).

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { id as idDictionary } from '../src/i18n/ui/id.ts';
import { en as enDictionary } from '../src/i18n/ui/en.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');

/** Design light-mode colors used by the assets. */
const COLOR = {
  primary: '#a5ed6e',
  onPrimary: '#111111',
  background: '#ddf4ff',
  surface: '#ffffff',
  text: '#3c3c3c',
  textMuted: '#5c5c5c',
  accent: '#0b6fb3',
  border: '#6b7f8c',
};

/** Largest allowed size of an Open Graph image (spec 9.6). */
const OG_MAX_BYTES = 300 * 1024;
const OG_SIZE = { width: 1200, height: 630 };

const DICTIONARIES = { id: idDictionary, en: enDictionary };

// ---------------------------------------------------------------------------
// Contrast check (WCAG 2.1): the text colors drawn on the images must reach AA.
// ---------------------------------------------------------------------------

function luminance(hex) {
  const channels = [1, 3, 5].map((start) => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground, background) {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

function assertContrast(label, foreground, background, minimum = 4.5) {
  const ratio = contrast(foreground, background);
  if (ratio < minimum) {
    throw new Error(`${label}: contrast ${ratio.toFixed(2)}:1 is below ${minimum}:1`);
  }
  return ratio;
}

// ---------------------------------------------------------------------------
// Logo: a rounded lime square with a "T". The 2px (of 64) border in `on-primary` follows the
// design rule that a primary fill never stands alone on a light background.
// ---------------------------------------------------------------------------

/** The letter T, centered in a 64 x 64 box. */
const T_PATH = 'M18 18h28v7h-10.5v21h-7V25H18z';

/** Rounded logo, used by the favicon and the "any" icons. */
function logoSvg() {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
    `<rect x="1" y="1" width="62" height="62" rx="13" fill="${COLOR.primary}" stroke="${COLOR.onPrimary}" stroke-width="2"/>` +
    `<path d="${T_PATH}" fill="${COLOR.onPrimary}"/>` +
    '</svg>'
  );
}

/**
 * Full-bleed logo: no rounded corners and no border, because the platform masks it (iOS rounds
 * the apple-touch-icon, Android applies its own shape to maskable icons). The T is scaled up
 * but stays far inside the central 80% safe zone.
 */
function fullBleedSvg() {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
    `<rect width="64" height="64" fill="${COLOR.primary}"/>` +
    `<path d="${T_PATH}" fill="${COLOR.onPrimary}" transform="translate(32 32) scale(1.2) translate(-32 -32)"/>` +
    '</svg>'
  );
}

// ---------------------------------------------------------------------------
// Open Graph image (HTML rendered at 1200 x 630).
// ---------------------------------------------------------------------------

async function fontFace(family, packageDir, file, weight) {
  const data = await readFile(
    path.join(ROOT, 'node_modules', '@fontsource-variable', packageDir, 'files', file),
  );
  return (
    `@font-face{font-family:'${family}';font-weight:${weight};font-style:normal;` +
    `src:url(data:font/woff2;base64,${data.toString('base64')}) format('woff2');}`
  );
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function ogHtml({ lang, fonts, dictionary }) {
  const { siteName, tagline } = dictionary.meta;
  const chips = Object.values(dictionary.categories)
    .map((label) => `<li>${escapeHtml(label)}</li>`)
    .join('');
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<style>
${fonts}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${OG_SIZE.width}px;height:${OG_SIZE.height}px}
body{background:${COLOR.background};padding:48px;font-family:'Inter',sans-serif}
.card{width:100%;height:100%;background:${COLOR.surface};border:3px solid ${COLOR.border};border-radius:28px;padding:56px 64px;display:flex;flex-direction:column}
.logo{width:104px;height:104px;display:block;flex:none}
h1{font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:72px;line-height:1.1;letter-spacing:0.02em;color:${COLOR.text};margin-top:32px;white-space:nowrap}
p{font-weight:600;font-size:32px;line-height:1.3;color:${COLOR.textMuted};margin-top:16px}
ul{list-style:none;display:flex;gap:16px;margin-top:auto;padding-top:24px}
li{font-weight:600;font-size:28px;line-height:1;color:${COLOR.onPrimary};background:${COLOR.primary};border:2px solid ${COLOR.onPrimary};border-radius:12px;padding:14px 22px}
</style>
</head>
<body>
<div class="card">
<img class="logo" alt="" src="data:image/svg+xml;base64,${Buffer.from(logoSvg()).toString('base64')}">
<h1>${escapeHtml(siteName)}</h1>
<p>${escapeHtml(tagline)}</p>
<ul>${chips}</ul>
</div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/** Throws when the Open Graph text overflows the card or the blocks overlap. */
async function assertOgLayout(page, label) {
  const problems = await page.evaluate(() => {
    const box = (selector) => document.querySelector(selector).getBoundingClientRect();
    const card = box('.card');
    const [name, tagline, chips] = [box('h1'), box('p'), box('ul')];
    const found = [];
    const padding = 64;
    if (document.querySelector('h1').scrollWidth > document.querySelector('h1').clientWidth) found.push('site name wider than its box');
    if (name.right > card.right - padding + 1) found.push('site name runs into the card padding');
    if (tagline.right > card.right - padding + 1) found.push('tagline runs into the card padding');
    if (tagline.bottom > chips.top) found.push('tagline overlaps the category chips');
    if (chips.bottom > card.bottom - 40) found.push('chips too close to the card bottom');
    return found;
  });
  if (problems.length > 0) throw new Error(`${label}: ${problems.join('; ')}`);
}

async function renderPng(browser, { width, height, html, transparent, label, check }) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  try {
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    if (check) await assertOgLayout(page, label);
    return await page.screenshot({ type: 'png', omitBackground: transparent });
  } finally {
    await page.close();
  }
}

function svgPageHtml(svg, size) {
  return (
    '<!doctype html><html><body style="margin:0;background:transparent">' +
    svg.replace('<svg ', `<svg width="${size}" height="${size}" style="display:block" `) +
    '</body></html>'
  );
}

async function write(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, data);
  const { size } = await stat(file);
  console.log(`${path.relative(ROOT, file)}  ${(size / 1024).toFixed(1)} KB`);
  return size;
}

async function main() {
  // The text on the Open Graph image must reach WCAG AA on the color behind it.
  assertContrast('site name on surface', COLOR.text, COLOR.surface);
  assertContrast('tagline on surface', COLOR.textMuted, COLOR.surface);
  assertContrast('category chip text on primary', COLOR.onPrimary, COLOR.primary);

  const fonts = (
    await Promise.all([
      fontFace('Bricolage Grotesque', 'bricolage-grotesque', 'bricolage-grotesque-latin-wght-normal.woff2', '200 800'),
      fontFace('Inter', 'inter', 'inter-latin-wght-normal.woff2', '100 900'),
    ])
  ).join('\n');

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });
  try {
    // Vector favicon.
    await write(path.join(PUBLIC, 'favicon.svg'), `${logoSvg()}\n`);

    // Raster icons.
    const icons = [
      ['apple-touch-icon.png', 180, fullBleedSvg(), false],
      ['icons/icon-192.png', 192, logoSvg(), true],
      ['icons/icon-512.png', 512, logoSvg(), true],
      ['icons/icon-maskable-512.png', 512, fullBleedSvg(), false],
    ];
    for (const [name, size, svg, transparent] of icons) {
      const png = await renderPng(browser, {
        width: size,
        height: size,
        html: svgPageHtml(svg, size),
        transparent,
      });
      await write(path.join(PUBLIC, name), png);
    }

    // Open Graph images, one per language.
    for (const [lang, dictionary] of Object.entries(DICTIONARIES)) {
      const png = await renderPng(browser, {
        ...OG_SIZE,
        html: ogHtml({ lang, fonts, dictionary }),
        transparent: false,
        label: `og/${lang}.png`,
        check: true,
      });
      const size = await write(path.join(PUBLIC, 'og', `${lang}.png`), png);
      if (size > OG_MAX_BYTES) {
        throw new Error(`og/${lang}.png is ${size} bytes, above the ${OG_MAX_BYTES} byte limit`);
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
