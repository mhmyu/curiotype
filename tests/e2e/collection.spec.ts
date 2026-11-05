import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { en } from '../../src/i18n/ui/en';
import { chooseMode, contentLangSelect } from './helpers';

const FAVORITES_KEY_EN = 'typing:favorites:v1:en';
const FAVORITES_KEY_ID = 'typing:favorites:v1:id';
const SETTINGS_KEY = 'typing:settings:v1';

/** Reads a sentence file of the corpus (tests run from the project root). */
async function readSentences(code: string, category: string) {
  const text = await readFile(join(process.cwd(), 'src/content/sentences', code, `${category}.json`), 'utf8');
  return JSON.parse(text) as { items: { id: string; text: string }[] };
}

async function readKey(page: Page, key: string) {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), key);
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'page is wider than the viewport').toBeLessThanOrEqual(0);
}

/** Finishes one sentence in "Sentence" mode and returns the sentence text. */
async function finishOneSentence(page: Page): Promise<string> {
  await page.goto('/en/');
  await chooseMode(page, 'quote', en);
  const input = page.getByLabel(en.test.inputLabel);
  await expect(input).toBeVisible();
  const target = (await input.locator('xpath=preceding-sibling::div[1]').textContent()) ?? '';
  expect(target.length).toBeGreaterThan(20);
  await input.pressSequentially(target);
  await expect(page.getByRole('heading', { name: en.results.title })).toBeAttached();
  return target;
}

test('a sentence saved with the star shows in the collection and can be removed', async ({ page }) => {
  const target = await finishOneSentence(page);

  const star = page.getByRole('button', { name: en.results.saveToCollection });
  await expect(star).toHaveAttribute('aria-pressed', 'false');
  await star.click();
  await expect(star).toHaveAttribute('aria-pressed', 'true');

  const stored = await readKey(page, FAVORITES_KEY_EN);
  expect(stored).toHaveLength(1);
  expect(stored[0].id).toMatch(/^en-[a-z]+-\d{3}$/);

  // The collection lists it; the navigation marks the page as current.
  const nav = page.getByRole('navigation', { name: en.nav.main });
  await nav.getByRole('link', { name: en.nav.collection }).click();
  await expect(page).toHaveURL(/\/en\/collection\/$/);
  await expect(nav.getByRole('link', { name: en.nav.collection })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { level: 1, name: en.collection.title })).toBeVisible();
  await expect(page.getByText(target, { exact: true })).toBeVisible();
  await expect(page.getByTestId('collection-count')).toHaveText(en.collection.count.replace('{count}', '1'));
  await expect(page.getByRole('link', { name: /: / }).first()).toHaveAttribute('href', /^https:\/\//);
  await expectNoHorizontalScroll(page);

  // Removing it empties the collection and the stored list.
  await page.getByRole('button', { name: en.collection.remove }).click();
  await expect(page.getByText(en.collection.empty, { exact: true })).toBeVisible();
  expect(await readKey(page, FAVORITES_KEY_EN)).toBeNull();
});

test('the star can be switched off again and the choice survives a reload', async ({ page }) => {
  await finishOneSentence(page);
  const star = page.getByRole('button', { name: en.results.saveToCollection });
  await star.click();
  await expect(star).toHaveAttribute('aria-pressed', 'true');
  await star.click();
  await expect(star).toHaveAttribute('aria-pressed', 'false');
  expect(await readKey(page, FAVORITES_KEY_EN)).toBeNull();

  await star.click();
  await expect(star).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/en/collection/');
  await expect(page.getByTestId('collection-count')).toBeVisible();
});

test('an empty collection explains how to save a sentence', async ({ page }) => {
  await page.goto('/en/collection/');
  await expect(page.getByText(en.collection.empty, { exact: true })).toBeVisible();
});

test('saved ids that no longer exist in the sentences are cleaned up', async ({ page }) => {
  await page.goto('/en/collection/');
  await expect(page.getByText(en.collection.empty, { exact: true })).toBeVisible();
  await page.evaluate((key) => {
    localStorage.setItem(key, JSON.stringify([{ id: 'en-science-999', savedAt: 1 }]));
  }, FAVORITES_KEY_EN);

  await page.reload();
  await expect(page.getByText(en.collection.empty, { exact: true })).toBeVisible();
  expect(await readKey(page, FAVORITES_KEY_EN)).toBeNull();
});

