import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { en } from '../../src/i18n/ui/en';
import { id } from '../../src/i18n/ui/id';

const HISTORY_KEY = 'typing:history:v1';
const BESTS_KEY = 'typing:personal-bests:v1';
const SEEN_KEY = 'typing:seen:v1:en';
const SETTINGS_KEY = 'typing:settings:v1';

function entry(entryId: string, finishedAt: number) {
  return {
    id: entryId,
    finishedAt,
    contentLang: 'en',
    mode: 'time',
    durationSec: 30,
    category: 'all',
    difficulty: 'all',
    wpm: 40,
    rawWpm: 45,
    accuracy: 95,
    consistency: 80,
    errors: 3,
  };
}

async function seed(page: Page, items: Record<string, unknown>) {
  await page.evaluate((entries) => {
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, JSON.stringify(value));
  }, items);
}

async function readKey(page: Page, key: string) {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), key);
}

async function typingKeys(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith('typing:'))
      .sort(),
  );
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'page is wider than the viewport').toBeLessThanOrEqual(0);
}

/** Builds an export file. Keys in the file are relative to the storage adapter (`history:v1`), so the `typing:` prefix of the localStorage keys is dropped. */
function exportFile(data: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  const relative = Object.fromEntries(Object.entries(data).map(([key, value]) => [key.replace(/^typing:/, ''), value]));
  return {
    name: 'typing-data.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({ app: 'typing', version: 1, exportedAt: '2026-11-01T10:00:00.000Z', data: relative, ...overrides }),
    ),
  };
}

const t = id.dataTools;

test.describe('privacy page', () => {
  for (const { code, ui } of [
    { code: 'id', ui: id },
    { code: 'en', ui: en },
  ] as const) {
    test(`/${code}/privacy/ lists the stored data and links to the settings`, async ({ page }) => {
      await page.goto(`/${code}/privacy/`);
      await expect(page.getByRole('heading', { level: 1, name: ui.privacy.title })).toBeVisible();
      await expect(page.getByText(ui.privacy.data.history, { exact: true })).toBeVisible();
      await expect(page.getByText(ui.privacy.data.keyStats, { exact: true })).toBeVisible();
      await expect(page.getByText('history:v1', { exact: true })).toBeVisible();
      await expect(page.getByText('seen:v1:<lang>', { exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: ui.privacy.controlLink })).toHaveAttribute(
        'href',
        `/${code}/settings/`,
      );
      await expectNoHorizontalScroll(page);
    });
  }

  test('the footer links to the privacy page on every page', async ({ page }) => {
    await page.goto('/id/');
    await page.getByRole('contentinfo').getByRole('link', { name: id.footer.privacy }).click();
    await expect(page).toHaveURL(/\/id\/privacy\/$/);
    await expect(page.getByRole('heading', { level: 1, name: id.privacy.title })).toBeVisible();
  });

  test('the settings page links to the privacy page', async ({ page }) => {
    await page.goto('/id/settings/');
    await expect(page.getByRole('link', { name: t.privacyLink })).toHaveAttribute('href', '/id/privacy/');
  });
});

