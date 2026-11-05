import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { en } from '../../src/i18n/ui/en';
import { chooseCount, chooseMode, countSelect, durationSelect, modeSelect } from './helpers';

const HISTORY_KEY = 'typing:history:v1';
const BESTS_KEY = 'typing:personal-bests:v1';

async function readKey(page: Page, key: string) {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), key);
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'page is wider than the viewport').toBeLessThanOrEqual(0);
}

test('count mode offers 1, 3, 5 and 10 sentences and hides them in other modes', async ({ page }) => {
  await page.goto('/en/');
  await expect(modeSelect(page, en)).toBeVisible();
  await expect(countSelect(page, en)).toHaveCount(0);

  await chooseMode(page, 'count', en);
  await expect(countSelect(page, en).getByRole('option')).toHaveText(['1', '3', '5', '10']);
  await expect(durationSelect(page, en)).toHaveCount(0);
  await expectNoHorizontalScroll(page);

  await chooseMode(page, 'quote', en);
  await expect(countSelect(page, en)).toHaveCount(0);
});

test('a count test finishes after the whole text and keeps a record per sentence count', async ({
  page,
}) => {
  await page.goto('/en/');
  await expect(modeSelect(page, en)).toBeVisible();
  await chooseCount(page, 3, en);

  const input = page.getByLabel(en.test.inputLabel);
  await expect(input).toBeVisible();
  const target = (await input.locator('xpath=preceding-sibling::div[1]').textContent()) ?? '';
  expect(target.length).toBeGreaterThan(60);
  await input.pressSequentially(target);
  await expect(page.getByRole('heading', { name: en.results.title })).toBeAttached();

  await expect.poll(() => readKey(page, BESTS_KEY)).toEqual({
    'en:count:3': expect.any(Number),
  });
  const history = await readKey(page, HISTORY_KEY);
  expect(history[0]).toMatchObject({
    mode: 'count',
    durationSec: null,
    sentenceCount: 3,
    accuracy: 100,
  });
  expect(history[0].sentenceIds).toHaveLength(3);
});

test('a longer count test lists its own label in the history', async ({ page }) => {
  await page.goto('/en/');
  await chooseCount(page, 1, en);

  const input = page.getByLabel(en.test.inputLabel);
  await expect(input).toBeVisible();
  const target = (await input.locator('xpath=preceding-sibling::div[1]').textContent()) ?? '';
  await input.pressSequentially(target);
  await expect(page.getByRole('heading', { name: en.results.title })).toBeAttached();

  await page.getByRole('button', { name: en.results.tryAgain }).click();
  await expect(page.getByText(`${en.test.modes.count} 1`).first()).toBeVisible();
});
