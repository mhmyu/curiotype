import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { en } from '../../src/i18n/ui/en';
import { id } from '../../src/i18n/ui/id';
import { openMainNav } from './helpers';

const LANGUAGES = [
  { code: 'id', ui: id },
  { code: 'en', ui: en },
] as const;

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'page is wider than the viewport').toBeLessThanOrEqual(0);
}

for (const { code, ui } of LANGUAGES) {
  const text = ui.guide.page;

  test.describe(`/${code}/guide/`, () => {
    test('has its own title, description and one h1, and is indexable', async ({ page }) => {
      await page.goto(`/${code}/guide/`);
      await expect(page).toHaveTitle(`${text.title} | ${ui.meta.siteName}`);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', text.description);
      await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
        'content',
        `${text.title} | ${ui.meta.siteName}`,
      );
      await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
      await expect(page.locator('html')).toHaveAttribute('lang', code);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(text.heading);
      // JSON-LD of the app and the site belongs to the home page only.
      await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
    });

    test('shows every section as an h2 and the lists of the plan', async ({ page }) => {
      await page.goto(`/${code}/guide/`);
      const headings = page.getByRole('heading', { level: 2 });
      await expect(headings).toHaveText([
        text.whyTitle,
        text.postureTitle,
        text.homeRowTitle,
        text.fingersTitle,
        text.planTitle,
        text.tipsTitle,
        text.faqTitle,
        text.ctaTitle,
      ]);
      await expect(page.getByTestId('guide-posture').getByRole('listitem')).toHaveCount(text.posture.length);
      await expect(page.getByTestId('guide-finger-groups').locator('dt')).toHaveCount(text.fingerGroups.length);
      await expect(page.getByTestId('guide-plan').getByRole('listitem')).toHaveCount(text.plan.length);
      await expect(page.getByTestId('guide-tips').getByRole('listitem')).toHaveCount(text.tips.length);
      await expect(page.getByTestId('guide-faq').getByRole('heading', { level: 3 })).toHaveText(
        text.faq.map((item) => item.question),
      );
    });

    test('shows the keyboard diagram and the table with the finger of every key', async ({ page }) => {
      await page.goto(`/${code}/guide/`);
      // Phone width: one diagram per hand (the whole-keyboard diagram is hidden below 768 px).
      await expect(page.getByRole('img', { name: ui.guide.diagram.labelLeft })).toBeVisible();
      await expect(page.getByRole('img', { name: ui.guide.diagram.labelRight })).toBeVisible();
      await expect(page.getByRole('img', { name: ui.guide.diagram.labelBoth })).toBeHidden();
      const rows = page.getByTestId('finger-table').locator('tbody tr');
      await expect(rows).toHaveCount(10);
      // Home row keys are in the table: the left index finger covers F, the right one J.
      const table = page.getByTestId('finger-table');
      await expect(table.locator('[data-finger="left-4"]')).toContainText('F');
      await expect(table.locator('[data-finger="right-4"]')).toContainText('J');
    });

    test('shows the whole keyboard on a wide screen', async ({ page }) => {
      await page.setViewportSize({ width: 1024, height: 768 });
      await page.goto(`/${code}/guide/`);
      await expect(page.getByRole('img', { name: ui.guide.diagram.labelBoth })).toBeVisible();
      await expect(page.getByRole('img', { name: ui.guide.diagram.labelLeft })).toBeHidden();
      await expectNoHorizontalScroll(page);
    });

    test('has no horizontal scroll at 390 and 320 px', async ({ page }) => {
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(`/${code}/guide/`);
        await expectNoHorizontalScroll(page);
      }
    });

    test('the start button goes to the home page', async ({ page }) => {
      await page.goto(`/${code}/guide/`);
      const link = page.getByTestId('guide-start-link');
      await expect(link).toHaveText(text.ctaLabel);
      await expect(link).toHaveAttribute('href', `/${code}/`);
      const box = await link.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    });

    test('the menu links to the guide and marks it as the current page', async ({ page }) => {
      await page.goto(`/${code}/`);
      let nav = await openMainNav(page, ui);
      await nav.getByRole('link', { name: ui.nav.guide }).click();
      await expect(page).toHaveURL(new RegExp(`/${code}/guide/$`));
      nav = await openMainNav(page, ui);
      await expect(nav.getByRole('link', { name: ui.nav.guide })).toHaveAttribute('aria-current', 'page');
      await expect(nav.getByRole('link', { name: ui.nav.home })).not.toHaveAttribute('aria-current', 'page');
    });
  });
}

