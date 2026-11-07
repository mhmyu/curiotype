import { expect, test } from '@playwright/test';

for (const path of ['/id/', '/en/guide/', '/en/settings/']) {
  test(`${path}: inline logo in the header and at the bottom right of the footer`, async ({ page }) => {
    await page.goto(path);

    // Inline SVG, decorative, no image request for the logo.
    const logos = page.locator('svg[data-logo]');
    await expect(logos).toHaveCount(2);
    for (const logo of await logos.all()) await expect(logo).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('[data-site-header] img, footer img')).toHaveCount(0);

    // Header logo: 36 px. Footer logo: 32 px, inside the footer, on its right side.
    const header = await page.locator('[data-site-header] svg[data-logo]').boundingBox();
    expect(header!.width).toBeCloseTo(36, 0);
    const footerLogo = page.locator('footer svg[data-logo]');
    await footerLogo.scrollIntoViewIfNeeded();
    const box = await footerLogo.boundingBox();
    const row = await page.getByTestId('footer-row').boundingBox();
    expect(box!.width).toBeCloseTo(32, 0);
    expect(box!.x + box!.width).toBeGreaterThan(row!.x + row!.width - 2);
    expect(box!.x).toBeGreaterThan(row!.x + row!.width / 2);
    expect(box!.y + box!.height).toBeLessThanOrEqual(row!.y + row!.height + 1);

    // No horizontal scroll from the footer layout.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test('the footer keeps the logo at the right and the links readable at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/id/privacy/');
  const footerLogo = page.locator('footer svg[data-logo]');
  await footerLogo.scrollIntoViewIfNeeded();
  const box = await footerLogo.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  expect(box!.width).toBeCloseTo(32, 0);
  const text = await page.locator('footer p').boundingBox();
  expect(text!.x + text!.width).toBeLessThanOrEqual(box!.x);
});

test('the favicon links: ico, svg and the apple touch icon all load', async ({ page, request }) => {
  await page.goto('/en/');
  for (const selector of [
    'link[rel="icon"][href="/favicon.ico"]',
    'link[rel="icon"][href="/favicon.svg"]',
    'link[rel="apple-touch-icon"]',
  ]) {
    const href = await page.locator(selector).getAttribute('href');
    expect((await request.get(href!)).ok(), selector).toBe(true);
  }
  const root = await request.get('/');
  expect(await root.text()).toContain('data-logo');
});
