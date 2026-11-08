import { expect, test } from '@playwright/test';
import { en } from '../../src/i18n/ui/en';
import { id } from '../../src/i18n/ui/id';

// The text and the structure of the block (headings, cards, questions, the guide hint and card with
// their targets, and that all of it is in the HTML before any script runs) are read from the build
// output in tests/dist/home-content.test.ts. Here stay what needs a browser: where things sit,
// their size, the horizontal scroll and following the link.

const DICTIONARIES = { en, id } as const;

test('the block sits below the history and fits the screen without a horizontal scroll', async ({ page }) => {
  const ui = id;
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/id/');
    const block = page.getByTestId('home-content');
    await expect(block).toBeVisible();

    const historyBox = await page.getByRole('heading', { name: ui.history.title }).boundingBox();
    const blockBox = await block.boundingBox();
    expect(blockBox!.y, `block below the history at ${width}px`).toBeGreaterThan(historyBox!.y);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `no horizontal scroll at ${width}px`).toBeLessThanOrEqual(0);
  }
});

for (const lang of ['en', 'id'] as const) {
  test(`the typing guide is reached from the hint line under the tagline and from a card (${lang})`, async ({ page }) => {
    const ui = DICTIONARIES[lang];
    await page.goto(`/${lang}/`);

    // The hint sits right under the tagline and above the test.
    const hint = page.getByTestId('guide-hint');
    await expect(hint).toBeVisible();
    const hintLink = hint.getByRole('link', { name: ui.home.guideHint.link });
    const hintBox = await hint.boundingBox();
    const taglineBox = await page.getByText(ui.meta.tagline).boundingBox();
    expect(hintBox!.y).toBeGreaterThan(taglineBox!.y);
    const controlsBox = await page.getByTestId('controls-row').boundingBox();
    expect(controlsBox!.y).toBeGreaterThan(hintBox!.y);

    // The card's link is a full-size target.
    const cardLink = page.getByTestId('home-guide-card').getByRole('link', { name: ui.home.guideCard.link });
    const cardBox = await cardLink.boundingBox();
    expect(cardBox!.height).toBeGreaterThanOrEqual(44);

    // Following the hint opens the guide.
    await hintLink.click();
    await expect(page).toHaveURL(new RegExp(`/${lang}/guide/$`));
  });
}

test('the guide hint stays one short line at 320px', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 320, height: 640 } });
  for (const lang of ['id', 'en']) {
    await page.goto(`/${lang}/`);
    const box = await page.getByTestId('guide-hint').boundingBox();
    // Caption size is 14px with a 1.4 line height (about 20px per line): at most two lines.
    expect(box!.height, `hint height in ${lang}`).toBeLessThanOrEqual(44);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  }
  await page.close();
});