test.describe('with JavaScript off', () => {
  test.use({ javaScriptEnabled: false });

  test('the guide is complete text with the diagram and the table', async ({ page }) => {
    await page.goto('/en/guide/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.guide.page.heading);
    await expect(page.getByText(en.guide.page.homeRowBody[0]!)).toBeVisible();
    await expect(page.getByRole('img', { name: en.guide.diagram.labelLeft })).toBeVisible();
    await expect(page.getByTestId('finger-table')).toBeVisible();
    await expect(page.getByTestId('guide-faq').getByRole('heading', { level: 3 })).toHaveCount(
      en.guide.page.faq.length,
    );
  });
});

test('the language links keep the page: the guide and the other pages open in the other language', async ({ page }) => {
  for (const path of ['guide', 'stats']) {
    await page.goto(`/en/${path}/`);
    await openMainNav(page, en);
    const languages = page.getByRole('navigation', { name: en.nav.language });
    await expect(languages.getByRole('link', { name: 'ID' })).toHaveAttribute('href', `/id/${path}/`);
    await expect(languages.getByRole('link', { name: 'EN' })).toHaveAttribute('href', `/en/${path}/`);
  }
  await page.goto('/en/guide/');
  await openMainNav(page, en);
  await page.getByRole('navigation', { name: en.nav.language }).getByRole('link', { name: 'ID' }).click();
  await expect(page).toHaveURL(/\/id\/guide\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(id.guide.page.heading);
});

// Finger colors: the keys, the hands and the table swatches share five colors, one per finger.
const fillOf = (locator: ReturnType<Page['locator']>) =>
  locator.first().evaluate((el) => getComputedStyle(el).fill);
const backgroundOf = (locator: ReturnType<Page['locator']>) =>
  locator.first().evaluate((el) => getComputedStyle(el).backgroundColor);

test('the hands picture sits under the keyboard picture, with ten numbered fingers', async ({ page }) => {
  await page.goto('/en/guide/');
  const keyboard = await page.getByTestId('keyboard-figure').boundingBox();
  const hands = page.getByTestId('hands-figure');
  await expect(hands).toBeVisible();
  const box = await hands.boundingBox();
  expect(box!.y).toBeGreaterThan(keyboard!.y + keyboard!.height - 1);
  await expect(page.getByRole('img', { name: en.guide.diagram.handsLabel })).toBeVisible();
  await expect(hands.locator('rect[data-finger]')).toHaveCount(10);
  await expect(hands.getByRole('heading')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 3, name: en.guide.page.handsTitle })).toBeVisible();
  await expect(hands).toContainText(en.guide.diagram.handsCaption);
});

for (const viewport of [{ width: 390, height: 844 }, { width: 1024, height: 800 }]) {
  test(`a finger has the same color on the keys, on the hands and in the table, and no finger shares a color across the hands, at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/id/guide/');
    const fills = new Set<string>();
    for (const hand of ['left', 'right'] as const) {
      for (const finger of [1, 2, 3, 4, 5]) {
        const id = `${hand}-${finger}`;
        const onHands = await fillOf(page.locator(`[data-hand="${hand}"] rect[data-finger="${id}"]`));
        const onKeys = await fillOf(
          page.locator(`[data-testid="keyboard-figure"] g[data-finger="${id}"] rect`).locator('visible=true'),
        );
        const inTable = await backgroundOf(page.locator(`[data-testid="finger-table"] tr[data-finger="${id}"] [data-swatch]`));
        expect(onKeys, `keys of ${id}`).toBe(onHands);
        expect(inTable, `table of ${id}`).toBe(onHands);
        fills.add(onHands);
        // The same finger on the other hand has another color, so equal colors never meet in the middle.
        if (hand === 'right') {
          const left = await fillOf(page.locator(`[data-hand="left"] rect[data-finger="left-${finger}"]`));
          expect(onHands, `finger ${finger} on both hands`).not.toBe(left);
        }
      }
    }
    expect(fills.size).toBe(5);
  });
}

test('the finger colors do not change in dark mode and the page has no horizontal scroll at 320px', async ({ page }) => {
  await page.goto('/en/guide/');
  const light = await fillOf(page.locator('[data-hand="left"] rect[data-finger="left-3"]'));
  await page.emulateMedia({ colorScheme: 'dark' });
  expect(await fillOf(page.locator('[data-hand="left"] rect[data-finger="left-3"]'))).toBe(light);

  await page.setViewportSize({ width: 320, height: 640 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  const hands = await page.getByTestId('hands-figure').locator('svg').boundingBox();
  expect(hands!.width).toBeLessThanOrEqual(320);
  expect(hands!.height).toBeGreaterThan(100);
});

test('the home row keys have a thick outline instead of a color of their own', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto('/en/guide/');
  const widthOf = (key: string) =>
    page
      .locator(`[data-testid="keyboard-diagram-both"] g[data-key="${key}"] rect`)
      .first()
      .evaluate((el) => parseFloat(el.getAttribute('stroke-width') ?? '0'));
  expect(await widthOf('F')).toBeGreaterThan(await widthOf('R'));
  expect(await widthOf('A')).toBeGreaterThan(await widthOf('Q'));
});

test('the two index fingers and the two thumbs have different colors where they meet in the middle', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto('/id/guide/');
  const fill = (key: string, finger: string) =>
    fillOf(page.locator(`[data-testid="keyboard-diagram-both"] g[data-key="${key}"][data-finger="${finger}"] rect`));
  // G (left index) next to H (right index), T next to Y, B next to N.
  for (const [left, right] of [['G', 'H'], ['T', 'Y'], ['B', 'N']] as const) {
    expect(await fill(left, 'left-4'), `${left} and ${right}`).not.toBe(await fill(right, 'right-4'));
  }
  // The space bar: one half per thumb, two colors.
  const halves = page.locator('[data-testid="keyboard-diagram-both"] g[data-key="Space"]');
  await expect(halves).toHaveCount(2);
  expect(await fillOf(halves.nth(0).locator('rect'))).not.toBe(await fillOf(halves.nth(1).locator('rect')));
});
