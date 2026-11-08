import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { pickDailyFact } from '../../src/features/daily-fact/daily-fact';
import { en } from '../../src/i18n/ui/en';
import { id } from '../../src/i18n/ui/id';
import type { Sentence } from '../../src/lib/types';
import { contentLangSelect, modeSelect, openFilters } from './helpers';

const HISTORY_KEY = 'typing:history:v1';
const STREAK_KEY = 'typing:streak:v1';

/** Local calendar day as YYYY-MM-DD (same rule as the app; the browser uses this machine's time zone). */
function dayKey(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The fact the page must show: the pure picker applied to the same JSON file the page loads. */
async function expectedFact(page: Page, code: 'en' | 'id', day: string): Promise<Sentence> {
  const response = await page.request.get(`/data/${code}/sentences.json`);
  expect(response.ok()).toBe(true);
  const fact = pickDailyFact((await response.json()) as Sentence[], day, code);
  expect(fact, 'the corpus has sentences').not.toBeNull();
  return fact as Sentence;
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'page is wider than the viewport').toBeLessThanOrEqual(0);
}

test('the home page shows the fact of the day with its explanation, source and a button', async ({ page }) => {
  await page.goto('/en/');
  const expected = await expectedFact(page, 'en', dayKey());

  const card = page.getByRole('region', { name: en.dailyFact.title });
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('data-sentence-id', expected.id);
  await expect(card.getByText(expected.text, { exact: true })).toHaveAttribute('lang', 'en');
  await expect(card.getByText(expected.explanation, { exact: true })).toBeVisible();
  await expect(card.getByRole('link', { name: expected.source.title })).toHaveAttribute('href', expected.source.url);
  await expect(card.getByRole('button', { name: en.dailyFact.typeIt })).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Same sentence after a reload (the choice is not random).
  await page.reload();
  await expect(page.getByTestId('daily-fact')).toHaveAttribute('data-sentence-id', expected.id);
});

test('the fact follows the local day (injected clock) and the sentence language', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2030, 5, 15, 12, 0, 0));
  await page.goto('/en/');
  await expect(page.getByTestId('daily-fact')).toHaveAttribute(
    'data-sentence-id',
    (await expectedFact(page, 'en', '2030-06-15')).id,
  );

  await page.clock.setFixedTime(new Date(2030, 5, 16, 12, 0, 0));
  await page.reload();
  await expect(page.getByTestId('daily-fact')).toHaveAttribute(
    'data-sentence-id',
    (await expectedFact(page, 'en', '2030-06-16')).id,
  );

  // Another sentence language has its own fact for the same day (the interface stays English).
  await contentLangSelect(page).selectOption('id');
  const factId = await expectedFact(page, 'id', '2030-06-16');
  await expect(page.getByTestId('daily-fact')).toHaveAttribute('data-sentence-id', factId.id);
  await expect(page.getByRole('region', { name: en.dailyFact.title }).getByText(factId.text, { exact: true })).toHaveAttribute(
    'lang',
    'id',
  );
});

test('"Type this sentence" starts a Sentence test with the fact; the result counts like any test', { tag: '@smoke' }, async ({ page }) => {
  await page.goto('/en/');
  const expected = await expectedFact(page, 'en', dayKey());
  const input = page.getByLabel(en.test.inputLabel);
  await expect(input).toBeVisible();

  // A category filter is active before the click; the daily fact resets it to "all".
  await (await openFilters(page)).getByLabel(en.test.categoryLabel).selectOption('science');
  await expect(input).toBeVisible();

  await page.getByRole('button', { name: en.dailyFact.typeIt }).click();

  await expect(modeSelect(page, en)).toHaveValue('quote');
  const panel = await openFilters(page);
  await expect(panel.getByLabel(en.test.categoryLabel)).toHaveValue('all');
  await expect(panel.getByLabel(en.test.difficultyLabel)).toHaveValue('all');
  await expect(page.getByTestId('filters-toggle')).toHaveAttribute('aria-label', en.test.filters);
  await expect(input.locator('xpath=preceding-sibling::div[1]')).toHaveText(expected.text);
  // The typing area is scrolled into view and focused, so the button works from the bottom of the page.
  await expect(input).toBeFocused();
  await expect(input).toBeInViewport();

  await input.pressSequentially(expected.text);
  await expect(page.getByRole('heading', { name: en.results.title })).toBeAttached();

  // Saving runs behind a storage lock, so it lands a moment after the result appears: wait for both.
  const readStored = () =>
    page.evaluate(
      ([historyKey, streakKey]) => ({
        history: JSON.parse(localStorage.getItem(historyKey) ?? 'null'),
        streak: JSON.parse(localStorage.getItem(streakKey) ?? 'null'),
      }),
      [HISTORY_KEY, STREAK_KEY],
    );
  await expect.poll(async () => (await readStored()).streak).not.toBeNull();
  const stored = await readStored();
  expect(stored.history).toHaveLength(1);
  expect(stored.history[0].mode).toBe('quote');
  expect(stored.history[0].contentLang).toBe('en');
  expect(stored.history[0].sentenceIds).toEqual([expected.id]);
  expect(stored.streak).toMatchObject({ current: 1, todayCount: 1 });

  // The card is still there after the test and can start the same sentence again.
  await page.getByRole('button', { name: en.dailyFact.typeIt }).click();
  await expect(input.locator('xpath=preceding-sibling::div[1]')).toHaveText(expected.text);
});

test('the Indonesian page shows an Indonesian card', async ({ page }) => {
  await page.goto('/id/');
  const expected = await expectedFact(page, 'id', dayKey());
  const card = page.getByRole('region', { name: id.dailyFact.title });
  await expect(card).toHaveAttribute('data-sentence-id', expected.id);
  await expect(card.getByRole('button', { name: id.dailyFact.typeIt })).toBeVisible();
});