test('the collection follows the sentence language, not the page address', async ({ page }) => {
  const science = await readSentences('id', 'science');
  const first = science.items[0];
  if (!first) throw new Error('fixture: the id science file has no sentences');

  await page.goto('/en/collection/');
  await expect(page.getByText(en.collection.empty, { exact: true })).toBeVisible();
  await page.evaluate(
    ([favoritesKey, settingsKey, sentenceId]) => {
      localStorage.setItem(favoritesKey, JSON.stringify([{ id: sentenceId, savedAt: 1 }]));
      localStorage.setItem(settingsKey, JSON.stringify({ contentLang: 'id' }));
    },
    [FAVORITES_KEY_ID, SETTINGS_KEY, first.id],
  );

  // English interface, Indonesian sentences: the saved Indonesian sentence is listed.
  await page.reload();
  await expect(page.getByText(first.text, { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/en\/collection\/$/);
});

test('the category filter narrows the list', async ({ page }) => {
  const history = await readSentences('en', 'history');
  const science = await readSentences('en', 'science');
  const h = history.items[0];
  const s = science.items[0];
  if (!h || !s) throw new Error('fixture: missing sentences');

  await page.goto('/en/collection/');
  await expect(page.getByText(en.collection.empty, { exact: true })).toBeVisible();
  await page.evaluate(
    ([key, historyId, scienceId]) => {
      localStorage.setItem(
        key,
        JSON.stringify([
          { id: historyId, savedAt: 2 },
          { id: scienceId, savedAt: 1 },
        ]),
      );
    },
    [FAVORITES_KEY_EN, h.id, s.id],
  );
  await page.reload();

  await expect(page.getByText(h.text, { exact: true })).toBeVisible();
  await expect(page.getByText(s.text, { exact: true })).toBeVisible();

  await page.getByLabel(en.test.categoryLabel).selectOption('science');
  await expect(page.getByText(s.text, { exact: true })).toBeVisible();
  await expect(page.getByText(h.text, { exact: true })).toHaveCount(0);

  await page.getByLabel(en.test.categoryLabel).selectOption('technology');
  await expect(page.getByText(en.collection.emptyFilter, { exact: true })).toBeVisible();
});

/** Opens the collection with the given saved sentences (newest first by `savedAt`). */
async function openCollectionWith(page: Page, entries: { id: string; savedAt: number }[]) {
  await page.goto('/en/collection/');
  await expect(page.getByText(en.collection.empty, { exact: true })).toBeVisible();
  await page.evaluate(
    ([key, value]) => localStorage.setItem(key as string, JSON.stringify(value)),
    [FAVORITES_KEY_EN, entries],
  );
  await page.reload();
  await expect(page.getByTestId('collection-count')).toBeVisible();
}

test('Undo puts a removed sentence back with its original time, and the row has no timer', async ({ page }) => {
  const history = await readSentences('en', 'history');
  const science = await readSentences('en', 'science');
  const h = history.items[0];
  const s = science.items[0];
  if (!h || !s) throw new Error('fixture: missing sentences');
  const saved = [
    { id: h.id, savedAt: 200 },
    { id: s.id, savedAt: 100 },
  ];
  await openCollectionWith(page, saved);

  const row = page.getByTestId('undo-row');
  await expect(row).toHaveAttribute('role', 'status');
  await expect(row).toHaveText('');

  // Remove the newest sentence: the row appears with the message and the Undo button.
  await page.getByText(h.text, { exact: true }).locator('xpath=ancestor::li[1]').getByRole('button', { name: en.collection.remove }).click();
  await expect(page.getByText(h.text, { exact: true })).toHaveCount(0);
  await expect(row).toContainText(en.collection.removed);
  const undo = row.getByRole('button', { name: en.collection.undo });
  await expect(undo).toBeVisible();
  const box = await undo.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

  // The focus is on the count line, and Tab goes straight to Undo.
  await expect(page.getByTestId('collection-count')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(undo).toBeFocused();

  // No timer: the row is still there after a while.
  await page.waitForTimeout(2500);
  await expect(undo).toBeVisible();

  await page.keyboard.press('Enter');
  await expect(page.getByText(h.text, { exact: true })).toBeVisible();
  await expect(row).toHaveText('');
  expect(await readKey(page, FAVORITES_KEY_EN)).toEqual(saved);

  // The restored card keeps its old place (newest first) and its Remove button has the focus.
  const card = (text: string) => page.getByText(text, { exact: true }).locator('xpath=ancestor::li[1]');
  const hBox = await card(h.text).boundingBox();
  const sBox = await card(s.text).boundingBox();
  expect(hBox?.y ?? 0).toBeLessThan(sBox?.y ?? 0);
  await expect(card(h.text).getByRole('button', { name: en.collection.remove })).toBeFocused();
  await expectNoHorizontalScroll(page);
});

test('only the last removal can be undone; an earlier one becomes permanent', async ({ page }) => {
  const history = await readSentences('en', 'history');
  const science = await readSentences('en', 'science');
  const h = history.items[0];
  const s = science.items[0];
  if (!h || !s) throw new Error('fixture: missing sentences');
  await openCollectionWith(page, [
    { id: h.id, savedAt: 200 },
    { id: s.id, savedAt: 100 },
  ]);

  const removeButton = (text: string) =>
    page.getByText(text, { exact: true }).locator('xpath=ancestor::li[1]').getByRole('button', { name: en.collection.remove });
  await removeButton(h.text).click();
  await removeButton(s.text).click();

  // Both are gone, the collection is empty, and the row is still offered (now for the second one).
  await expect(page.getByText(en.collection.empty, { exact: true })).toBeVisible();
  expect(await readKey(page, FAVORITES_KEY_EN)).toBeNull();
  const undo = page.getByTestId('undo-row').getByRole('button', { name: en.collection.undo });
  await expect(undo).toBeFocused();

  await undo.click();
  await expect(page.getByText(s.text, { exact: true })).toBeVisible();
  await expect(page.getByText(h.text, { exact: true })).toHaveCount(0);
  expect(await readKey(page, FAVORITES_KEY_EN)).toEqual([{ id: s.id, savedAt: 100 }]);
  await expect(page.getByTestId('undo-row')).toHaveText('');
});

test('changing the sentence language drops the Undo row', async ({ page }) => {
  const history = await readSentences('en', 'history');
  const h = history.items[0];
  if (!h) throw new Error('fixture: missing sentences');
  await openCollectionWith(page, [{ id: h.id, savedAt: 5 }]);

  await page.getByRole('button', { name: en.collection.remove }).click();
  await expect(page.getByTestId('undo-row').getByRole('button', { name: en.collection.undo })).toBeVisible();

  await contentLangSelect(page).selectOption('id');
  await expect(page.getByText(en.collection.empty, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: en.collection.undo })).toHaveCount(0);
});
