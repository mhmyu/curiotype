import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { en } from '../../src/i18n/ui/en';
import { id } from '../../src/i18n/ui/id';
import { chooseMode, modeSelect } from './helpers';

// The other specs run with service workers blocked (playwright.config.ts) so that cached answers
// cannot hide their `page.route` rules; this one is about the worker, so it turns it on.
test.use({ serviceWorkers: 'allow' });

const LANGS = [
  { code: 'id', ui: id },
  { code: 'en', ui: en },
] as const;

/** Waits until the worker has installed (stored the whole site), activated, and controls the page. */
async function waitForWorker(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 30_000 });
}

async function openQuote(page: Page, lang: 'en' | 'id') {
  const ui = lang === 'en' ? en : id;
  await chooseMode(page, 'quote', ui);
  const input = page.getByLabel(ui.test.inputLabel);
  await expect(input).toBeVisible();
  const target = (await input.locator('xpath=preceding-sibling::div[1]').textContent()) ?? '';
  expect(target.length).toBeGreaterThan(20);
  return { input, target };
}

for (const { code, ui } of LANGS) {
  test(`${code}: the manifest opens the app in this language and its icons exist`, async ({ page }) => {
    await page.goto(`/${code}/`);
    const link = page.locator('link[rel="manifest"]');
    await expect(link).toHaveAttribute('href', `/${code}/manifest.webmanifest`);

    const response = await page.request.get(`/${code}/manifest.webmanifest`);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('json');
    const manifest = await response.json();
    expect(manifest).toMatchObject({
      name: ui.meta.siteName,
      start_url: `/${code}/`,
      scope: '/',
      display: 'standalone',
      theme_color: '#ddf4ff',
      background_color: '#ddf4ff',
    });
    const purposes = (manifest.icons as Array<{ purpose: string }>).map((icon) => icon.purpose);
    expect(purposes).toContain('maskable');
    for (const icon of manifest.icons as Array<{ src: string; sizes: string }>) {
      const file = await page.request.get(icon.src);
      expect(file.ok(), icon.src).toBe(true);
    }
  });
}

test('the page asks for light and dark browser colors', async ({ page }) => {
  await page.goto('/id/');
  const colors = await page
    .locator('meta[name="theme-color"]')
    .evaluateAll((nodes) => nodes.map((node) => [node.getAttribute('content'), node.getAttribute('media')]));
  expect(colors).toEqual([
    ['#ddf4ff', '(prefers-color-scheme: light)'],
    ['#0f1c26', '(prefers-color-scheme: dark)'],
  ]);
});

test('sw.js is served from the root and lists the pages of both languages and the sentence files', async ({
  page,
}) => {
  const response = await page.request.get('/sw.js');
  expect(response.ok()).toBe(true);
  expect(response.headers()['content-type']).toContain('javascript');
  const source = await response.text();
  for (const path of ['"/id/"', '"/en/"', '"/id/settings/"', '"/id/stats/"', '"/data/id/sentences.json"', '"/data/en/sentences.json"']) {
    expect(source, path).toContain(path);
  }
  // Social preview images, robots.txt and the worker itself are not stored.
  expect(source).not.toMatch(/"\/og\/|"\/robots\.txt"|"\/sw\.js"/);
});

test('after one visit the site opens offline and a whole test can be finished', async ({ page, context }) => {
  await page.goto('/id/');
  await waitForWorker(page);

  await context.setOffline(true);
  await page.reload();
  const { input, target } = await openQuote(page, 'id');
  await input.pressSequentially(target);
  await expect(page.getByRole('heading', { name: id.results.title })).toBeAttached();

  // Other stored pages open too, in both languages.
  await page.goto('/id/settings/');
  await expect(page.getByRole('heading', { level: 1, name: id.settings.title })).toBeVisible();
  await page.goto('/en/stats/');
  await expect(page.getByRole('heading', { level: 1, name: en.stats.title })).toBeVisible();
});

test('offline, an address that was never stored falls back to the home page of the same language', async ({
  page,
  context,
}) => {
  await page.goto('/en/');
  await waitForWorker(page);

  await context.setOffline(true);
  await page.goto('/en/never-stored/');
  await expect(modeSelect(page, en)).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('a new version shows a toast, never reloads by itself, and reloads when asked', async ({ page }) => {
  await page.goto('/id/');
  await waitForWorker(page);
  const { input, target } = await openQuote(page, 'id');
  const typed = target.slice(0, 6);
  await input.pressSequentially(typed);
  await page.evaluate(() => {
    (window as unknown as { __marker: boolean }).__marker = true;
  });

  // A worker with another script URL for the same scope is an update, like a new deploy would be.
  await page.evaluate(() => navigator.serviceWorker.register('/sw.js?update-test', { scope: '/' }));
  const toast = page.getByTestId('update-toast');
  await expect(toast).toBeVisible({ timeout: 30_000 });
  await expect(toast).toContainText(id.pwa.updateAvailable);

  // The test in progress is untouched: same page, same typed text.
  expect(await page.evaluate(() => (window as unknown as { __marker?: boolean }).__marker)).toBe(true);
  await expect(input).toHaveValue(typed);

  const box = await toast.boundingBox();
  expect(box?.width ?? 0).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await Promise.all([page.waitForEvent('load'), toast.getByRole('button', { name: id.pwa.reload, exact: true }).click()]);
  await expect(page.getByTestId('update-toast')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __marker?: boolean }).__marker)).toBeUndefined();
  await waitForWorker(page);
});

test('"Later" hides the toast without reloading', async ({ page }) => {
  await page.goto('/en/');
  await waitForWorker(page);
  await page.evaluate(() => {
    (window as unknown as { __marker: boolean }).__marker = true;
  });
  await page.evaluate(() => navigator.serviceWorker.register('/sw.js?update-test', { scope: '/' }));
  const toast = page.getByTestId('update-toast');
  await expect(toast).toContainText(en.pwa.updateAvailable, { timeout: 30_000 });
  await toast.getByRole('button', { name: en.pwa.later, exact: true }).click();
  await expect(toast).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __marker?: boolean }).__marker)).toBe(true);
});

test('the update toast does not move, cover or take focus from the typing area', async ({ page }) => {
  await page.goto('/id/');
  await waitForWorker(page);
  const { input, target } = await openQuote(page, 'id');
  // A test in progress: some characters typed, the field has the focus.
  await input.pressSequentially(target.slice(0, 6));
  await expect(input).toBeFocused();
  const before = await input.boundingBox();
  if (!before) throw new Error('the typing field has no box');

  await page.evaluate(() => navigator.serviceWorker.register('/sw.js?update-test', { scope: '/' }));
  const toast = page.getByTestId('update-toast');
  await expect(toast).toBeVisible({ timeout: 30_000 });

  // It is announced by a live region that exists before the toast.
  await expect(toast.locator('xpath=ancestor::*[@role="status"]')).toHaveCount(1);
  // No focus change and no layout shift.
  await expect(input).toBeFocused();
  expect(await input.boundingBox()).toEqual(before);

  // Inside the viewport (390x844) and not on top of the typing field.
  const box = await toast.boundingBox();
  if (!box) throw new Error('the toast has no box');
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  const apart = box.y >= before.y + before.height || box.y + box.height <= before.y;
  expect(apart, 'the toast covers the typing field').toBe(true);

  // Touch targets of at least 44x44.
  for (const name of [id.pwa.later, id.pwa.reload]) {
    const button = await toast.getByRole('button', { name, exact: true }).boundingBox();
    expect(button?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(button?.width ?? 0).toBeGreaterThanOrEqual(44);
  }
});
