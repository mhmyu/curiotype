import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { en } from '../../src/i18n/ui/en';
import type { Sentence } from '../../src/lib/types';

/**
 * The page must not move when the sentences arrive: the placeholder (controls, time bar, typing
 * box, description, Restart row, room for the fact of the day) has the size of the real thing.
 * The sentence file is held back so the placeholder is on screen, its positions are read, the file
 * is released and the same positions are read again.
 *
 * The file is cut down to its shortest sentences, so the height of the fact of the day does not
 * depend on the day this runs (a longer fact than the reserved room only moves the history).
 */
const SHORT_FACTS = 8;

async function holdSentences(page: Page): Promise<() => void> {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/data/en/sentences.json', async (route) => {
    const response = await route.fetch();
    const all = (await response.json()) as Sentence[];
    const shortest = [...all]
      .sort((a, b) => a.text.length + a.explanation.length - (b.text.length + b.explanation.length))
      .slice(0, SHORT_FACTS);
    await gate;
    await route.fulfill({ response, json: shortest });
  });
  return release;
}

async function top(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  expect(box, 'element is on the page').not.toBeNull();
  return Math.round((box as { y: number }).y + (await locator.page().evaluate(() => window.scrollY)));
}

async function positions(page: Page) {
  return {
    controls: await top(page.getByTestId('controls-row')),
    timeBar: await top(page.getByTestId('time-bar')),
    restart: await top(page.getByRole('button', { name: en.test.restart })),
    factSlot: await top(page.getByTestId('daily-fact-slot')),
    history: await top(page.getByRole('heading', { name: en.history.title })),
    footer: await top(page.locator('footer')),
  };
}

for (const width of [390, 320]) {
  test(`nothing moves when the sentences arrive (new user, ${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    const release = await holdSentences(page);
    await page.goto('/en/');

    await expect(page.getByTestId('typing-skeleton')).toBeVisible();
    // Disabled for real until the sentences are in.
    await expect(page.getByRole('combobox', { name: en.test.modeLabel })).toBeDisabled();
    const before = await positions(page);

    release();
    await expect(page.getByTestId('daily-fact')).toBeVisible();
    await expect(page.getByTestId('typing-skeleton')).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: en.test.modeLabel })).toBeEnabled();
    const after = await positions(page);

    expect(after).toEqual(before);
  });
}

test('nothing above the fact of the day moves for a returning user', async ({ page }) => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  await page.addInitScript((today) => {
    localStorage.setItem(
      'typing:streak:v1',
      JSON.stringify({ lastDay: today, current: 5, best: 7, todayCount: 1 }),
    );
    localStorage.setItem('typing:settings:v1', JSON.stringify({ dailyGoal: 3 }));
  }, day);
  const release = await holdSentences(page);
  await page.goto('/en/');

  await expect(page.getByTestId('typing-skeleton')).toBeVisible();
  const before = await positions(page);

  release();
  await expect(page.getByTestId('streak-badge')).toBeVisible();
  const after = await positions(page);

  // The streak badge sits below the fact of the day, so everything above it stays put.
  expect({ ...after, history: 0, footer: 0 }).toEqual({ ...before, history: 0, footer: 0 });
});
