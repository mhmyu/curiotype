import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { en } from '../../src/i18n/ui/en';

const HISTORY_KEY = 'typing:history:v1';
const BESTS_KEY = 'typing:personal-bests:v1';
const SEEN_KEY_EN = 'typing:seen:v1:en';
const KEY_STATS_KEY_EN = 'typing:key-stats:v1:en';
const KEY_STATS_KEY_ID = 'typing:key-stats:v1:id';
const SETTINGS_KEY = 'typing:settings:v1';
const CATEGORIES = ['science', 'history', 'technology', 'health'] as const;

/** Ids of every sentence of one sentence language (tests run from the project root). */
async function readSentenceIds(code: string): Promise<Record<string, string[]>> {
  const byCategory: Record<string, string[]> = {};
  for (const category of CATEGORIES) {
    const text = await readFile(
      join(process.cwd(), 'src/content/sentences', code, `${category}.json`),
      'utf8',
    );
    byCategory[category] = (JSON.parse(text) as { items: { id: string }[] }).items.map(
      (item) => item.id,
    );
  }
  return byCategory;
}

function historyEntry(overrides: Record<string, unknown>) {
  return {
    id: 'x',
    finishedAt: 1,
    contentLang: 'en',
    mode: 'time',
    durationSec: 60,
    category: 'all',
    difficulty: 'all',
    wpm: 40,
    rawWpm: 45,
    accuracy: 95,
    consistency: 80,
    errors: 2,
    ...overrides,
  };
}

/** Newest first, like the app stores it. Totals: 3 tests, 60 + 60 + 20 seconds = 140 s. */
const SEEDED_HISTORY = [
  historyEntry({
    id: 'c',
    finishedAt: 3000,
    mode: 'quote',
    durationSec: null,
    wpm: 30,
    rawWpm: 60,
    accuracy: 90,
    categoryChars: { science: 100 },
  }),
  historyEntry({
    id: 'b',
    finishedAt: 2000,
    wpm: 50,
    accuracy: 100,
    categoryChars: { history: 200 },
  }),
  historyEntry({
    id: 'a',
    finishedAt: 1000,
    wpm: 40,
    accuracy: 96,
    categoryChars: { science: 100, history: 100 },
  }),
];

async function seed(page: Page, values: Record<string, unknown>) {
  await page.goto('/en/stats/');
  await expect(page.getByRole('heading', { level: 2, name: en.stats.totalsTitle })).toBeVisible();
  await page.evaluate((entries) => {
    for (const [key, value] of entries) localStorage.setItem(key, JSON.stringify(value));
  }, Object.entries(values));
  await page.reload();
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'page is wider than the viewport').toBeLessThanOrEqual(0);
}

test('the statistics page is in the navigation and explains an empty history', async ({ page }) => {
  await page.goto('/en/');
  const nav = page.getByRole('navigation', { name: en.nav.main });
  await nav.getByRole('link', { name: en.nav.stats }).click();

  await expect(page).toHaveURL(/\/en\/stats\/$/);
  await expect(nav.getByRole('link', { name: en.nav.stats })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { level: 1, name: en.stats.title })).toBeVisible();
  await expect(page.getByTestId('stats-empty')).toHaveText(en.stats.emptyHistory);
  await expect(page.getByTestId('stat-tests')).toHaveText('0');
  await expect(page.getByRole('heading', { level: 2, name: en.stats.trendTitle })).toHaveCount(0);
  // No tests and no key counts: the weak-keys section stays hidden.
  await expect(page.getByRole('heading', { level: 2, name: en.stats.keysTitle })).toHaveCount(0);
  await expectNoHorizontalScroll(page);
});

test('totals, trend, accuracy per category and records come from the saved data', async ({ page }) => {
  await seed(page, {
    [HISTORY_KEY]: SEEDED_HISTORY,
    [BESTS_KEY]: { 'en:time:60': 50, 'en:quote:na': 30, 'id:time:60': 99 },
  });

  // Totals: 3 tests; 140 s is shown as whole minutes, formatted by the browser.
  await expect(page.getByTestId('stat-tests')).toHaveText('3');
  const expectedTime = await page.evaluate(() =>
    new Intl.NumberFormat('en', { style: 'unit', unit: 'minute', unitDisplay: 'short' }).format(2),
  );
  await expect(page.getByTestId('stat-time')).toHaveText(expectedTime);

  // The trend starts with the mode of the newest test (Sentence): one test.
  await expect(page.getByTestId('trend-latest')).toHaveText('30');
  await expect(page.getByTestId('trend-average')).toHaveText('30');
  await expect(page.getByTestId('trend-best')).toHaveText('30');

  // Choosing "Time 60" shows its two tests: 40 then 50.
  await page
    .getByLabel(en.stats.bucketLabel)
    .selectOption({ label: `${en.test.modes.time} 60${en.test.secondsSuffix}` });
  await expect(page.getByTestId('trend-latest')).toHaveText('50');
  await expect(page.getByTestId('trend-average')).toHaveText('45');
  await expect(page.getByTestId('trend-best')).toHaveText('50');
  await expect(page.getByRole('img', { name: /Latest 50, average 45, best 50/ })).toBeVisible();

  // Accuracy per category: weighted by characters; categories without data say so.
  await expect(page.getByTestId('accuracy-science')).toContainText('93%');
  await expect(page.getByTestId('accuracy-history')).toContainText('98.7%');
  await expect(page.getByTestId('accuracy-technology')).toContainText(en.stats.noData);

  // Records of this sentence language only.
  const bests = page.getByTestId('stats-bests').getByRole('listitem');
  await expect(bests).toHaveCount(2);
  await expect(page.getByTestId('stats-bests')).not.toContainText('99');

  await expectNoHorizontalScroll(page);
});

