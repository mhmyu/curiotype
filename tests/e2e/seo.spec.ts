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
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(ui.meta.homeHeading);
    expect(ui.meta.description.length).toBeGreaterThanOrEqual(140);
    expect(ui.meta.description.length).toBeLessThanOrEqual(155);
    await expect(page.locator('link[rel="icon"][href="/favicon.ico"]')).toHaveAttribute('sizes', '48x48');
    await expect(page.locator('link[rel="icon"][href="/favicon.svg"]')).toHaveCount(1);
  });
}

test('/favicon.ico is served as an icon', async ({ request }) => {
  const response = await request.get('/favicon.ico');
  expect(response.status()).toBe(200);
  expect((await response.body()).subarray(0, 4).toString('hex')).toBe('00000100');
});

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

// Pages that hold per-user data stay out of search results but their links may still be followed.
for (const { code } of LANGUAGES) {
  for (const page of ['stats', 'collection', 'settings']) {
    test(`/${code}/${page}/ is noindex, follow and has no canonical`, async ({ page: p }) => {
      await p.goto(`/${code}/${page}/`);
      await expect(p.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow');
      await expect(p.locator('link[rel="canonical"]')).toHaveCount(0);
    });
  }

  test(`/${code}/privacy/ stays indexable`, async ({ page }) => {
    await page.goto(`/${code}/privacy/`);
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  });

  test(`/${code}/guide/ is indexable and has its own description`, async ({ page }) => {
    const ui = code === 'id' ? id : en;
    await page.goto(`/${code}/guide/`);
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', ui.guide.page.description);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  });
}
