import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { en } from '../../src/i18n/ui/en';
import { id } from '../../src/i18n/ui/id';
import { openMainNav } from './helpers';

const LANGUAGES = [
  { code: 'id', ui: id },
  { code: 'en', ui: en },
] as const;

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'page is wider than the viewport').toBeLessThanOrEqual(0);
}

for (const { code, ui } of LANGUAGES) {
  const text = ui.guide.page;

  test.describe(`/${code}/guide/`, () => {
    test('has its own title, description and one h1, and is indexable', async ({ page }) => {
      await page.goto(`/${code}/guide/`);
      await expect(page).toHaveTitle(`${text.title} | ${ui.meta.siteName}`);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', text.description);
      await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
        'content',
        `${text.title} | ${ui.meta.siteName}`,
      );
      await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
      await expect(page.locator('html')).toHaveAttribute('lang', code);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(text.heading);
      // JSON-LD of the app and the site belongs to the home page only.
      await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
    });

    test('shows every section as an h2 and the lists of the plan', async ({ page }) => {
      await page.goto(`/${code}/guide/`);
      const headings = page.getByRole('heading', { level: 2 });
      await expect(headings).toHaveText([
        text.whyTitle,
        text.postureTitle,
        text.homeRowTitle,
        text.fingersTitle,
        text.planTitle,
        text.tipsTitle,
        text.faqTitle,
        text.ctaTitle,
      ]);
      await expect(page.getByTestId('guide-posture').getByRole('listitem')).toHaveCount(text.posture.length);
      await expect(page.getByTestId('guide-finger-groups').locator('dt')).toHaveCount(text.fingerGroups.length);
      await expect(page.getByTestId('guide-plan').getByRole('listitem')).toHaveCount(text.plan.length);
      await expect(page.getByTestId('guide-tips').getByRole('listitem')).toHaveCount(text.tips.length);
      await expect(page.getByTestId('guide-faq').getByRole('heading', { level: 3 })).toHaveText(
        text.faq.map((item) => item.question),
      );
    });

    test('shows the keyboard diagram and the table with the finger of every key', async ({ page }) => {
      await page.goto(`/${code}/guide/`);
      // Phone width: one diagram per hand (the whole-keyboard diagram is hidden below 768 px).
      await expect(page.getByRole('img', { name: ui.guide.diagram.labelLeft })).toBeVisible();
      await expect(page.getByRole('img', { name: ui.guide.diagram.labelRight })).toBeVisible();
      await expect(page.getByRole('img', { name: ui.guide.diagram.labelBoth })).toBeHidden();
      const rows = page.getByTestId('finger-table').locator('tbody tr');
      await expect(rows).toHaveCount(10);
      // Home row keys are in the table: the left index finger covers F, the right one J.
      const table = page.getByTestId('finger-table');
      await expect(table.locator('[data-finger="left-4"]')).toContainText('F');
      await expect(table.locator('[data-finger="right-4"]')).toContainText('J');
    });

    test('shows the whole keyboard on a wide screen', async ({ page }) => {
      await page.setViewportSize({ width: 1024, height: 768 });
      await page.goto(`/${code}/guide/`);
      await expect(page.getByRole('img', { name: ui.guide.diagram.labelBoth })).toBeVisible();
      await expect(page.getByRole('img', { name: ui.guide.diagram.labelLeft })).toBeHidden();
      await expectNoHorizontalScroll(page);
    });

    test('has no horizontal scroll at 390 and 320 px', async ({ page }) => {
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(`/${code}/guide/`);
        await expectNoHorizontalScroll(page);
      }
    });

    test('the start button goes to the home page', async ({ page }) => {
      await page.goto(`/${code}/guide/`);
      const link = page.getByTestId('guide-start-link');
      await expect(link).toHaveText(text.ctaLabel);
      await expect(link).toHaveAttribute('href', `/${code}/`);
      const box = await link.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    });

    test('the menu links to the guide and marks it as the current page', async ({ page }) => {
      await page.goto(`/${code}/`);
      let nav = await openMainNav(page, ui);
      await nav.getByRole('link', { name: ui.nav.guide }).click();
      await expect(page).toHaveURL(new RegExp(`/${code}/guide/$`));
      nav = await openMainNav(page, ui);
      await expect(nav.getByRole('link', { name: ui.nav.guide })).toHaveAttribute('aria-current', 'page');
      await expect(nav.getByRole('link', { name: ui.nav.home })).not.toHaveAttribute('aria-current', 'page');
    });
  });
}

test.describe('with JavaScript off', () => {
  test.use({ javaScriptEnabled: false });

  test('the guide is complete text with the diagram and the table', async ({ page }) => {
    await page.goto('/en/guide/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.guide.page.heading);
    await expect(page.getByText(en.guide.page.homeRowBody[0]!)).toBeVisible();
    await expect(page.getByRole('img', { name: en.guide.diagram.labelLeft })).toBeVisible();
    await expect(page.getByTestId('finger-table')).toBeVisible();
    await expect(page.getByTestId('guide-faq').getByRole('heading', { level: 3 })).toHaveCount(
      en.guide.page.faq.length,
    );
  });
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
