import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { en } from '../../src/i18n/ui/en';
import { id } from '../../src/i18n/ui/id';

const menuButton = (page: Page) => page.getByRole('button', { name: en.nav.menu, exact: true });
const mainNav = (page: Page) => page.getByRole('navigation', { name: en.nav.main });
const brand = (page: Page) => page.locator('[data-site-header] .site-brand');

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'page is wider than the viewport').toBeLessThanOrEqual(0);
}

test.describe('phone (menu behind the hamburger button)', () => {
  test('the menu starts closed and the logo is the only thing left of the button', async ({ page }) => {
    await page.goto('/en/');
    await expect(menuButton(page)).toBeVisible();
    await expect(menuButton(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(mainNav(page)).toBeHidden();

    // The logo is decorative; the link is still named after the site (visually hidden text).
    await expect(brand(page)).toBeVisible();
    await expect(page.getByRole('link', { name: en.meta.siteName })).toHaveAttribute('href', '/en/');
    // The logo is inline SVG and decorative: hidden from assistive technology, the name is the link text.
    await expect(brand(page).locator('svg[data-logo]')).toHaveAttribute('aria-hidden', 'true');
    await expect(brand(page).locator('img')).toHaveCount(0);
    // Visually hidden (a 1 px clipped box), still read by screen readers.
    expect((await brand(page).locator('span').boundingBox())!.width).toBeLessThanOrEqual(1);
    await expectNoHorizontalScroll(page);
  });

  test('the button opens and closes the menu, and the links are not buttons', async ({ page }) => {
    await page.goto('/en/');
    await menuButton(page).click();
    await expect(menuButton(page)).toHaveAttribute('aria-expanded', 'true');
    const nav = mainNav(page);
    for (const label of [en.nav.home, en.nav.guide, en.nav.stats, en.nav.collection, en.nav.settings]) {
      await expect(nav.getByRole('link', { name: label })).toBeVisible();
    }
    await expect(nav.getByRole('link', { name: en.nav.home })).toHaveAttribute('aria-current', 'page');

    // Menu items look like menu items: no border and no fill.
    const style = await nav.getByRole('link', { name: en.nav.stats }).evaluate((el) => {
      const css = getComputedStyle(el);
      return { border: css.borderTopWidth, background: css.backgroundColor };
    });
    expect(style.border).toBe('0px');
    expect(style.background).toBe('rgba(0, 0, 0, 0)');

    await menuButton(page).click();
    await expect(menuButton(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(nav).toBeHidden();
  });

  test('every menu link is at least 44 px tall', async ({ page }) => {
    await page.goto('/en/');
    await menuButton(page).click();
    const links = mainNav(page).getByRole('link');
    await expect(links).toHaveCount(5);
    for (let i = 0; i < 5; i += 1) {
      const box = await links.nth(i).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    const toggleBox = await menuButton(page).boundingBox();
    expect(toggleBox?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(toggleBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    await expectNoHorizontalScroll(page);
  });

  test('Escape closes the menu, returns focus to the button and does not reach the page', async ({ page }) => {
    await page.goto('/en/');
    await menuButton(page).click();
    await mainNav(page).getByRole('link', { name: en.nav.stats }).focus();
    await page.keyboard.press('Escape');
    await expect(menuButton(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(menuButton(page)).toBeFocused();
    await expect(mainNav(page)).toBeHidden();
  });

  test('a tap outside the header closes the menu', async ({ page }) => {
    await page.goto('/en/');
    await menuButton(page).click();
    await expect(mainNav(page)).toBeVisible();
    await page.mouse.click(200, 700);
    await expect(menuButton(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(mainNav(page)).toBeHidden();
  });

  test('the language links are inside the menu and switch the language', async ({ page }) => {
    await page.goto('/en/');
    await expect(page.getByRole('navigation', { name: en.nav.language })).toBeHidden();
    await menuButton(page).click();
    const languages = page.getByRole('navigation', { name: en.nav.language });
    await expect(languages.getByRole('link', { name: 'EN' })).toHaveAttribute('aria-current', 'page');
    await languages.getByRole('link', { name: 'ID' }).click();
    await expect(page).toHaveURL(/\/id\/$/);
    await expect(page.getByRole('button', { name: id.nav.menu, exact: true })).toBeVisible();
  });

  test('the menu opens in both color themes without leaving the viewport', async ({ page }) => {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/id/');
      await page.getByRole('button', { name: id.nav.menu, exact: true }).click();
      await expect(page.getByRole('navigation', { name: id.nav.main })).toBeVisible();
      await expectNoHorizontalScroll(page);
    }
  });
});

test.describe('desktop (menu in the bar)', () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test('the logo and name sit left of the menu; no hamburger; language links at the right', async ({ page }) => {
    await page.goto('/en/');
    await expect(menuButton(page)).toBeHidden();
    await expect(brand(page).locator('span')).toBeVisible();
    const nav = mainNav(page);
    await expect(nav).toBeVisible();

    const logo = await brand(page).locator('svg[data-logo]').boundingBox();
    const home = await nav.getByRole('link', { name: en.nav.home }).boundingBox();
    const settings = await nav.getByRole('link', { name: en.nav.settings }).boundingBox();
    const languageEn = await page
      .getByRole('navigation', { name: en.nav.language })
      .getByRole('link', { name: 'EN' })
      .boundingBox();
    expect(logo && home && settings && languageEn).toBeTruthy();
    expect(logo!.x + logo!.width).toBeLessThan(home!.x);
    expect(settings!.x + settings!.width).toBeLessThan(languageEn!.x);
    // One row: all of them share (about) the same vertical center.
    for (const box of [home!, settings!, languageEn!]) {
      expect(Math.abs(box.y + box.height / 2 - (logo!.y + logo!.height / 2))).toBeLessThan(6);
    }
    await expectNoHorizontalScroll(page);
  });

  test('the current page is marked by accent text and a bar, not by a filled button', async ({ page }) => {
    await page.goto('/en/stats/');
    const current = mainNav(page).getByRole('link', { name: en.nav.stats });
    await expect(current).toHaveAttribute('aria-current', 'page');
    const style = await current.evaluate((el) => {
      const css = getComputedStyle(el);
      const bar = getComputedStyle(el, '::after');
      return { border: css.borderTopWidth, background: css.backgroundColor, bar: bar.backgroundColor };
    });
    expect(style.border).toBe('0px');
    expect(style.background).toBe('rgba(0, 0, 0, 0)');
    expect(style.bar).not.toBe('rgba(0, 0, 0, 0)');
  });
});

for (const [width, ui, path] of [
  [768, en, '/en/'],
  [768, id, '/id/'],
  [800, id, '/id/'],
] as const) {
  test(`the full menu fits one row at ${width}px (${path})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(path);
    await expect(page.getByRole('button', { name: ui.nav.menu, exact: true })).toBeHidden();
    const links = page.getByRole('navigation', { name: ui.nav.main }).getByRole('link');
    const first = await links.first().boundingBox();
    const last = await links.last().boundingBox();
    expect(Math.abs(first!.y - last!.y)).toBeLessThan(2);
    // The site name stays on one line (the bar is a single row of about 60 px).
    expect((await page.locator('[data-site-header]').boundingBox())!.height).toBeLessThan(70);
    await expectNoHorizontalScroll(page);
  });
}
