import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { en } from '../../src/i18n/ui/en';
import { id } from '../../src/i18n/ui/id';
import { chooseMode } from './helpers';

/**
 * Holds the sentence file back: once it arrives the typing box takes the focus by itself, which is
 * right for a person but would race with the Tab checks below.
 */
async function holdSentences(page: Page, lang: string): Promise<() => void> {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route(`**/data/${lang}/sentences.json`, async (route) => {
    await gate;
    await route.continue();
  });
  return release;
}

test('the first Tab stops on the skip link and Enter moves the focus to the main content', async ({ page }) => {
  const release = await holdSentences(page, 'en');
  await page.goto('/en/');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: en.nav.skipToContent });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  const box = await skip.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

  await page.keyboard.press('Enter');
  await expect(page.locator('main#main')).toBeFocused();
  release();
});

test('the skip link is hidden until it has the focus and is in the page language', async ({ page }) => {
  const release = await holdSentences(page, 'id');
  await page.goto('/id/');
  const skip = page.getByRole('link', { name: id.nav.skipToContent });
  // Visually hidden (clipped); its box keeps the button minimum size, so the clip-path is what is checked.
  const clip = () => skip.evaluate((el) => getComputedStyle(el).clipPath);
  expect(await clip()).toBe('inset(50%)');
  await page.keyboard.press('Tab');
  await expect(skip).toBeFocused();
  expect(await clip()).toBe('none');
  release();
});

test('the sentence cards carry the sentence language, not the interface language', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('typing:settings:v1', JSON.stringify({ contentLang: 'en' }));
  });
  await page.goto('/id/');
  await chooseMode(page, 'quote', id);
  const input = page.getByLabel(id.test.inputLabel);
  await expect(input).toBeVisible();
  const text = input.locator('xpath=preceding-sibling::div[1]');
  await expect(text).toHaveAttribute('lang', 'en');
  await input.pressSequentially((await text.textContent()) ?? '');
  await expect(page.getByRole('heading', { name: id.results.title })).toBeAttached();

  const card = page.locator('[data-sentence-id]').first();
  await expect(card.locator('p').nth(0)).toHaveAttribute('lang', 'en');
  await expect(card.locator('p').nth(1)).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'id');
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  for (const [path, ui] of [
    ['/en/', en],
    ['/id/', id],
  ] as const) {
    test(`${path} explains that JavaScript is needed`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByTestId('noscript-message')).toHaveText(ui.nav.noscript);
    });
  }
});

test('the message for missing JavaScript is not shown when scripts run', async ({ page }) => {
  await page.goto('/en/');
  await expect(page.getByTestId('noscript-message')).toBeHidden();
});
