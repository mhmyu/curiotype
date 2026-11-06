import { expect, test } from '@playwright/test';
import { en } from '../../src/i18n/ui/en';
import { id } from '../../src/i18n/ui/id';

// These checks hold whether or not SITE_URL was set for the build. Tags that need an absolute
// URL (canonical, hreflang, og:url, og:image, JSON-LD) are verified in the build output instead.

const LANGUAGES = [
  { code: 'id', ui: id, ogLocale: 'id_ID', otherOgLocale: 'en_US' },
  { code: 'en', ui: en, ogLocale: 'en_US', otherOgLocale: 'id_ID' },
] as const;

for (const { code, ui, ogLocale, otherOgLocale } of LANGUAGES) {
  test(`/${code}/ has description and Open Graph tags in its language`, async ({ page }) => {
    await page.goto(`/${code}/`);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', ui.meta.description);
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'website');
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', ui.meta.homeTitle);
    await expect(page).toHaveTitle(ui.meta.homeTitle);
    expect(ui.meta.homeTitle.length).toBeLessThanOrEqual(60);
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', ui.meta.description);
    await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute('content', ogLocale);
    await expect(page.locator('meta[property="og:locale:alternate"]')).toHaveAttribute('content', otherOgLocale);
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  });
}

test('an unknown URL shows the bilingual 404 page, kept out of search results', async ({ page }) => {
  const response = await page.goto('/this-page-does-not-exist/');
  expect(response?.status()).toBe(404);

  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  for (const { code, ui } of LANGUAGES) {
    await expect(page.getByRole('heading', { level: 1, name: ui.notFound.title })).toBeVisible();
    await expect(page.getByRole('link', { name: ui.notFound.home })).toHaveAttribute('href', `/${code}/`);
  }
});

test('robots.txt allows crawling', async ({ request }) => {
  const response = await request.get('/robots.txt');
  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(body).toContain('User-agent: *');
  expect(body).toContain('Allow: /');
});
