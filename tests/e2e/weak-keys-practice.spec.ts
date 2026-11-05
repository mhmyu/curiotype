import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { en } from '../../src/i18n/ui/en';
import { chooseMode, modeSelect, openFilters } from './helpers';

const KEY_STATS_KEY = 'typing:key-stats:v1:en';
// A practice pool holds at least this many sentences (see MIN_PRACTICE_POOL).
const MIN_POOL = 5;

interface CorpusSentence {
  text: string;
}

async function readTarget(page: Page): Promise<string> {
  const input = page.getByLabel(en.test.inputLabel);
  await expect(input).toBeVisible();
  return (await input.locator('xpath=preceding-sibling::div[1]').textContent()) ?? '';
}

/** A letter that is in enough sentences to fill a practice pool, but not in all of them. */
async function pickPracticeLetter(page: Page): Promise<string> {
  const response = await page.request.get('/data/en/sentences.json');
  const sentences = (await response.json()) as CorpusSentence[];
  for (const letter of 'zqxjkvwbfgpy') {
    const count = sentences.filter((s) => s.text.toLowerCase().includes(letter)).length;
    if (count >= MIN_POOL && count < sentences.length) return letter;
  }
  throw new Error('No suitable letter in the sample corpus');
}

async function openSentenceMode(page: Page) {
  await page.goto('/en/');
  await expect(modeSelect(page, en)).toBeVisible();
  await chooseMode(page, 'quote', en);
  await openFilters(page);
}

test('practice is off by default and explains itself when no key is weak yet', async ({ page }) => {
  await openSentenceMode(page);
  const toggle = page.getByRole('button', { name: en.test.focusWeakKeys, exact: true });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('practice-note')).toHaveCount(0);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('practice-note')).toHaveText(
    en.test.focusNoData.replace('{min}', '30'),
  );
  // The test still starts, with ordinary sentences.
  expect((await readTarget(page)).length).toBeGreaterThan(20);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('practice-note')).toHaveCount(0);
});

test('practice picks sentences that contain the weak key, and can be turned off', async ({
  page,
}) => {
  await page.goto('/en/');
  const letter = await pickPracticeLetter(page);
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key, value),
    [KEY_STATS_KEY, JSON.stringify({ [letter]: { attempts: 100, errors: 40 } })],
  );
  await openSentenceMode(page);

  const toggle = page.getByRole('button', { name: en.test.focusWeakKeys, exact: true });
  await toggle.click();
  await expect(page.getByTestId('practice-note')).toHaveText(
    en.test.focusActive.replace('{keys}', letter.toUpperCase()),
  );

  for (let i = 0; i < 8; i++) {
    const target = await readTarget(page);
    expect(target.toLowerCase(), `sentence ${i} has no "${letter}"`).toContain(letter);
    await page.getByRole('button', { name: en.test.restart, exact: true }).click();
  }

  await toggle.click();
  await expect(page.getByTestId('practice-note')).toHaveCount(0);
});

test('practice does not overflow the page at 390px', async ({ page }) => {
  await openSentenceMode(page);
  await page.getByRole('button', { name: en.test.focusWeakKeys, exact: true }).click();
  await expect(page.getByTestId('practice-note')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'page is wider than the viewport').toBeLessThanOrEqual(0);
});