test('coverage counts the sentences typed to the end, per category', async ({ page }) => {
  const ids = await readSentenceIds('en');
  const total = Object.values(ids).reduce((sum, list) => sum + list.length, 0);
  const typed = [ids.science?.[0], ids.science?.[1], ids.health?.[0], 'en-science-999'];
  if (typed.some((id) => id === undefined)) throw new Error('fixture: the corpus is too small');

  await seed(page, { [SEEN_KEY_EN]: typed });

  // The unknown id is ignored: 3 sentences count.
  await expect(page.getByTestId('stat-learned')).toHaveText('3');
  const percent = Math.round((3 / total) * 100);
  await expect(page.getByTestId('coverage-total')).toHaveText(
    en.stats.coverageTotal
      .replace('{seen}', '3')
      .replace('{total}', String(total))
      .replace('{percent}', String(percent)),
  );
  await expect(page.getByTestId('coverage-science')).toContainText(
    en.stats.coverageRow.replace('{seen}', '2').replace('{total}', String(ids.science?.length)),
  );
  await expect(page.getByTestId('coverage-history')).toContainText(
    en.stats.coverageRow.replace('{seen}', '0').replace('{total}', String(ids.history?.length)),
  );
});

test('the statistics follow the sentence language, not the page address', async ({ page }) => {
  await seed(page, {
    [HISTORY_KEY]: [
      ...SEEDED_HISTORY,
      historyEntry({ id: 'z', finishedAt: 9000, contentLang: 'id', wpm: 77 }),
    ],
  });
  // English sentences: the Indonesian test is not counted.
  await expect(page.getByTestId('stat-tests')).toHaveText('3');

  await page.evaluate((key) => {
    localStorage.setItem(key, JSON.stringify({ contentLang: 'id' }));
  }, SETTINGS_KEY);
  await page.reload();

  // English page, Indonesian sentences: only the one Indonesian test.
  await expect(page).toHaveURL(/\/en\/stats\/$/);
  await expect(page.getByTestId('stat-tests')).toHaveText('1');
  await expect(page.getByTestId('trend-latest')).toHaveText('77');
});

test('the heat map and the weak keys come from the saved key counts', async ({ page }) => {
  await seed(page, {
    [KEY_STATS_KEY_EN]: {
      e: { attempts: 100, errors: 12 }, // 12%: darkest level
      t: { attempts: 50, errors: 1 }, // 2%: level 1
      a: { attempts: 200, errors: 0 }, // 0%: never wrong, not weak
      s: { attempts: 10, errors: 5 }, // too few attempts: not judged
      ' ': { attempts: 300, errors: 60 }, // the space bar is never listed
    },
  });

  // Key counts alone are enough to show the section (no test in the history).
  await expect(page.getByTestId('stats-empty')).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: en.stats.keysTitle })).toBeVisible();

  const heatmap = page.getByTestId('key-heatmap');
  await expect(heatmap.getByTestId('key-e')).toHaveAttribute('data-level', '3');
  await expect(heatmap.getByTestId('key-e')).toContainText('12');
  await expect(heatmap.getByTestId('key-e')).toHaveAttribute(
    'aria-label',
    en.stats.keyCellAria.replace('{key}', 'E').replace('{percent}', '12').replace('{attempts}', '100'),
  );
  await expect(heatmap.getByTestId('key-t')).toHaveAttribute('data-level', '1');
  await expect(heatmap.getByTestId('key-a')).toHaveAttribute('data-level', '0');
  await expect(heatmap.getByTestId('key-s')).toHaveAttribute('data-level', 'none');
  await expect(heatmap.getByTestId('key-q')).toHaveAttribute('data-level', 'none');
  await expect(heatmap.locator('[data-testid^="key-"]')).toHaveCount(26);

  // Weak keys: worst first; no zero-error key, no under-sampled key, no space bar.
  const weak = page.getByTestId('weak-keys').getByRole('listitem');
  await expect(weak).toHaveCount(2);
  await expect(weak.nth(0)).toContainText('12%');
  await expect(weak.nth(0)).toContainText(
    en.stats.keysWeakRow.replace('{errors}', '12').replace('{attempts}', '100'),
  );
  await expect(weak.nth(1)).toContainText('2%');

  await expectNoHorizontalScroll(page);
});

test('without a weak key the page says what a key needs to be listed', async ({ page }) => {
  await seed(page, { [KEY_STATS_KEY_EN]: { a: { attempts: 40, errors: 0 } } });
  await expect(page.getByTestId('weak-keys-empty')).toHaveText(
    en.stats.keysWeakEmpty.replace('{min}', '30'),
  );
  await expect(page.getByTestId('key-a')).toHaveAttribute('data-level', '0');
});

test('the key counts follow the sentence language', async ({ page }) => {
  await seed(page, {
    [KEY_STATS_KEY_EN]: { e: { attempts: 100, errors: 12 } },
    [KEY_STATS_KEY_ID]: { k: { attempts: 60, errors: 30 } },
  });
  await expect(page.getByTestId('key-e')).toHaveAttribute('data-level', '3');
  await expect(page.getByTestId('key-k')).toHaveAttribute('data-level', 'none');

  await page.evaluate((key) => {
    localStorage.setItem(key, JSON.stringify({ contentLang: 'id' }));
  }, SETTINGS_KEY);
  await page.reload();

  await expect(page.getByTestId('key-k')).toHaveAttribute('data-level', '3');
  await expect(page.getByTestId('key-e')).toHaveAttribute('data-level', 'none');
  await expect(page.getByTestId('weak-key-k')).toContainText('50%');
});
