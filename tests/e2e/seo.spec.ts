import { expect, test } from '@playwright/test';
import { en } from '../../src/i18n/ui/en';
import { id } from '../../src/i18n/ui/id';

// What the HTML of each page says (meta tags, titles, headings, robots rules, canonical, the
// bilingual 404 content) is checked against the build output in tests/dist/seo.test.ts. Here only
// what needs the running server: that the static files and the 404 page are actually served.

test('the server serves the static files and answers an unknown URL with the 404 page', { tag: '@smoke' }, async ({ page, request }) => {
  expect((await request.get('/favicon.ico')).status()).toBe(200);
  expect((await request.get('/robots.txt')).status()).toBe(200);

  const response = await page.goto('/this-page-does-not-exist/');
  expect(response?.status()).toBe(404);
  for (const ui of [id, en]) {
    await expect(page.getByRole('heading', { level: 1, name: ui.notFound.title })).toBeVisible();
  }
});
