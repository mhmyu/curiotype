import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { en } from '../../src/i18n/ui/en';
import { chooseMode, countSelect, durationSelect, modeSelect, openFilters } from './helpers';

const HISTORY_KEY = 'typing:history:v1';
const BESTS_KEY = 'typing:personal-bests:v1';
const SEEN_KEY = 'typing:seen:v1:en';
const STREAK_KEY = 'typing:streak:v1';

async function readKey(page: Page, key: string) {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), key);
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'page is wider than the viewport').toBeLessThanOrEqual(0);
}

async function openRelaxed(page: Page) {
  await page.goto('/en/');
  await expect(modeSelect(page, en)).toBeVisible();
  await chooseMode(page, 'relaxed');
  await expect(page.getByTestId('relaxed-number')).toBeVisible();
}

async function readTarget(input: Locator): Promise<string> {
  const text = await input.locator('xpath=preceding-sibling::div[1]').textContent();
  return text ?? '';
}

test('relaxed mode has no clock, no weak-key practice, and no duration or count options', async ({
  page,
}) => {
  await openRelaxed(page);

  await expect(page.getByTestId('time-readout')).toHaveCount(0);
  // Category and difficulty still apply, weak-key practice does not.
  const panel = await openFilters(page);
  await expect(panel.getByLabel(en.test.categoryLabel)).toBeVisible();
  await expect(panel.getByRole('button', { name: en.test.focusWeakKeys })).toHaveCount(0);
  await expect(durationSelect(page, en)).toHaveCount(0);
  await expect(countSelect(page, en)).toHaveCount(0);
  await expect(page.getByText(en.relaxed.hint)).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('a finished sentence shows its card; Enter continues; nothing is scored', { tag: '@smoke' }, async ({ page }) => {
  await openRelaxed(page);
  await expect(page.getByTestId('relaxed-number')).toHaveText('Sentence 1');

  const input = page.getByLabel(en.test.inputLabel);
  const first = await readTarget(input);
  expect(first.length).toBeGreaterThan(20);
  await input.pressSequentially(first);

  const card = page.getByTestId('relaxed-card');
  await expect(card).toBeVisible();
  await expect(card).toContainText(first);
  await expect(card.getByRole('link', { name: /.+/ }).first()).toHaveAttribute('href', /^https:\/\//);
  await expect(page.getByTestId('relaxed-next')).toBeFocused();
  await expectNoHorizontalScroll(page);

  await page.keyboard.press('Enter');
  await expect(page.getByTestId('relaxed-number')).toHaveText('Sentence 2');
  await expect(page.getByTestId('relaxed-card')).toHaveCount(0);

  // No WPM, history or record; the sentence is seen and the session counts once for the streak.
  await expect(page.getByRole('heading', { name: en.results.title })).toHaveCount(0);
  await expect.poll(() => readKey(page, SEEN_KEY)).toHaveLength(1);
  expect(await readKey(page, HISTORY_KEY)).toBeNull();
  expect(await readKey(page, BESTS_KEY)).toBeNull();
  expect((await readKey(page, STREAK_KEY)).todayCount).toBe(1);
});

test('mistakes are marked but never block the sentence', async ({ page }) => {
  await openRelaxed(page);

  const input = page.getByLabel(en.test.inputLabel);
  const target = await readTarget(input);
  await input.pressSequentially('#'.repeat(target.length));

  await expect(page.getByTestId('relaxed-card')).toBeVisible();
  expect(await readKey(page, HISTORY_KEY)).toBeNull();
});

test('finishing shows a summary with the sentences typed, and the session counts once for the streak', async ({
  page,
}) => {
  await openRelaxed(page);

  const input = page.getByLabel(en.test.inputLabel);
  await input.pressSequentially(await readTarget(input));
  await page.getByTestId('relaxed-next').click();
  await expect(page.getByTestId('relaxed-number')).toHaveText('Sentence 2');
  await input.pressSequentially(await readTarget(input));
  await page.getByTestId('relaxed-finish').click();

  const summary = page.getByTestId('relaxed-summary');
  await expect(summary).toBeVisible();
  await expect(page.getByTestId('relaxed-summary-count')).toHaveText('Sentences typed: 2');
  await expect(summary.locator('[data-sentence-id]')).toHaveCount(2);
  await expect(summary.getByRole('button', { name: en.results.saveToCollection }).first()).toBeVisible();

  // One session = one count for the streak, however many sentences it had.
  await expect.poll(async () => (await readKey(page, STREAK_KEY))?.todayCount).toBe(1);
  expect(await readKey(page, SEEN_KEY)).toHaveLength(2);

  await page.getByTestId('relaxed-new-session').click();
  await expect(page.getByTestId('relaxed-number')).toHaveText('Sentence 1');
  await expect(page.getByTestId('relaxed-summary')).toHaveCount(0);
});

test('finishing before any sentence is done ends the session without counting it', async ({
  page,
}) => {
  await openRelaxed(page);
  await page.getByTestId('relaxed-finish').click();

  await expect(page.getByTestId('relaxed-summary-count')).toHaveText('Sentences typed: 0');
  await expect(page.getByText(en.relaxed.summaryEmpty)).toBeVisible();
  expect(await readKey(page, STREAK_KEY)).toBeNull();
  expect(await readKey(page, SEEN_KEY)).toBeNull();
});

test('Esc starts the current sentence over', async ({ page }) => {
  await openRelaxed(page);

  const input = page.getByLabel(en.test.inputLabel);
  await input.pressSequentially('abc');
  await expect(input).toHaveValue('abc');
  await input.press('Escape');
  await expect(input).toHaveValue('');
  await expect(page.getByTestId('relaxed-number')).toHaveText('Sentence 1');
});

test('the star saves a relaxed sentence to the collection', async ({ page }) => {
  await openRelaxed(page);

  const input = page.getByLabel(en.test.inputLabel);
  await input.pressSequentially(await readTarget(input));
  const card = page.getByTestId('relaxed-card');
  const star = card.getByRole('button', { name: en.results.saveToCollection });
  await star.click();
  await expect(star).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => readKey(page, 'typing:favorites:v1:en')).toHaveLength(1);
});
