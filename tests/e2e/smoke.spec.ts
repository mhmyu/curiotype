import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { en } from '../../src/i18n/ui/en';
import { id } from '../../src/i18n/ui/id';
import { chooseMode, modeSelect } from './helpers';

const LANGUAGES = [
  { code: 'id', ui: id },
  { code: 'en', ui: en },
] as const;

const HISTORY_KEY = 'typing:history:v1';
const PERSONAL_BESTS_KEY = 'typing:personal-bests:v1';

/** Collects console errors, uncaught exceptions and failed HTTP responses. */
function trackProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console error: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`uncaught exception: ${error.message}`));
  page.on('response', (response) => {
    if (response.status() >= 400) problems.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  return problems;
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'page is wider than the viewport').toBeLessThanOrEqual(0);
}

for (const { code, ui } of LANGUAGES) {
  test.describe(`/${code}/`, () => {
    test('loads and hydrates without problems', async ({ page }) => {
      const problems = trackProblems(page);
      await page.goto(`/${code}/`);

      await expect(page.locator('html')).toHaveAttribute('lang', code);
      await expect(page.getByRole('heading', { level: 1, name: ui.meta.homeHeading })).toBeVisible();
      await expect(page.getByText(ui.meta.tagline)).toBeVisible();
      // The input only exists after the island hydrated and loaded the sentences.
      await expect(page.getByLabel(ui.test.inputLabel)).toBeVisible();
      await expect(modeSelect(page, ui)).toBeVisible();

      await expectNoHorizontalScroll(page);
      expect(problems).toEqual([]);
    });

    test('finishes a sentence, shows the result and saves it', async ({ page }) => {
      const problems = trackProblems(page);
      await page.goto(`/${code}/`);

      await chooseMode(page, 'quote', ui);
      const input = page.getByLabel(ui.test.inputLabel);
      await expect(input).toBeVisible();

      // The input is overlaid on the target text; the text is the sibling just before it.
      const target = (await input.locator('xpath=preceding-sibling::div[1]').textContent()) ?? '';
      expect(target.length).toBeGreaterThan(20);

      await input.pressSequentially(target);

      await expect(page.getByRole('heading', { name: ui.results.title })).toBeAttached();
      await expect(page.getByText(ui.results.personalBest, { exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: ui.results.learnedTitle })).toBeVisible();
      await expect(page.getByRole('link', { name: /: / }).first()).toHaveAttribute('href', /^https:\/\//);
      await expectNoHorizontalScroll(page);

      const stored = await page.evaluate(
        ([historyKey, bestsKey]) => ({
          history: JSON.parse(localStorage.getItem(historyKey) ?? 'null'),
          bests: JSON.parse(localStorage.getItem(bestsKey) ?? 'null'),
        }),
        [HISTORY_KEY, PERSONAL_BESTS_KEY],
      );
      expect(stored.history).toHaveLength(1);
      expect(stored.history[0]).toMatchObject({ contentLang: code, mode: 'quote', accuracy: 100 });
      expect(Object.keys(stored.bests)).toEqual([`${code}:quote:na`]);

      // The result survives a reload and shows in the history list.
      await page.reload();
      await expect(page.getByLabel(ui.test.inputLabel)).toBeVisible();
      await expect(page.getByRole('heading', { name: ui.history.title })).toBeVisible();
      await expect(page.getByText(ui.history.empty, { exact: true })).toHaveCount(0);

      expect(problems).toEqual([]);
    });
  });
}
