import { expect, test } from '@playwright/test';
import { id } from '../../src/i18n/ui/id';
import { chooseMode, contentLangSelect, modeSelect } from './helpers';

const HISTORY_KEY = 'typing:history:v1';
const PERSONAL_BESTS_KEY = 'typing:personal-bests:v1';
const SETTINGS_KEY = 'typing:settings:v1';

// Interface in Indonesian, sentences in English: the sentence language is separate from the URL.
test('switching the sentence language keeps the interface and the URL', { tag: '@smoke' }, async ({ page }) => {
  await page.goto('/id/');
  const input = page.getByLabel(id.test.inputLabel);
  await expect(input).toBeVisible();

  const select = contentLangSelect(page, id);
  const englishName = await page.evaluate(
    () => new Intl.DisplayNames(['id'], { type: 'language' }).of('en') as string,
  );

  // The sentence language starts as the interface language. On the home page the options show
  // short codes; the full names are the tooltips (title), the select's own title names the current one.
  await expect(select).toHaveValue('id');
  const codes = await select.locator('option').allTextContents();
  expect(codes.map((code) => code.trim()).sort()).toEqual(['EN', 'ID']);
  const titles = await select.locator('option').evaluateAll((options) =>
    options.map((option) => option.getAttribute('title')),
  );
  expect([...titles].sort()).toEqual(['Indonesia', englishName].sort());
  await expect(select).toHaveAttribute('title', 'Indonesia');

  await select.selectOption('en');
  await expect(select).toHaveValue('en');
  await expect(page).toHaveURL(/\/id\/$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'id');
  // The interface stays Indonesian; only the sentences change.
  await expect(modeSelect(page, id)).toHaveValue('time');

  await chooseMode(page, 'quote', id);
  await expect(input).toBeVisible();
  const text = input.locator('xpath=preceding-sibling::div[1]');
  await expect(text).toHaveAttribute('lang', 'en');
  const target = (await text.textContent()) ?? '';
  expect(target.length).toBeGreaterThan(20);

  await input.pressSequentially(target);
  await expect(page.getByRole('heading', { name: id.results.title })).toBeAttached();

  // The result is saved under a storage lock, so it lands a moment after the card appears.
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key) !== null, HISTORY_KEY))
    .toBe(true);
  const stored = await page.evaluate(
    ([historyKey, bestsKey, settingsKey]) => ({
      history: JSON.parse(localStorage.getItem(historyKey) ?? 'null'),
      bests: JSON.parse(localStorage.getItem(bestsKey) ?? 'null'),
      settings: JSON.parse(localStorage.getItem(settingsKey) ?? 'null'),
    }),
    [HISTORY_KEY, PERSONAL_BESTS_KEY, SETTINGS_KEY],
  );
  expect(stored.history).toHaveLength(1);
  expect(stored.history[0].contentLang).toBe('en');
  expect(stored.history[0].sentenceIds.every((sentenceId: string) => sentenceId.startsWith('en-'))).toBe(true);
  expect(Object.keys(stored.bests)).toEqual(['en:quote:na']);
  expect(stored.settings.contentLang).toBe('en');

  // The choice survives a reload, and switching back works.
  await page.reload();
  await expect(page.getByLabel(id.test.inputLabel)).toBeVisible();
  await expect(select).toHaveValue('en');

  await select.selectOption('id');
  await expect(select).toHaveValue('id');
  await expect(page.getByLabel(id.test.inputLabel).locator('xpath=preceding-sibling::div[1]')).toHaveAttribute(
    'lang',
    'id',
  );
});

// A draft language (DRAFT_LANGUAGES) is built and usable, but not offered in a production build.
test('a draft language set in the settings is used and stays in the select', async ({ page }) => {
  await page.addInitScript(
    ([key]) => localStorage.setItem(key, JSON.stringify({ contentLang: 'es' })),
    [SETTINGS_KEY],
  );
  await page.goto('/id/');
  const input = page.getByLabel(id.test.inputLabel);
  await expect(input).toBeVisible();

  // The draft in use stays listed (the select is never empty); the others do not appear.
  const select = contentLangSelect(page, id);
  await expect(select).toHaveValue('es');
  await expect(select.locator('option[value="es"]')).toHaveText('ES');
  await expect(select.locator('option[value="pt-br"]')).toHaveCount(0);

  await chooseMode(page, 'quote', id);
  const text = input.locator('xpath=preceding-sibling::div[1]');
  await expect(text).toHaveAttribute('lang', 'es');
  expect(((await text.textContent()) ?? '').length).toBeGreaterThan(50);
});
