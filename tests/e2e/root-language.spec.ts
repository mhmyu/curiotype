import { expect, test } from '@playwright/test';

// `/` sends a visitor to the language of the browser (lib/language-redirect.ts). Only `/` does:
// `/id/` and `/en/` always stay where they are. Other regions and languages (en-GB, es-ES, ...) are
// matched by the pure function in lib/language-redirect.ts and covered by its unit test.

const CASES: Array<{ locale: string; expected: RegExp; why: string }> = [
  { locale: 'id-ID', expected: /\/id\/$/, why: 'Indonesian browser' },
  { locale: 'en-US', expected: /\/en\/$/, why: 'English browser' },
  { locale: 'fr-FR', expected: /\/en\/$/, why: 'a language the site does not have opens English' },
];

for (const { locale, expected, why } of CASES) {
  test.describe(`browser language ${locale}`, () => {
    test.use({ locale });

    test(`/ opens ${expected} (${why}) without a policy violation`, async ({ page }) => {
      const problems: string[] = [];
      page.on('console', (message) => {
        if (/Content Security Policy|Refused to/i.test(message.text())) problems.push(message.text());
      });
      await page.goto('/');
      await expect(page).toHaveURL(expected);
      await expect(page.locator('main')).toBeVisible();
      expect(problems).toEqual([]);
    });
  });
}

test.describe('English browser', () => {
  test.use({ locale: 'en-US' });

  test('keeps the query string and the hash', async ({ page }) => {
    await page.goto('/?utm_source=test#top');
    await expect(page).toHaveURL(/\/en\/\?utm_source=test#top$/);
  });

  test('never redirects the pages of a language', async ({ page }) => {
    await page.goto('/id/');
    await expect(page).toHaveURL(/\/id\/$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'id');
  });

  test('Back from the language page does not bounce forward again', async ({ page }) => {
    await page.goto('/id/privacy/');
    await page.goto('/');
    await expect(page).toHaveURL(/\/en\/$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/id\/privacy\/$/);
  });
});

test.describe('Indonesian browser', () => {
  test.use({ locale: 'id-ID' });

  test('never redirects the English pages', async ({ page }) => {
    await page.goto('/en/');
    await expect(page).toHaveURL(/\/en\/$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false, locale: 'en-US' });

  test('/ goes to the default language', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/id\/$/);
  });
});

// What the HTML of the root page promises (plain links, the noscript refresh, indexable, the hash of
// each inline script in its policy) is checked against the build output in tests/dist/root-page.test.ts.
test.describe('the root page itself', () => {
  test('has no horizontal scroll at 320 px', async ({ page }) => {
    // The page without its scripts, so the redirect does not run while the size is measured.
    await page.setViewportSize({ width: 320, height: 640 });
    const html = await (await page.request.get('/')).text();
    await page.setContent(html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<noscript>[\s\S]*?<\/noscript>/g, ''));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
