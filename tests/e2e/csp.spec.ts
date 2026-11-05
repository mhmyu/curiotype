import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { id } from '../../src/i18n/ui/id';
import { chooseMode } from './helpers';

/**
 * The Content Security Policy is a <meta> tag that Astro writes into every page (see
 * `security.csp` in astro.config.mjs). These tests drive the real pages in the production build
 * and fail on any CSP violation, so a script, style, font or request that the policy blocks is
 * caught here and not by a user. `astro preview` does not apply `public/_headers`, so the
 * headers are covered by a unit test instead (`src/lib/headers-file.test.ts`).
 */

interface Violation {
  directive: string;
  blocked: string;
}

/** Records `securitypolicyviolation` events and CSP console errors for the page. */
async function trackViolations(page: Page): Promise<() => Promise<string[]>> {
  const consoleProblems: string[] = [];
  page.on('console', (message) => {
    const text = message.text();
    if (/Content Security Policy|Refused to (apply|load|execute|connect|frame)/i.test(text)) {
      consoleProblems.push(text);
    }
  });
  await page.addInitScript(() => {
    const store: Violation[] = [];
    (window as unknown as { __csp: Violation[] }).__csp = store;
    document.addEventListener('securitypolicyviolation', (event) => {
      store.push({ directive: event.violatedDirective, blocked: event.blockedURI });
    });
  });
  return async () => {
    const events = await page
      .evaluate(() => (window as unknown as { __csp?: Violation[] }).__csp ?? [])
      .catch(() => [] as Violation[]);
    return [...consoleProblems, ...events.map((v) => `${v.directive} blocked ${v.blocked}`)];
  };
}

test('every page declares a policy with the script hashes and no unsafe source', async ({ page }) => {
  for (const url of ['/id/', '/en/', '/id/settings/', '/id/privacy/']) {
    await page.goto(url);
    const policy = await page
      .locator('meta[http-equiv="content-security-policy"]')
      .getAttribute('content');
    expect(policy, url).toContain("default-src 'self'");
    expect(policy, url).toContain("object-src 'none'");
    expect(policy, url).toMatch(/script-src 'self'( 'sha256-[A-Za-z0-9+/]+=*')+/);
    expect(policy, url).not.toMatch(/unsafe-inline|unsafe-eval/);
  }
});

test('the policy lists the hash of every inline script on the page, theme script included', async ({ page }) => {
  for (const url of ['/id/', '/en/settings/', '/id/privacy/', '/no-such-page/']) {
    await page.goto(url);
    const policy =
      (await page.locator('meta[http-equiv="content-security-policy"]').getAttribute('content')) ?? '';
    const scripts = await page.evaluate(() =>
      [...document.querySelectorAll('script:not([src])')]
        .filter((node) => node.getAttribute('type') !== 'application/ld+json')
        .map((node) => node.textContent ?? ''),
    );
    // The theme script is always there, so this cannot pass by checking an empty list.
    expect(scripts.some((text) => text.includes('data-theme')), url).toBe(true);
    for (const text of scripts) {
      const hash = `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;
      expect(policy, `${url}: ${text.slice(0, 40)}`).toContain(hash);
    }
  }
});

test('the policy is enforced: an injected inline script does not run', async ({ page }) => {
  const violations = await trackViolations(page);
  await page.goto('/id/');
  await page.evaluate(() => {
    const script = document.createElement('script');
    script.textContent = 'window.__injected = true';
    document.head.append(script);
  });
  expect(await page.evaluate(() => (window as unknown as { __injected?: boolean }).__injected)).toBeUndefined();
  // The browser reports the same violation as an event and as a console error.
  await expect
    .poll(async () => (await violations()).some((entry) => /script-src/.test(entry)))
    .toBe(true);
});

test('the home page runs a full test without a violation', async ({ page }) => {
  const violations = await trackViolations(page);
  await page.goto('/id/');
  await chooseMode(page, 'quote', id);
  const input = page.getByLabel(id.test.inputLabel);
  await expect(input).toBeVisible();
  const target = (await input.locator('xpath=preceding-sibling::div[1]').textContent()) ?? '';
  await input.pressSequentially(target);
  await expect(page.getByRole('heading', { name: id.results.learnedTitle })).toBeVisible();
  expect(await violations()).toEqual([]);
});

test('the saved dark theme is applied by the hashed inline script without a violation', async ({ page }) => {
  const violations = await trackViolations(page);
  await page.goto('/id/');
  await page.evaluate(() => localStorage.setItem('typing:settings:v1', JSON.stringify({ theme: 'dark' })));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await violations()).toEqual([]);
});

test('the settings page, the data tools and the privacy page run without a violation', async ({ page }) => {
  const violations = await trackViolations(page);
  await page.goto('/id/settings/');
  await page.getByRole('button', { name: id.settings.themes.light, exact: true }).click();
  await page.getByRole('button', { name: id.settings.fontSizes.lg, exact: true }).click();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: id.dataTools.exportButton, exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^typing-data-/);

  // The native confirmation dialog (showModal) needs no CSP exception.
  await page.getByRole('button', { name: id.dataTools.clearButton, exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();

  await page.goto('/id/privacy/');
  await expect(page.getByRole('heading', { level: 1, name: id.privacy.title })).toBeVisible();
  expect(await violations()).toEqual([]);
});

test('the 404 page and the root redirect load without a violation', async ({ page }) => {
  const violations = await trackViolations(page);
  await page.goto('/');
  await expect(page).toHaveURL(/\/id\/$/);
  const response = await page.goto('/no-such-page/');
  expect(response?.status()).toBe(404);
  expect(await violations()).toEqual([]);
});
