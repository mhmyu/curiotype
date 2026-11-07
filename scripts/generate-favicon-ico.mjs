// Writes public/favicon.ico (16, 32 and 48 px) from the existing public/favicon.svg.
// Run it with `pnpm assets:favicon-ico`; it only touches that one file, so brand assets you
// replaced with your own artwork stay as they are. Browsers that cannot use the SVG favicon,
// and crawlers that request /favicon.ico directly, use this file.
// Set CHROMIUM_PATH to use a specific Chromium binary.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { buildIco } from '../src/lib/ico.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIZES = [16, 32, 48];

const svg = await readFile(path.join(ROOT, 'public/favicon.svg'), 'utf8');
const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  const images = [];
  for (const size of SIZES) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(
      `<!doctype html><style>html,body{margin:0;background:transparent}img{display:block;width:${size}px;height:${size}px}</style><img src="${dataUrl}" alt="">`,
    );
    await page.waitForFunction(() => document.images[0].complete && document.images[0].naturalWidth > 0);
    const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    images.push({ size, png });
    await page.close();
  }
  const ico = buildIco(images);
  await writeFile(path.join(ROOT, 'public/favicon.ico'), ico);
  console.log(`public/favicon.ico written: ${SIZES.join(', ')} px, ${ico.length} bytes`);
} finally {
  await browser.close();
}