test.describe('data tools on the settings page', () => {
  test('exports every stored value to a dated JSON file', async ({ page }) => {
    await page.goto('/id/settings/');
    await seed(page, {
      [HISTORY_KEY]: [entry('a', 100)],
      [BESTS_KEY]: { 'en:time:30': 50 },
      [SEEN_KEY]: ['en-science-001'],
    });

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: t.exportButton, exact: true }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^typing-data-\d{4}-\d{2}-\d{2}\.json$/);
    const file = JSON.parse(await readFile((await download.path()) as string, 'utf8'));
    expect(file.app).toBe('typing');
    expect(file.version).toBe(1);
    expect(Object.keys(file.data).sort()).toEqual(['history:v1', 'personal-bests:v1', 'seen:v1:en']);
    expect(file.data['personal-bests:v1']).toEqual({ 'en:time:30': 50 });
    await expect(page.getByRole('status').getByText(t.exportDone)).toBeVisible();
  });

  test('a damaged file is rejected and nothing changes', async ({ page }) => {
    await page.goto('/id/settings/');
    await seed(page, { [HISTORY_KEY]: [entry('a', 100)] });
    const input = page.getByTestId('import-file');

    await input.setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{not json') });
    await expect(page.getByRole('alert')).toHaveText(t.importErrors['not-json']);

    await input.setInputFiles(exportFile({ [HISTORY_KEY]: [{ ...entry('b', 200), wpm: 'fast' }] }));
    await expect(page.getByRole('alert')).toHaveText(t.importErrors['invalid-value'].replace('{key}', 'history:v1'));

    await input.setInputFiles(exportFile({ [SEEN_KEY]: ['x'] }, { app: 'other' }));
    await expect(page.getByRole('alert')).toHaveText(t.importErrors['wrong-app']);

    // No method choice is offered for a rejected file, and the stored data is untouched.
    await expect(page.getByRole('button', { name: t.importConfirm, exact: true })).toHaveCount(0);
    expect(await readKey(page, HISTORY_KEY)).toEqual([entry('a', 100)]);
  });

  test('merging combines the file with the stored data and keeps the settings', async ({ page }) => {
    await page.goto('/id/settings/');
    await page.getByRole('button', { name: id.settings.themes.dark, exact: true }).click();
    await seed(page, { [HISTORY_KEY]: [entry('a', 100)], [BESTS_KEY]: { 'en:time:30': 50 } });

    await page.getByTestId('import-file').setInputFiles(
      exportFile({
        [HISTORY_KEY]: [entry('b', 200)],
        [BESTS_KEY]: { 'en:time:30': 45, 'en:time:60': 30 },
        [SETTINGS_KEY]: { theme: 'light' },
      }),
    );
    await expect(page.getByText(t.importReady.replace('{tests}', '1'))).toBeVisible();
    await expect(page.getByRole('button', { name: t.importModeMerge, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: t.importConfirm, exact: true }).click();
    await expect(page.getByRole('status').getByText(t.importDone)).toBeVisible();

    const history = (await readKey(page, HISTORY_KEY)) as { id: string }[];
    expect(history.map((e) => e.id)).toEqual(['b', 'a']);
    expect(await readKey(page, BESTS_KEY)).toEqual({ 'en:time:30': 50, 'en:time:60': 30 });
    expect((await readKey(page, SETTINGS_KEY)).theme).toBe('dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('overwriting asks for confirmation, can be cancelled, and replaces everything', async ({ page }) => {
    await page.goto('/id/settings/');
    await seed(page, { [HISTORY_KEY]: [entry('a', 100)], [SEEN_KEY]: ['old'] });
    await page.getByTestId('import-file').setInputFiles(
      exportFile({ [HISTORY_KEY]: [entry('b', 200)], [SETTINGS_KEY]: { theme: 'dark' } }),
    );
    await page.getByRole('button', { name: t.importModeOverwrite, exact: true }).click();
    await page.getByRole('button', { name: t.importConfirm, exact: true }).click();

    const dialog = page.getByRole('dialog', { name: t.overwriteConfirmTitle });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: t.cancel, exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(((await readKey(page, HISTORY_KEY)) as { id: string }[]).map((e) => e.id)).toEqual(['a']);

    await page.getByRole('button', { name: t.importConfirm, exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: t.overwriteConfirmButton, exact: true }).click();
    await expect(page.getByRole('status').getByText(t.importDone)).toBeVisible();

    expect(((await readKey(page, HISTORY_KEY)) as { id: string }[]).map((e) => e.id)).toEqual(['b']);
    expect(await readKey(page, SEEN_KEY)).toBeNull();
    // The imported theme is applied at once.
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('deleting all data asks first, then empties the storage and resets the theme', async ({ page }) => {
    await page.goto('/id/settings/');
    await page.getByRole('button', { name: id.settings.themes.dark, exact: true }).click();
    await seed(page, { [HISTORY_KEY]: [entry('a', 100)], [SEEN_KEY]: ['x'] });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.getByRole('button', { name: t.clearButton, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: t.clearConfirmTitle });
    await expect(dialog).toBeVisible();

    // Escape closes the dialog without deleting anything.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    expect((await typingKeys(page)).length).toBeGreaterThan(0);

    await page.getByRole('button', { name: t.clearButton, exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: t.clearConfirmButton, exact: true }).click();
    await expect(page.getByRole('status').getByText(t.clearDone)).toBeVisible();

    expect(await typingKeys(page)).toEqual([]);
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/);
    await expect(page.getByRole('button', { name: id.settings.themes.system, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('the page fits a phone screen and the English texts are used on /en/', async ({ page }) => {
    await page.goto('/en/settings/');
    await expect(page.getByRole('heading', { level: 2, name: en.dataTools.title })).toBeVisible();
    await expect(page.getByRole('button', { name: en.dataTools.exportButton, exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: en.dataTools.privacyLink })).toHaveAttribute('href', '/en/privacy/');
    await expectNoHorizontalScroll(page);
  });
});
