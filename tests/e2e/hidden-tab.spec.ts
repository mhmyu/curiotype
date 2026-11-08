import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { en } from '../../src/i18n/ui/en';
import { id } from '../../src/i18n/ui/id';
import { chooseMode } from './helpers';

/**
 * A running test whose tab stays hidden for 5 seconds is cancelled and not counted. The tests fake
 * the clock (so nobody waits five real seconds) and fake the page visibility.
 */
const ui = en;

async function setHidden(page: Page, hidden: boolean) {
  await page.evaluate((value) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => value });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => (value ? 'hidden' : 'visible'),
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

async function openRunningTest(page: Page, path = '/en/', dictionary = ui) {
  await page.clock.install();
  await page.goto(path);
  const input = page.getByLabel(dictionary.test.inputLabel);
  await expect(input).toBeEnabled();
  await input.pressSequentially('abc');
  await expect(page.getByTestId('time-readout')).toBeVisible();
  return input;
}

const stored = (page: Page, key: string) => page.evaluate((k) => localStorage.getItem(k), key);

test('a test hidden for more than five seconds is cancelled and not counted', async ({ page }) => {
  const input = await openRunningTest(page);

  await setHidden(page, true);
  await page.clock.fastForward(6000);
  await setHidden(page, false);

  const notice = page.getByTestId('test-stopped');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText(ui.test.stoppedTitle);
  await expect(notice).toContainText('5');
  await expect(input).toHaveCount(0);
  // Nothing was saved: no history, no personal best, no streak.
  expect(await stored(page, 'typing:history:v1')).toBeNull();
  expect(await stored(page, 'typing:personal-bests:v1')).toBeNull();
  expect(await stored(page, 'typing:streak:v1')).toBeNull();
});

test('Try again and Escape start a new test after a cancelled one', async ({ page }) => {
  await openRunningTest(page);
  await setHidden(page, true);
  await page.clock.fastForward(6000);
  await setHidden(page, false);
  await expect(page.getByTestId('test-stopped')).toBeVisible();

  await page.getByTestId('stopped-retry').click();
  const input = page.getByLabel(ui.test.inputLabel);
  await expect(input).toBeVisible();
  await expect(input).toHaveValue('');
  await expect(page.getByTestId('test-stopped')).toHaveCount(0);

  // Escape does the same from the notice.
  await input.pressSequentially('abc');
  await setHidden(page, true);
  await page.clock.fastForward(6000);
  await setHidden(page, false);
  await expect(page.getByTestId('test-stopped')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByLabel(ui.test.inputLabel)).toHaveValue('');
});

test('a tab hidden for less than five seconds changes nothing', async ({ page }) => {
  const input = await openRunningTest(page);

  await setHidden(page, true);
  await page.clock.fastForward(2000);
  await setHidden(page, false);
  // The timer of the first absence must be gone: much later the test is still running.
  await page.clock.fastForward(10_000);

  await expect(page.getByTestId('test-stopped')).toHaveCount(0);
  await input.pressSequentially('de');
  await expect(input).toHaveValue('abcde');
});

test('a test that has not started is not touched by a hidden tab', async ({ page }) => {
  await page.clock.install();
  await page.goto('/en/');
  const input = page.getByLabel(ui.test.inputLabel);
  await expect(input).toBeEnabled();

  await setHidden(page, true);
  await page.clock.fastForward(8000);
  await setHidden(page, false);

  await expect(page.getByTestId('test-stopped')).toHaveCount(0);
  await expect(input).toBeVisible();
});

test('relaxed mode is not affected', async ({ page }) => {
  await page.clock.install();
  await page.goto('/en/');
  await chooseMode(page, 'relaxed', ui);
  const input = page.getByLabel(ui.test.inputLabel);
  await expect(input).toBeVisible();
  await input.pressSequentially('abc');

  await setHidden(page, true);
  await page.clock.fastForward(8000);
  await setHidden(page, false);

  await expect(page.getByTestId('test-stopped')).toHaveCount(0);
  await expect(input).toBeVisible();
});

test('the notice is in the page language', async ({ page }) => {
  await openRunningTest(page, '/id/', id);
  await setHidden(page, true);
  await page.clock.fastForward(6000);
  await setHidden(page, false);

  await expect(page.getByTestId('test-stopped')).toContainText(id.test.stoppedTitle);
  await expect(page.getByTestId('stopped-retry')).toHaveText(id.results.tryAgain);
});
