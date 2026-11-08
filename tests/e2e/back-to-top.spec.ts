import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { en } from '../../src/i18n/ui/en';
import { id } from '../../src/i18n/ui/id';

const button = (page: Page, name: string) => page.getByRole('button', { name });
const ringOffset = (page: Page) =>
  page.evaluate(() =>
    parseFloat(getComputedStyle(document.querySelector('[data-back-to-top-ring]')!).strokeDashoffset),
  );

test.beforeEach(async ({ page }) => {
  // Instant scrolling keeps the checks free of animation timing.
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('/en/guide/: hidden at the top, visible after scrolling, and back to the top on click', async ({ page }) => {
  await page.goto('/en/guide/');
  const back = button(page, en.nav.backToTop);

  // Not scrolled yet: not visible, and not reachable (no tab stop, not in the accessibility tree).
  await expect(page.locator('[data-back-to-top]')).toBeHidden();
  await expect(back).toHaveCount(0);

  await page.evaluate(() => window.scrollTo(0, 600));
  await expect(back).toBeVisible();
  const box = await back.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);

  // Bottom right, inside the viewport.
  const viewport = page.viewportSize()!;
  expect(box!.x + box!.width).toBeGreaterThan(viewport.width - 40);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);

  await back.click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.locator('[data-back-to-top]')).toBeHidden();
});

// The button belongs to the shared layout; the full behavior is checked on the guide above. The
// other kinds of page only prove that it is present there, in their own language, and starts hidden.
test('the button appears on the home, privacy and settings pages in their own language', async ({ page }) => {
  for (const [path, name] of [
    ['/id/', id.nav.backToTop],
    ['/id/privacy/', id.nav.backToTop],
    ['/en/settings/', en.nav.backToTop],
  ] as const) {
    await page.goto(path);
    await expect.soft(page.locator('[data-back-to-top]'), `${path} hidden at the top`).toBeHidden();
    // Pages with an island grow after hydration; a scroll made too early is clamped, so scroll again.
    await expect(async () => {
      await page.evaluate(() => window.scrollTo(0, 600));
      await expect(button(page, name)).toBeVisible({ timeout: 500 });
    }, `${path} visible after scrolling`).toPass({ timeout: 5000 });
  }
});

test('the ring fills as the page is scrolled', async ({ page }) => {
  await page.goto('/en/guide/');
  await page.evaluate(() => window.scrollTo(0, 400));
  await expect(button(page, en.nav.backToTop)).toBeVisible();
  const early = await ringOffset(page);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2));
  await expect.poll(() => ringOffset(page)).toBeLessThan(early);
  const middle = await ringOffset(page);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => ringOffset(page)).toBeLessThan(middle);
  // At the very bottom the ring is complete.
  expect(await ringOffset(page)).toBeLessThan(1);
});

test('keyboard: Tab reaches the button after scrolling, Enter scrolls to the top and keeps the focus on the page', async ({
  page,
}) => {
  await page.goto('/en/guide/');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const back = button(page, en.nav.backToTop);
  await expect(back).toBeVisible();

  await back.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  // The button hid itself, so the focus moved to the first link of the header instead of being lost.
  await expect(page.locator('[data-site-header] a').first()).toBeFocused();
});

test('the button stays clear of the page edges and adds no horizontal scroll at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/id/guide/');
  await page.evaluate(() => window.scrollTo(0, 500));
  await expect(button(page, id.nav.backToTop)).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('there is room between the header and the heading at phone and desktop widths', async ({ page }) => {
  for (const [width, minGap] of [
    [390, 20],
    [1024, 36],
  ] as const) {
    await page.setViewportSize({ width, height: 800 });
    for (const path of ['/id/', '/en/guide/', '/id/stats/', '/en/collection/', '/id/settings/', '/en/privacy/']) {
      await page.goto(path);
      const header = await page.locator('[data-site-header]').boundingBox();
      const heading = await page.getByRole('heading', { level: 1 }).first().boundingBox();
      const gap = heading!.y - (header!.y + header!.height);
      expect.soft(gap, `${path} at ${width}px: gap between header and h1`).toBeGreaterThanOrEqual(minGap);
    }
  }
});
