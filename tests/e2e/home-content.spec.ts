import { expect, test } from '@playwright/test';
import { en } from '../../src/i18n/ui/en';
import { id } from '../../src/i18n/ui/id';

const DICTIONARIES = { en, id } as const;

for (const lang of ['en', 'id'] as const) {
  test(`the home page explains the site in plain HTML (${lang})`, async ({ page }) => {
    const ui = DICTIONARIES[lang];
    await page.goto(`/${lang}/`);
    const block = page.getByTestId('home-content');
    await expect(block).toBeVisible();

    // Four sections, each with its own h2, after the history.
    await expect(block.getByRole('heading', { level: 2 })).toHaveText([
      ui.home.howTitle,
      ui.home.categoriesTitle,
      ui.home.examplesTitle,
      ui.home.whyTitle,
    ]);
    await expect(block.getByRole('heading', { level: 3 })).toHaveText(ui.home.steps.map((step) => step.title));
    const historyBox = await page.getByRole('heading', { name: ui.history.title }).boundingBox();
    const blockBox = await block.boundingBox();
    expect(blockBox!.y).toBeGreaterThan(historyBox!.y);

    // The page still has exactly one h1.
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  });
}

test('the examples are fixed sentences with a source link', async ({ page }) => {
  await page.goto('/en/');
  const examples = page.getByTestId('home-example');
  await expect(examples).toHaveCount(3);
  const first = await examples.allTextContents();

  for (let index = 0; index < 3; index++) {
    const example = examples.nth(index);
    // The sentence carries the language of the sentences, not of the page.
    await expect(example.locator('p').first()).toHaveAttribute('lang', 'en');
    const link = example.getByRole('link');
    await expect(link).toHaveAttribute('href', /^https:\/\//);
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  }

  await page.reload();
  expect(await page.getByTestId('home-example').allTextContents()).toEqual(first);
});

test('the block is in the HTML before any script runs', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/en/');
  await expect(page.getByTestId('home-content')).toContainText(en.home.whyTitle);
  await expect(page.getByTestId('home-example')).toHaveCount(3);
  await context.close();
});

test('the block fits the screen without a horizontal scroll', async ({ page }) => {
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/id/');
    await expect(page.getByTestId('home-content')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `no horizontal scroll at ${width}px`).toBeLessThanOrEqual(0);
  }
});
