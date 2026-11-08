import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { en } from '../../src/i18n/ui/en';
import { id } from '../../src/i18n/ui/id';
import { openMainNav } from './helpers';

// Behavior (layout, colors, menu) is checked on the Indonesian page: it does not depend on the
// language. What the page says (title, description, headings, lists, the diagram names, the table,
// the start link) is read from the build output for both languages in tests/dist/guide.test.ts.

async function expectNoHorizontalScroll(page: Page, label: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect.soft(overflow, `${label}: page is wider than the viewport`).toBeLessThanOrEqual(0);
}

// Finger colors: the keys, the hands and the table swatches share five colors, one per finger.
const fillOf = (locator: Locator) => locator.first().evaluate((el) => getComputedStyle(el).fill);
const backgroundOf = (locator: Locator) =>
  locator.first().evaluate((el) => getComputedStyle(el).backgroundColor);

/** One color per finger, the same on the keys, on the hands and in the table; none shared across hands. */
async function expectFingerColors(page: Page, label: string) {
  const fills = new Set<string>();
  for (const hand of ['left', 'right'] as const) {
    for (const finger of [1, 2, 3, 4, 5]) {
      const fingerId = `${hand}-${finger}`;
      const onHands = await fillOf(page.locator(`[data-hand="${hand}"] rect[data-finger="${fingerId}"]`));
      const onKeys = await fillOf(
        page.locator(`[data-testid="keyboard-figure"] g[data-finger="${fingerId}"] rect`).locator('visible=true'),
      );
      const inTable = await backgroundOf(
        page.locator(`[data-testid="finger-table"] tr[data-finger="${fingerId}"] [data-swatch]`),
      );
      expect.soft(onKeys, `${label}: keys of ${fingerId}`).toBe(onHands);
      expect.soft(inTable, `${label}: table of ${fingerId}`).toBe(onHands);
      fills.add(onHands);
      // The same finger on the other hand has another color, so equal colors never meet in the middle.
      if (hand === 'right') {
        const left = await fillOf(page.locator(`[data-hand="left"] rect[data-finger="left-${finger}"]`));
        expect.soft(onHands, `${label}: finger ${finger} on both hands`).not.toBe(left);
      }
    }
  }
  expect.soft(fills.size, `${label}: five colors`).toBe(5);
}

test('/id/guide/ at phone width: one diagram per hand, a full-size start button and no horizontal scroll', async ({ page }) => {
  await page.goto('/id/guide/');

  // Phone width: one diagram per hand (the whole-keyboard diagram is hidden below 768 px) and the table.
  await expect.soft(page.getByRole('img', { name: id.guide.diagram.labelLeft })).toBeVisible();
  await expect.soft(page.getByRole('img', { name: id.guide.diagram.labelRight })).toBeVisible();
  await expect.soft(page.getByRole('img', { name: id.guide.diagram.labelBoth })).toBeHidden();
  await expect.soft(page.getByTestId('finger-table')).toBeVisible();

  // The start button is a full-size target.
  const link = page.getByTestId('guide-start-link');
  expect.soft((await link.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  await expectNoHorizontalScroll(page, '/id/guide/ at 390px');
});

test('/id/guide/ at phone width: the hands, the finger colors and dark mode', async ({ page }) => {
  await page.goto('/id/guide/');

  // The hands picture sits under the keyboard picture, with ten numbered fingers.
  const keyboard = await page.getByTestId('keyboard-figure').boundingBox();
  const hands = page.getByTestId('hands-figure');
  await expect.soft(hands).toBeVisible();
  const box = await hands.boundingBox();
  expect.soft(box!.y).toBeGreaterThan(keyboard!.y + keyboard!.height - 1);
  await expect.soft(page.getByRole('img', { name: id.guide.diagram.handsLabel })).toBeVisible();
  await expect.soft(hands.locator('rect[data-finger]')).toHaveCount(10);
  await expect.soft(hands.getByRole('heading')).toHaveCount(0);
  await expect
    .soft(page.getByRole('heading', { level: 3, name: id.guide.page.handsTitle }))
    .toBeVisible();
  await expect.soft(hands).toContainText(id.guide.diagram.handsCaption);

  await expectFingerColors(page, '390px');

  // Dark mode keeps the finger colors; at 320 px the hands still fit.
  const light = await fillOf(page.locator('[data-hand="left"] rect[data-finger="left-3"]'));
  await page.emulateMedia({ colorScheme: 'dark' });
  expect.soft(await fillOf(page.locator('[data-hand="left"] rect[data-finger="left-3"]'))).toBe(light);
  await page.setViewportSize({ width: 320, height: 640 });
  await expectNoHorizontalScroll(page, '/id/guide/ at 320px');
  const svg = await hands.locator('svg').boundingBox();
  expect.soft(svg!.width).toBeLessThanOrEqual(320);
  expect.soft(svg!.height).toBeGreaterThan(100);
});

test('/id/guide/ at wide width: the whole keyboard, its colors and the home row', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto('/id/guide/');

  await expect.soft(page.getByRole('img', { name: id.guide.diagram.labelBoth })).toBeVisible();
  await expect.soft(page.getByRole('img', { name: id.guide.diagram.labelLeft })).toBeHidden();
  await expectNoHorizontalScroll(page, '/id/guide/ at 1024px');
  await expectFingerColors(page, '1024px');

  // The home row keys have a thick outline instead of a color of their own.
  const widthOf = (key: string) =>
    page
      .locator(`[data-testid="keyboard-diagram-both"] g[data-key="${key}"] rect`)
      .first()
      .evaluate((el) => parseFloat(el.getAttribute('stroke-width') ?? '0'));
  expect.soft(await widthOf('F')).toBeGreaterThan(await widthOf('R'));
  expect.soft(await widthOf('A')).toBeGreaterThan(await widthOf('Q'));

  // Where the two index fingers and the two thumbs meet in the middle, the colors differ.
  const fill = (key: string, finger: string) =>
    fillOf(page.locator(`[data-testid="keyboard-diagram-both"] g[data-key="${key}"][data-finger="${finger}"] rect`));
  // G (left index) next to H (right index), T next to Y, B next to N.
  for (const [left, right] of [['G', 'H'], ['T', 'Y'], ['B', 'N']] as const) {
    expect.soft(await fill(left, 'left-4'), `${left} and ${right}`).not.toBe(await fill(right, 'right-4'));
  }
  // The space bar: one half per thumb, two colors.
  const halves = page.locator('[data-testid="keyboard-diagram-both"] g[data-key="Space"]');
  await expect.soft(halves).toHaveCount(2);
  expect
    .soft(await fillOf(halves.nth(0).locator('rect')))
    .not.toBe(await fillOf(halves.nth(1).locator('rect')));
});

test('the menu links to the guide and marks it as the current page', async ({ page }) => {
  await page.goto('/id/');
  let nav = await openMainNav(page, id);
  await nav.getByRole('link', { name: id.nav.guide }).click();
  await expect(page).toHaveURL(/\/id\/guide\/$/);
  nav = await openMainNav(page, id);
  await expect(nav.getByRole('link', { name: id.nav.guide })).toHaveAttribute('aria-current', 'page');
  await expect(nav.getByRole('link', { name: id.nav.home })).not.toHaveAttribute('aria-current', 'page');
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
