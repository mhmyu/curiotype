import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { en } from '../../src/i18n/ui/en';
import { id } from '../../src/i18n/ui/id';
import type { Dictionary } from '../../src/i18n/types';
import { chooseMode } from './helpers';

/**
 * A result above 300 WPM is not a real test: it is shown with a note, but it is not saved (no
 * history entry, record, key statistics, `seen` or streak). The browser driven by Playwright
 * reports `navigator.webdriver`, which lifts the limit so the other specs (that type a sentence
 * in a few milliseconds) keep working; these tests switch it off to behave like a person's browser.
 */
async function pretendHuman(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'webdriver', { configurable: true, get: () => false });
  });
}

const stored = (page: Page, key: string) => page.evaluate((k) => localStorage.getItem(k), key);

async function typeSentenceFast(page: Page, ui: Dictionary) {
  await chooseMode(page, 'quote', ui);
  const input = page.getByLabel(ui.test.inputLabel);
  await expect(input).toBeEnabled();
  const target = await input.evaluate(
    (el) => (el.previousElementSibling as HTMLElement).textContent ?? '',
  );
  await input.pressSequentially(target);
}

test('an implausibly fast result is shown with a note and saves nothing', { tag: '@smoke' }, async ({ page }) => {
  await pretendHuman(page);
  await page.goto('/en/');
  await typeSentenceFast(page, en);

  await expect(page.getByTestId('result-implausible')).toContainText('300 WPM');
  await expect(page.getByText(en.results.personalBest)).toHaveCount(0);
  for (const key of [
    'typing:history:v1',
    'typing:personal-bests:v1',
    'typing:streak:v1',
    'typing:seen:v1:en',
    'typing:key-stats:v1:en',
  ]) {
    expect(await stored(page, key)).toBeNull();
  }
});

test('Try again after an implausible result starts a normal test', async ({ page }) => {
  await pretendHuman(page);
  await page.goto('/en/');
  await typeSentenceFast(page, en);
  await expect(page.getByTestId('result-implausible')).toBeVisible();

  await page.getByRole('button', { name: en.results.tryAgain }).click();
  await expect(page.getByTestId('result-implausible')).toHaveCount(0);
  await expect(page.getByLabel(en.test.inputLabel)).toBeEnabled();
});

test('the note is in Indonesian on the Indonesian page', async ({ page }) => {
  await pretendHuman(page);
  await page.goto('/id/');
  await typeSentenceFast(page, id);
  await expect(page.getByTestId('result-implausible')).toContainText('300 WPM');
  await expect(page.getByTestId('result-implausible')).toContainText('tidak disimpan');
});

test('the browser driven by automation is not limited (the other specs rely on it)', async ({
  page,
}) => {
  await page.goto('/en/');
  await typeSentenceFast(page, en);
  await expect(page.getByTestId('result-implausible')).toHaveCount(0);
  // Saving runs behind a storage lock, so it lands a moment after the result appears.
  await expect.poll(() => stored(page, 'typing:history:v1')).not.toBeNull();
});
