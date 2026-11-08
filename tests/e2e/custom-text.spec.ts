import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { en } from '../../src/i18n/ui/en';
import { chooseMode, modeSelect, openFilters } from './helpers';

const HISTORY_KEY = 'typing:history:v1';
const BESTS_KEY = 'typing:personal-bests:v1';
const SEEN_KEY = 'typing:seen:v1:en';
const KEY_STATS_KEY = 'typing:key-stats:v1:en';
const STREAK_KEY = 'typing:streak:v1';
const TEXTS_KEY = 'typing:custom-texts:v1';

async function readKey(page: Page, key: string) {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), key);
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'page is wider than the viewport').toBeLessThanOrEqual(0);
}

async function openEditor(page: Page) {
  await page.goto('/en/');
  await expect(modeSelect(page, en)).toBeVisible();
  await chooseMode(page, 'custom');
  await expect(page.getByTestId('custom-text-input')).toBeVisible();
}

async function startWith(page: Page, text: string) {
  await page.getByTestId('custom-text-input').fill(text);
  await page.getByTestId('custom-text-start').click();
  await expect(page.getByLabel(en.test.inputLabel)).toBeVisible();
}

async function typeAll(page: Page, text: string) {
  await page.getByLabel(en.test.inputLabel).pressSequentially(text);
  await expect(page.getByRole('heading', { name: en.results.title })).toBeAttached();
}

test('the Own text mode opens an editor instead of a typing area, without corpus filters', async ({
  page,
}) => {
  await openEditor(page);

  await expect(page.getByLabel(en.test.inputLabel)).toHaveCount(0);
  await expect(page.getByTestId('time-readout')).toHaveCount(0);
  // The whole Filter button is gone, so there is nothing to open.
  await expect(page.getByTestId('filters-toggle')).toHaveCount(0);
  await expect(page.getByLabel(en.test.categoryLabel)).toHaveCount(0);
  await expect(page.getByTestId('custom-text-start')).toBeDisabled();
  await expect(page.getByTestId('custom-text-counter')).toHaveText('0 / 1000 characters');
  await expectNoHorizontalScroll(page);

  // Back to a corpus mode: the normal controls return.
  await chooseMode(page, 'quote', en);
  await expect((await openFilters(page)).getByLabel(en.test.categoryLabel)).toBeVisible();
  await expect(page.getByTestId('custom-text-input')).toHaveCount(0);
});

test('the preview shows the typeable text and how many characters were changed', async ({ page }) => {
  await openEditor(page);
  await page.getByTestId('custom-text-input').fill('\u201CHi\u201D \u2014 caf\u00E9\u2026\n\nok');

  await expect(page.getByTestId('custom-text-preview')).toHaveText('"Hi" - cafe... ok');
  await expect(page.getByTestId('custom-text-changed')).toHaveText(
    en.customText.changed.replace('{count}', '5'),
  );
  await expect(page.getByTestId('custom-text-start')).toBeEnabled();

  // Nothing typeable left: an error and no start.
  await page.getByTestId('custom-text-input').fill('\uD83D\uDE00\uD83D\uDE00');
  await expect(page.getByTestId('custom-text-error')).toHaveText(en.customText.empty);
  await expect(page.getByTestId('custom-text-start')).toBeDisabled();
});

test('typing the text ends in a result that is in the history but is no record and no learned sentence', { tag: '@smoke' }, async ({
  page,
}) => {
  await openEditor(page);
  const text = 'The quick brown fox jumps over the lazy dog.';
  await startWith(page, '\u201C' + text + '\u201D');

  // The target is the normalized text.
  const target = await page
    .getByLabel(en.test.inputLabel)
    .locator('xpath=preceding-sibling::div[1]')
    .textContent();
  expect(target).toBe(`"${text}"`);

  await typeAll(page, `"${text}"`);
  await expect(page.getByText(en.results.learnedTitle)).toHaveCount(0);
  await expectNoHorizontalScroll(page);

  await expect.poll(() => readKey(page, HISTORY_KEY)).toHaveLength(1);
  const [entry] = await readKey(page, HISTORY_KEY);
  expect(entry.mode).toBe('custom');
  expect(entry.durationSec).toBeNull();
  expect(entry.category).toBe('all');
  expect(entry.difficulty).toBe('all');
  expect(entry.sentenceIds).toBeUndefined();
  expect(entry.categoryChars).toBeUndefined();

  // No personal best (and no banner), nothing seen; key statistics and the streak do count.
  await expect(page.getByText(en.results.personalBest)).toHaveCount(0);
  expect(await readKey(page, BESTS_KEY)).toBeNull();
  expect(await readKey(page, SEEN_KEY)).toBeNull();
  expect(await readKey(page, KEY_STATS_KEY)).not.toBeNull();
  expect((await readKey(page, STREAK_KEY)).todayCount).toBe(1);

  // The text itself is saved for next time, and only there.
  const saved = await readKey(page, TEXTS_KEY);
  expect(saved).toHaveLength(1);
  expect(saved[0].text).toBe(`"${text}"`);
  expect(JSON.stringify(entry)).not.toContain('quick brown');
});

test('Try again repeats the same text; Change text goes back to the editor', async ({ page }) => {
  await openEditor(page);
  await startWith(page, 'Short text to repeat.');
  await typeAll(page, 'Short text to repeat.');

  await page.getByRole('button', { name: en.results.tryAgain }).click();
  const input = page.getByLabel(en.test.inputLabel);
  await expect(input).toBeVisible();
  await expect(input.locator('xpath=preceding-sibling::div[1]')).toHaveText('Short text to repeat.');
  await expect(page.getByRole('heading', { name: en.results.title })).toHaveCount(0);

  await page.getByTestId('change-text').click();
  await expect(page.getByTestId('custom-text-input')).toBeVisible();
  await expect(page.getByLabel(en.test.inputLabel)).toHaveCount(0);

  // The same button is on the result screen.
  await startWith(page, 'Short text to repeat.');
  await typeAll(page, 'Short text to repeat.');
  await page.getByTestId('change-text').click();
  await expect(page.getByTestId('custom-text-input')).toBeVisible();
});

test('saved texts: newest first, reusable, removable, at most five', async ({ page }) => {
  await openEditor(page);
  for (let i = 1; i <= 6; i += 1) {
    await startWith(page, `Saved text number ${i}.`);
    await page.getByTestId('change-text').click();
    await expect(page.getByTestId('custom-text-input')).toBeVisible();
  }

  const list = page.getByTestId('custom-text-saved').locator('li');
  await expect(list).toHaveCount(5);
  await expect(list.first()).toContainText('Saved text number 6.');
  await expect(list.last()).toContainText('Saved text number 2.');

  // Reusing a text starts it right away and moves it to the top.
  await list.last().getByRole('button', { name: en.customText.useSaved }).click();
  await expect(
    page.getByLabel(en.test.inputLabel).locator('xpath=preceding-sibling::div[1]'),
  ).toHaveText('Saved text number 2.');
  await page.getByTestId('change-text').click();
  await expect(list.first()).toContainText('Saved text number 2.');
  await expect(list).toHaveCount(5);

  await list.first().getByRole('button', { name: en.customText.removeSaved }).click();
  await expect(list).toHaveCount(4);
  expect(await readKey(page, TEXTS_KEY)).toHaveLength(4);
});

test('the saved texts survive a reload', async ({ page }) => {
  await openEditor(page);
  await startWith(page, 'Text that stays.');
  await page.getByTestId('change-text').click();

  await page.reload();
  await chooseMode(page, 'custom');
  await expect(page.getByTestId('custom-text-saved')).toContainText('Text that stays.');
});
