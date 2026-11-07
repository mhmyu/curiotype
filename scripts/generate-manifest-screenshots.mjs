// Makes the install-dialog screenshots listed in the web app manifests:
// public/screenshots/home-<lang>-<narrow|wide>.png (a phone and a desktop window, both languages).
//
// Run `pnpm build` first: the script serves `dist/` itself (no network, no Astro preview) and
// shoots the real home page in the light theme. Math.random is seeded so that running the script
// again picks the same sentence. Set CHROMIUM_PATH to use a specific Chromium binary.
//
//   pnpm build && pnpm assets:screenshots
//
// Keep the sizes in sync with `SCREENSHOT_SIZES` in src/config/pwa.ts (manifest.test.ts checks
// the pixel size of every file).

import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const DIST = resolve('dist');
const OUT = resolve('public/screenshots');
const LANGS = ['id', 'en'];
const SIZES = { narrow: { width: 390, height: 844 }, wide: { width: 1280, height: 720 } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

if (!existsSync(join(DIST, 'id', 'index.html'))) {
  console.error('dist/ not found. Run `pnpm build` first.');
  process.exit(1);
}

function resolveFile(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  let file = join(DIST, clean);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  return existsSync(file) && file.startsWith(DIST) ? file : null;
}

const server = createServer((request, response) => {
  const file = resolveFile(request.url ?? '/');
  if (!file) {
    response.writeHead(404).end('not found');
    return;
  }
  response.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(response);
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: process.env.CHROMIUM_PATH ? ['--no-sandbox'] : [],
});
try {
  for (const lang of LANGS) {
    for (const [formFactor, viewport] of Object.entries(SIZES)) {
      const context = await browser.newContext({
        viewport,
        deviceScaleFactor: 1,
        colorScheme: 'light',
        reducedMotion: 'reduce',
        serviceWorkers: 'block',
      });
      await context.addInitScript(() => {
        let seed = 7;
        Math.random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
      });
      const page = await context.newPage();
      await page.goto(`${base}/${lang}/`);
      await page.waitForSelector('[data-testid="mode-description"]');
      await page.evaluate(() => document.fonts.ready);
      await page.mouse.move(0, 0);
      const file = join(OUT, `home-${lang}-${formFactor}.png`);
      await page.screenshot({ path: file });
      console.log(`wrote ${file}`);
      await context.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}
