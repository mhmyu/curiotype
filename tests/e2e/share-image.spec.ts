import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { en } from '../../src/i18n/ui/en';
import { id } from '../../src/i18n/ui/id';
import { chooseMode } from './helpers';

const FILE_NAME = /^typing-result-\d+wpm\.png$/;
const PNG_SIGNATURE = '89504e470d0a1a0a';

/** Collects console errors (a CSP violation would show up here) and uncaught exceptions. */
function trackProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console error: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`uncaught exception: ${error.message}`));
  return problems;
}

async function finishQuote(page: Page, lang: 'en' | 'id') {
  const ui = lang === 'en' ? en : id;
  await page.goto(`/${lang}/`);
  await chooseMode(page, 'quote', ui);
  const input = page.getByLabel(ui.test.inputLabel);
  await expect(input).toBeVisible();
  const target = (await input.locator('xpath=preceding-sibling::div[1]').textContent()) ?? '';
  expect(target.length).toBeGreaterThan(20);
  await input.pressSequentially(target);
  await expect(page.getByRole('heading', { name: ui.results.title })).toBeAttached();
}

/** Pretend that the browser has no Web Share API (desktop Linux Chromium has none anyway). */
async function withoutWebShare(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
  });
}

test('without the Web Share API the button downloads a 1200x630 PNG', async ({ page }) => {
  const problems = trackProblems(page);
  await withoutWebShare(page);
  await finishQuote(page, 'en');

  const button = page.getByRole('button', { name: en.results.share, exact: true });
  await expect(button).toBeVisible();
  const box = await button.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

  const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
  expect(download.suggestedFilename()).toMatch(FILE_NAME);

  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const bytes = Buffer.concat(chunks);
  expect(bytes.subarray(0, 8).toString('hex')).toBe(PNG_SIGNATURE);
  // The IHDR chunk starts at byte 8; width and height are big-endian 32-bit numbers at 16 and 20.
  expect(bytes.readUInt32BE(16)).toBe(1200);
  expect(bytes.readUInt32BE(20)).toBe(630);
  expect(bytes.length).toBeGreaterThan(5_000);

  await expect(page.getByTestId('share-status')).toHaveText(en.results.shareSaved);
  expect(problems).toEqual([]);
});

test('with the Web Share API the image is shared as a file and nothing is downloaded', async ({
  page,
}) => {
  const problems = trackProblems(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', {
      value: (data: ShareData) => Array.isArray(data.files) && data.files.length > 0,
      configurable: true,
    });
    Object.defineProperty(navigator, 'share', {
      value: async (data: ShareData) => {
        const file = data.files?.[0];
        (window as unknown as { __shared: unknown }).__shared = {
          name: file?.name,
          type: file?.type,
          size: file?.size,
          title: data.title,
          text: data.text,
        };
      },
      configurable: true,
    });
  });
  let downloads = 0;
  page.on('download', () => (downloads += 1));

  await finishQuote(page, 'en');
  await page.getByRole('button', { name: en.results.share, exact: true }).click();

  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __shared?: unknown }).__shared))
    .toMatchObject({
      type: 'image/png',
      title: en.meta.siteName,
      text: expect.stringContaining('WPM'),
    });
  const shared = (await page.evaluate(
    () => (window as unknown as { __shared: { name: string; size: number } }).__shared,
  )) as { name: string; size: number };
  expect(shared.name).toMatch(FILE_NAME);
  expect(shared.size).toBeGreaterThan(5_000);

  await expect(page.getByTestId('share-status')).toHaveText('');
  expect(downloads).toBe(0);
  expect(problems).toEqual([]);
});

test('dismissing the share sheet is not an error and does not download', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(navigator, 'share', {
      value: async () => {
        throw new DOMException('dismissed', 'AbortError');
      },
      configurable: true,
    });
  });
  let downloads = 0;
  page.on('download', () => (downloads += 1));

  await finishQuote(page, 'en');
  const button = page.getByRole('button', { name: en.results.share, exact: true });
  await button.click();
  await expect(button).toBeEnabled();
  await expect(page.getByTestId('share-status')).toHaveText('');
  expect(downloads).toBe(0);
});

test('the Indonesian page shows the translated button and message', async ({ page }) => {
  await withoutWebShare(page);
  await finishQuote(page, 'id');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: id.results.share, exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(FILE_NAME);
  await expect(page.getByTestId('share-status')).toHaveText(id.results.shareSaved);
});

test('the result page has no horizontal scroll with the share button', async ({ page }) => {
  await withoutWebShare(page);
  await finishQuote(page, 'en');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('while the image is drawn the button is aria-disabled with a busy label, then it works', async ({ page }) => {
  await withoutWebShare(page);
  // Slow drawing: the PNG is only produced after 1.5 s.
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, ...rest) {
      setTimeout(() => original.call(this, callback, ...rest), 1500);
    };
  });
  let downloads = 0;
  page.on('download', () => (downloads += 1));
  await finishQuote(page, 'en');

  const busy = page.getByRole('button', { name: en.results.shareBusy, exact: true });
  await expect(busy).toBeVisible();
  await expect(busy).toHaveAttribute('aria-disabled', 'true');
  // Still focusable (a native `disabled` button would not be), and a click does nothing yet.
  await busy.focus();
  await expect(busy).toBeFocused();
  await busy.click({ force: true });
  expect(downloads).toBe(0);

  const ready = page.getByRole('button', { name: en.results.share, exact: true });
  await expect(ready).toHaveAttribute('aria-disabled', 'false', { timeout: 10_000 });
  const [download] = await Promise.all([page.waitForEvent('download'), ready.click()]);
  expect(download.suggestedFilename()).toMatch(FILE_NAME);
  expect(downloads).toBe(1);
});

test('when drawing fails the message shows, and a click draws again before sharing', async ({ page }) => {
  await withoutWebShare(page);
  // The first drawing fails (no PNG); later ones work.
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    let calls = 0;
    HTMLCanvasElement.prototype.toBlob = function (callback, ...rest) {
      calls += 1;
      if (calls === 1) callback(null);
      else original.call(this, callback, ...rest);
    };
  });
  let downloads = 0;
  page.on('download', () => (downloads += 1));
  await finishQuote(page, 'en');

  const status = page.getByTestId('share-status');
  await expect(status).toHaveText(en.results.shareFailed);
  const button = page.getByRole('button', { name: en.results.share, exact: true });
  await expect(button).toHaveAttribute('aria-disabled', 'false');

  // The first click only draws again (it does not share in the same click) and clears the message.
  await button.click();
  await expect(status).toHaveText('');
  expect(downloads).toBe(0);

  // Once the image is ready, the next click shares (here: downloads) it.
  await expect(button).toHaveAttribute('aria-disabled', 'false');
  const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
  expect(download.suggestedFilename()).toMatch(FILE_NAME);
});
