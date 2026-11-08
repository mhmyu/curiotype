import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { en } from '../../src/i18n/ui/en';
import { id } from '../../src/i18n/ui/id';
import { contentLangSelect, openMainNav } from './helpers';

const SETTINGS_KEY = 'typing:settings:v1';

async function readSettings(page: Page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), SETTINGS_KEY);
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'page is wider than the viewport').toBeLessThanOrEqual(0);
}

test('the navigation links the home page and the settings page', async ({ page }) => {
  await page.goto('/id/');
  let nav = await openMainNav(page, id);
  await expect(nav.getByRole('link', { name: id.nav.home })).toHaveAttribute('aria-current', 'page');

  await nav.getByRole('link', { name: id.nav.settings }).click();
  await expect(page).toHaveURL(/\/id\/settings\/$/);
  await expect(page.getByRole('heading', { level: 1, name: id.settings.title })).toBeVisible();
  nav = await openMainNav(page, id);
  await expect(nav.getByRole('link', { name: id.nav.settings })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('group', { name: id.settings.themeLabel })).toBeVisible();
  await expectNoHorizontalScroll(page);

  await nav.getByRole('link', { name: id.nav.home }).click();
  await expect(page).toHaveURL(/\/id\/$/);
});

test('the English settings page is translated', async ({ page }) => {
  await page.goto('/en/settings/');
  await expect(page.getByRole('heading', { level: 1, name: en.settings.title })).toBeVisible();
  await expect(page.getByRole('button', { name: en.settings.themes.dark, exact: true })).toBeVisible();
  await expect(page.getByRole('contentinfo').getByText(en.footer.sentences)).toBeVisible();
});

test('the theme choice is applied, saved and kept on every page without a flash', { tag: '@smoke' }, async ({ page }) => {
  await page.goto('/id/settings/');
  const html = page.locator('html');
  const dark = page.getByRole('button', { name: id.settings.themes.dark, exact: true });
  const light = page.getByRole('button', { name: id.settings.themes.light, exact: true });
  const system = page.getByRole('button', { name: id.settings.themes.system, exact: true });

  // Nothing chosen yet: the page follows the system.
  await expect(system).toHaveAttribute('aria-pressed', 'true');
  await expect(html).not.toHaveAttribute('data-theme', /.*/);

  await dark.click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(dark).toHaveAttribute('aria-pressed', 'true');
  await expect(system).toHaveAttribute('aria-pressed', 'false');
  expect((await readSettings(page)).theme).toBe('dark');

  // Another page (no settings island) gets the theme from the inline script in <head>.
  await page.goto('/en/');
  await expect(html).toHaveAttribute('data-theme', 'dark');
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(background).toBe('rgb(15, 28, 38)'); // dark background #0f1c26

  // With every script file blocked (so no island can run) the inline script in <head> alone
  // still sets the saved theme: this is what prevents the flash on load.
  const scriptFiles = /\/_astro\/.*\.js$/;
  await page.route(scriptFiles, (route) => route.abort());
  await page.goto('/id/settings/');
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.unroute(scriptFiles);
  await page.goto('/id/settings/');

  await light.click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('button', { name: id.settings.themes.light, exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await system.click();
  await expect(html).not.toHaveAttribute('data-theme', /.*/);
  expect((await readSettings(page)).theme).toBe('system');
});

test('the typing text size follows the setting', async ({ page }) => {
  await page.goto('/id/settings/');
  const large = page.getByRole('button', { name: id.settings.fontSizes.lg, exact: true });
  await expect(page.getByRole('button', { name: id.settings.fontSizes.md, exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await large.click();
  await expect(large).toHaveAttribute('aria-pressed', 'true');
  expect((await readSettings(page)).fontSize).toBe('lg');

  // The caret section shows the same sample text, so look inside the text size section only.
  const preview = page
    .getByRole('region', { name: id.settings.fontSizeLabel })
    .getByText(id.settings.fontSizePreview, { exact: true });
  await expect(preview).toHaveCSS('font-size', '24px');

  await page.goto('/id/');
  const input = page.getByLabel(id.test.inputLabel);
  await expect(input).toBeVisible();
  await expect(input.locator('xpath=preceding-sibling::div[1]')).toHaveCSS('font-size', '24px');
});

test('the sentence language chosen on the settings page is used by the test', async ({ page }) => {
  await page.goto('/id/settings/');
  const select = contentLangSelect(page, id);
  await expect(select).toHaveValue('id');

  await select.selectOption('en');
  await expect(select).toHaveValue('en');
  expect((await readSettings(page)).contentLang).toBe('en');
  // The interface stays Indonesian.
  await expect(page.locator('html')).toHaveAttribute('lang', 'id');

  await page.goto('/id/');
  const input = page.getByLabel(id.test.inputLabel);
  await expect(input).toBeVisible();
  await expect(input.locator('xpath=preceding-sibling::div[1]')).toHaveAttribute('lang', 'en');
});

test('the footer states the sentence license', async ({ page }) => {
  await page.goto('/id/');
  const footer = page.getByRole('contentinfo');
  await expect(footer.getByText(id.footer.sentences)).toBeVisible();
  await expect(footer.getByRole('link', { name: 'CC BY-SA 4.0' })).toHaveAttribute('href', /^https:\/\//);
  await expect(footer.getByRole('link', { name: id.nav.settings })).toHaveAttribute('href', '/id/settings/');
});
