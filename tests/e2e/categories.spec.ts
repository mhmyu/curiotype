import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { en } from '../../src/i18n/ui/en';
import { id } from '../../src/i18n/ui/id';
import { chooseMode, contentLangSelect, openFilters } from './helpers';

const ROOT = join(process.cwd(), 'src/content');
const INTERFACES = [
  { code: 'en', ui: en },
  { code: 'id', ui: id },
] as const;

interface RegistryEntry {
  labels: Record<string, string>;
  order?: number;
}

/** What the page should list for a sentence language: the files on disk, ordered and labelled by categories.json. */
async function expectedCategories(contentLang: string, uiLang: string) {
  const registry = JSON.parse(await readFile(join(ROOT, 'categories.json'), 'utf8')) as Record<string, RegistryEntry>;
  const files = (await readdir(join(ROOT, 'sentences', contentLang)))
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.replace(/\.json$/, ''));
  return Object.entries(registry)
    .filter(([key]) => files.includes(key))
    .sort(([a, x], [b, y]) => (x.order ?? 1000) - (y.order ?? 1000) || a.localeCompare(b))
    .map(([key, entry]) => ({ key, label: entry.labels[uiLang] }));
}

/** Id of the first sentence of the sentence language, to seed a favourite. */
async function firstSentenceId(contentLang: string): Promise<string> {
  const dir = join(ROOT, 'sentences', contentLang);
  const file = (await readdir(dir)).filter((name) => name.endsWith('.json')).sort()[0];
  const data = JSON.parse(await readFile(join(dir, file), 'utf8')) as { items: { id: string }[] };
  return data.items[0].id;
}

async function readTarget(page: Page, ui: typeof en): Promise<string> {
  const input = page.getByLabel(ui.test.inputLabel);
  await expect(input).toBeVisible();
  return (await input.locator('xpath=preceding-sibling::div[1]').textContent()) ?? '';
}

for (const { code, ui } of INTERFACES) {
  test.describe(`/${code}/`, () => {
    test('the home category filter lists the categories of the sentence language, in file order, with file labels', async ({
      page,
    }) => {
      await page.goto(`/${code}/`);
      const select = (await openFilters(page, ui)).getByLabel(ui.test.categoryLabel);
      const expected = await expectedCategories(code, code);
      expect(expected.length).toBeGreaterThan(0);
      await expect(select.getByRole('option')).toHaveText([ui.test.all, ...expected.map((c) => c.label)]);
      const values = await select.getByRole('option').evaluateAll((options) => options.map((o) => (o as HTMLOptionElement).value));
      expect(values).toEqual(['all', ...expected.map((c) => c.key)]);
    });

    test('the collection filter lists the same categories', async ({ page }) => {
      // The filter only shows once the collection has a sentence, so save one first.
      const sentenceId = await firstSentenceId(code);
      await page.addInitScript(
        ([key, id]) => localStorage.setItem(key, JSON.stringify([{ id, savedAt: 1 }])),
        [`typing:favorites:v1:${code}`, sentenceId],
      );
      await page.goto(`/${code}/collection/`);
      const select = page.getByLabel(ui.test.categoryLabel);
      const expected = await expectedCategories(code, code);
      await expect(select.getByRole('option')).toHaveText([ui.test.all, ...expected.map((c) => c.label)]);
    });

    test('the statistics page shows a row per category with the file label', async ({ page }) => {
      // The rows only show once there is a finished test, so seed one.
      const entry = {
        id: 'seed',
        finishedAt: 1,
        contentLang: code,
        mode: 'quote',
        durationSec: null,
        category: 'all',
        difficulty: 'all',
        wpm: 40,
        rawWpm: 45,
        accuracy: 95,
        consistency: 80,
        errors: 2,
        categoryChars: { science: 100 },
      };
      await page.addInitScript(
        ([key, value]) => localStorage.setItem(key as string, JSON.stringify(value)),
        ['typing:history:v1', [entry]] as const,
      );
      await page.goto(`/${code}/stats/`);
      const expected = await expectedCategories(code, code);
      for (const { key, label } of expected) {
        await expect(page.getByTestId(`accuracy-${key}`)).toContainText(label);
        await expect(page.getByTestId(`coverage-${key}`)).toContainText(label);
      }
      await expect(page.locator('[data-testid^="accuracy-"]')).toHaveCount(expected.length);
    });

    test('the result card labels the sentence with its category label', async ({ page }) => {
      await page.goto(`/${code}/`);
      await chooseMode(page, 'quote', ui);
      await page.getByLabel(ui.test.inputLabel).pressSequentially(await readTarget(page, ui));
      await expect(page.getByRole('heading', { name: ui.results.learnedTitle })).toBeVisible();
      const labels = (await expectedCategories(code, code)).map((c) => c.label);
      const card = page.locator('[data-sentence-id]').first();
      await expect(card).toContainText(new RegExp(labels.join('|')));
    });
  });
}

test('changing the sentence language keeps the category filter valid', async ({ page }) => {
  await page.goto('/en/');
  const select = (await openFilters(page)).getByLabel(en.test.categoryLabel);
  await select.selectOption('history');
  await expect(select).toHaveValue('history');

  await contentLangSelect(page).selectOption('id');
  const expected = await expectedCategories('id', 'en');
  await expect(select.getByRole('option')).toHaveText([en.test.all, ...expected.map((c) => c.label)]);
  const value = await select.inputValue();
  expect(['all', ...expected.map((c) => c.key)]).toContain(value);
});
