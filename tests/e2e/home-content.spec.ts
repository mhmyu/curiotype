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

    // Five sections, each with its own h2, after the history.
    await expect(block.getByRole('heading', { level: 2 })).toHaveText([
      ui.home.aboutTitle,
      ui.home.howTitle,
      ui.home.featuresTitle,
      ui.home.whyTitle,
      ui.home.faqTitle,
    ]);
    // The steps and the questions are the h3 headings.
    await expect(block.getByRole('heading', { level: 3 })).toHaveText([
      ...ui.home.steps.map((step) => step.title),
      ...ui.home.faq.map((item) => item.question),
    ]);
    await expect(page.getByTestId('home-features').getByRole('listitem')).toHaveCount(ui.home.features.length + 1);
    await expect(page.getByTestId('home-faq').locator('h3')).toHaveCount(ui.home.faq.length);
    const historyBox = await page.getByRole('heading', { name: ui.history.title }).boundingBox();
    const blockBox = await block.boundingBox();
    expect(blockBox!.y).toBeGreaterThan(historyBox!.y);

    // The page still has exactly one h1.
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  });
}

test('the block is in the HTML before any script runs', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/en/');
  const block = page.getByTestId('home-content');
  await expect(block).toContainText(en.home.whyTitle);
  await expect(block).toContainText(en.home.faq[0]!.answer);
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

for (const lang of ['en', 'id'] as const) {
  test(`the home page leads to the typing guide from a hint line and a card (${lang})`, async ({ page }) => {
    const ui = DICTIONARIES[lang];
    await page.goto(`/${lang}/`);

    // The hint sits right under the tagline, above the test, and is a real link.
    const hint = page.getByTestId('guide-hint');
    await expect(hint).toBeVisible();
    await expect(hint).toContainText(ui.home.guideHint.text.split('{link}')[0]!.trim());
    const hintLink = hint.getByRole('link', { name: ui.home.guideHint.link });
    await expect(hintLink).toHaveAttribute('href', `/${lang}/guide/`);
    const hintBox = await hint.boundingBox();
    const taglineBox = await page.getByText(ui.meta.tagline).boundingBox();
    expect(hintBox!.y).toBeGreaterThan(taglineBox!.y);
    const controlsBox = await page.getByTestId('controls-row').boundingBox();
    expect(controlsBox!.y).toBeGreaterThan(hintBox!.y);

    // The card is the last item of the features list.
    const card = page.getByTestId('home-guide-card');
    await expect(card).toContainText(ui.home.guideCard.title);
    const cardLink = card.getByRole('link', { name: ui.home.guideCard.link });
    await expect(cardLink).toHaveAttribute('href', `/${lang}/guide/`);
    const cardBox = await cardLink.boundingBox();
    expect(cardBox!.height).toBeGreaterThanOrEqual(44);

    // Following the hint opens the guide.
    await hintLink.click();
    await expect(page).toHaveURL(new RegExp(`/${lang}/guide/$`));
  });
}

test('the guide hint is in the HTML before any script runs and stays one short line at 320px', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/id/');
  await expect(page.getByTestId('guide-hint').getByRole('link')).toHaveAttribute('href', '/id/guide/');
  await context.close();

  const withScript = await browser.newPage({ viewport: { width: 320, height: 640 } });
  for (const lang of ['id', 'en']) {
    await withScript.goto(`/${lang}/`);
    const box = await withScript.getByTestId('guide-hint').boundingBox();
    // Caption size is 14px with a 1.4 line height (about 20px per line): at most two lines.
    expect(box!.height, `hint height in ${lang}`).toBeLessThanOrEqual(44);
    const overflow = await withScript.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  }
  await withScript.close();
});
