import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';

// `/` sends a visitor to the language of the browser (lib/language-redirect.ts). Only `/` does:
// `/id/` and `/en/` always stay where they are.

const CASES: Array<{ locale: string; expected: RegExp; why: string }> = [
  { locale: 'id-ID', expected: /\/id\/$/, why: 'Indonesian browser' },
  { locale: 'en-US', expected: /\/en\/$/, why: 'English browser' },
  { locale: 'en-GB', expected: /\/en\/$/, why: 'another English region' },
  { locale: 'fr-FR', expected: /\/en\/$/, why: 'a language the site does not have opens English' },
  { locale: 'es-ES', expected: /\/en\/$/, why: 'a language the site does not have opens English' },
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

test.describe('the root page itself', () => {
  test('offers both languages as plain links and is indexable', async ({ request }) => {
    const html = await (await request.get('/')).text();
    expect(html).toMatch(/<a href="\/id\/" hreflang="id"/);
    expect(html).toMatch(/<a href="\/en\/" hreflang="en"/);
    expect(html).toMatch(/<noscript><meta http-equiv="refresh" content="0;url=\/id\/"/);
    expect(html).not.toMatch(/name="robots"/);
  });

  test('the policy lists the hash of each of its inline scripts and allows nothing unsafe', async ({ request }) => {
    const html = await (await request.get('/')).text();
    const policy = /http-equiv="content-security-policy" content="([^"]*)"/.exec(html)?.[1] ?? '';
    expect(policy).toContain("default-src 'self'");
    expect(policy).not.toMatch(/unsafe-inline|unsafe-eval/);
    const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(scripts.some((text) => text.includes('location.replace'))).toBe(true);
    expect(scripts.some((text) => text.includes('data-theme'))).toBe(true);
    for (const text of scripts) {
      const hash = `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;
      expect(policy, text.slice(0, 40)).toContain(hash);
    }
  });

  test('has no horizontal scroll at 320 px', async ({ page }) => {
    // The page without its scripts, so the redirect does not run while the size is measured.
    await page.setViewportSize({ width: 320, height: 640 });
    const html = await (await page.request.get('/')).text();
    await page.setContent(html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<noscript>[\s\S]*?<\/noscript>/g, ''));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
