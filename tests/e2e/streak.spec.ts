import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { en } from '../../src/i18n/ui/en';
import { id } from '../../src/i18n/ui/id';
import { chooseMode, modeSelect } from './helpers';

const STREAK_KEY = 'typing:streak:v1';
const SETTINGS_KEY = 'typing:settings:v1';

/** Local calendar day as YYYY-MM-DD, `offset` days from today (same rule as the app). */
function dayKey(offset = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

async function readKey(page: Page, key: string) {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), key);
}

async function writeKey(page: Page, key: string, value: unknown) {
  await page.evaluate(([k, v]) => localStorage.setItem(k as string, JSON.stringify(v)), [key, value]);
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'page is wider than the viewport').toBeLessThanOrEqual(0);
}

/** Finishes one sentence in "Sentence" mode (the page must already be open). */
async function finishOneSentence(page: Page) {
  await chooseMode(page, 'quote', en);
  const input = page.getByLabel(en.test.inputLabel);
  await expect(input).toBeVisible();
  const target = (await input.locator('xpath=preceding-sibling::div[1]').textContent()) ?? '';
  expect(target.length).toBeGreaterThan(20);
  await input.pressSequentially(target);
  await expect(page.getByRole('heading', { name: en.results.title })).toBeAttached();
}

test('a new visitor sees no streak badge; the first finished test starts a streak', async ({ page }) => {
  await page.goto('/en/');
  await expect(modeSelect(page, en)).toBeVisible();
  await expect(page.getByTestId('streak-badge')).toHaveCount(0);

  await finishOneSentence(page);
  await expect.poll(() => readKey(page, STREAK_KEY)).toEqual({
    lastDay: dayKey(),
    current: 1,
    best: 1,
    todayCount: 1,
  });

  // Back on the test screen the badge shows the streak (no goal chosen, so no progress bar).
  await page.getByRole('button', { name: en.results.tryAgain }).click();
  const badge = page.getByRole('group', { name: en.streak.label });
  await expect(badge).toBeVisible();
  await expect(badge.getByTestId('streak-days')).toHaveText(en.streak.days.replace('{count}', '1'));
  await expect(page.getByTestId('goal-progress')).toHaveCount(0);
  await expectNoHorizontalScroll(page);
});

test('a streak from yesterday continues today and is shown after a reload', async ({ page }) => {
  await page.goto('/en/');
  await writeKey(page, STREAK_KEY, { lastDay: dayKey(-1), current: 4, best: 6, todayCount: 2 });
  await page.reload();

  // Still alive, with no tests yet today.
  await expect(page.getByTestId('streak-days')).toHaveText(en.streak.days.replace('{count}', '4'));

  await finishOneSentence(page);
  await expect.poll(() => readKey(page, STREAK_KEY)).toEqual({
    lastDay: dayKey(),
    current: 5,
    best: 6,
    todayCount: 1,
  });
});

test('a streak with a skipped day is not shown and starts over with the next test', async ({ page }) => {
  await page.goto('/en/');
  await writeKey(page, STREAK_KEY, { lastDay: dayKey(-3), current: 9, best: 9, todayCount: 1 });
  await page.reload();
  await expect(modeSelect(page, en)).toBeVisible();
  await expect(page.getByTestId('streak-badge')).toHaveCount(0);

  await finishOneSentence(page);
  await expect.poll(() => readKey(page, STREAK_KEY)).toEqual({
    lastDay: dayKey(),
    current: 1,
    best: 9,
    todayCount: 1,
  });
});

test('a damaged streak value is ignored instead of breaking the page', async ({ page }) => {
  await page.goto('/en/');
  await writeKey(page, STREAK_KEY, { lastDay: 'tomorrow', current: 'many' });
  await page.reload();
  await expect(modeSelect(page, en)).toBeVisible();
  await expect(page.getByTestId('streak-badge')).toHaveCount(0);
});

test('the daily goal is chosen on the settings page and its progress shows on the home page', async ({ page }) => {
  await page.goto('/id/settings/');
  const group = page.getByRole('group', { name: id.settings.dailyGoalLabel });
  await expect(group.getByRole('button', { name: id.settings.dailyGoalOff, exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  const one = group.getByRole('button', { name: id.settings.dailyGoalTests.replace('{count}', '1'), exact: true });
  await one.click();
  await expect(one).toHaveAttribute('aria-pressed', 'true');
  expect((await readKey(page, SETTINGS_KEY)).dailyGoal).toBe(1);
  await expectNoHorizontalScroll(page);

  // Goal 1 shows "0 of 1" before any test; after one test it is reached.
  await page.goto('/en/');
  await writeKey(page, SETTINGS_KEY, { dailyGoal: 1 });
  await page.reload();
  const progress = page.getByTestId('goal-progress');
  await expect(progress).toContainText(en.streak.todayProgress.replace('{done}', '0').replace('{goal}', '1'));

  await finishOneSentence(page);
  await page.getByRole('button', { name: en.results.tryAgain }).click();
  await expect(progress).toContainText(en.streak.todayProgress.replace('{done}', '1').replace('{goal}', '1'));
  await expect(progress).toContainText(en.streak.goalReached);
});

test('the streak is part of the exported data', async ({ page }) => {
  await page.goto('/en/settings/');
  await writeKey(page, STREAK_KEY, { lastDay: dayKey(), current: 2, best: 3, todayCount: 1 });
  await page.reload();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: en.dataTools.exportButton }).click(),
  ]);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const file = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  expect(file.data['streak:v1']).toEqual({ lastDay: dayKey(), current: 2, best: 3, todayCount: 1 });
});
