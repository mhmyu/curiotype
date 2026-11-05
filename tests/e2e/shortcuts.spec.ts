import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { en } from '../../src/i18n/ui/en';
import { chooseMode } from './helpers';

/** A little more than the 600 ms Enter guard (`RESULT_SHORTCUT_DELAY_MS`). */
const PAST_GUARD_MS = 700;

async function readTarget(input: Locator): Promise<string> {
  return (await input.locator('xpath=preceding-sibling::div[1]').textContent()) ?? '';
}

/** Opens `/en/` in Sentence mode and types the whole sentence, so the result is on screen. */
async function finishSentence(page: Page) {
  await page.goto('/en/');
  await chooseMode(page, 'quote', en);
  const input = page.getByLabel(en.test.inputLabel);
  await expect(input).toBeVisible();
  await input.pressSequentially(await readTarget(input));
  await expect(page.getByRole('heading', { name: en.results.title })).toBeAttached();
}

const resultsHeading = (page: Page) => page.getByRole('heading', { name: en.results.title });

test('Enter on the result starts a new test once the guard time has passed', async ({ page }) => {
  await finishSentence(page);
  await page.waitForTimeout(PAST_GUARD_MS);

  await page.keyboard.press('Enter');

  await expect(resultsHeading(page)).toHaveCount(0);
  await expect(page.getByLabel(en.test.inputLabel)).toBeFocused();
});

test('Enter right after the result appears is ignored (habitual Enter at the end)', async ({ page }) => {
  await finishSentence(page);

  await page.keyboard.press('Enter');

  await expect(resultsHeading(page)).toBeAttached();
  // Once the guard time has passed the same key works.
  await page.waitForTimeout(PAST_GUARD_MS);
  await page.keyboard.press('Enter');
  await expect(resultsHeading(page)).toHaveCount(0);
});

test('Escape on the result works at once, like Try again', async ({ page }) => {
  await finishSentence(page);

  await page.keyboard.press('Escape');

  await expect(resultsHeading(page)).toHaveCount(0);
  const input = page.getByLabel(en.test.inputLabel);
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('');
});

test('Enter with the focus on the star keeps its own action and does not start a test', async ({
  page,
}) => {
  await finishSentence(page);
  await page.waitForTimeout(PAST_GUARD_MS);

  const star = page.getByRole('button', { name: en.results.saveToCollection }).first();
  await star.focus();
  await expect(star).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Enter');

  await expect(star).toHaveAttribute('aria-pressed', 'true');
  await expect(resultsHeading(page)).toBeAttached();
});

test('Tab from the typing area lands on Restart, and Enter there restarts', async ({ page }) => {
  await page.goto('/en/');
  const input = page.getByLabel(en.test.inputLabel);
  await expect(input).toBeVisible();
  await input.focus();
  await input.pressSequentially('ab');

  await page.keyboard.press('Tab');
  const restart = page.getByRole('button', { name: en.test.restart, exact: true });
  await expect(restart).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();
});

test('relaxed mode: Enter on the session summary starts a new session', async ({ page }) => {
  await page.goto('/en/');
  await chooseMode(page, 'relaxed');
  await expect(page.getByTestId('relaxed-number')).toBeVisible();

  const input = page.getByLabel(en.test.inputLabel);
  await input.pressSequentially(await readTarget(input));
  await expect(page.getByTestId('relaxed-card')).toBeVisible();
  await page.getByTestId('relaxed-finish').click();
  await expect(page.getByTestId('relaxed-summary')).toBeVisible();

  // Inside the guard time nothing happens.
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('relaxed-summary')).toBeVisible();

  await page.waitForTimeout(PAST_GUARD_MS);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('relaxed-summary')).toHaveCount(0);
  await expect(page.getByTestId('relaxed-number')).toHaveText('Sentence 1');
});

test('relaxed mode: Enter on the card still means "Continue" (unchanged)', async ({ page }) => {
  await page.goto('/en/');
  await chooseMode(page, 'relaxed');
  const input = page.getByLabel(en.test.inputLabel);
  await input.pressSequentially(await readTarget(input));
  await expect(page.getByTestId('relaxed-card')).toBeVisible();

  await page.keyboard.press('Enter');

  await expect(page.getByTestId('relaxed-number')).toHaveText('Sentence 2');
});

test('custom text: Enter in the editor adds a line break and starts nothing; on the result it repeats the same text', async ({
  page,
}) => {
  await page.goto('/en/');
  await chooseMode(page, 'custom');

  const editor = page.getByTestId('custom-text-input');
  await editor.fill('Typing is fun.');
  await editor.press('Enter');
  await expect(editor).toBeFocused();
  await expect(editor).toHaveValue('Typing is fun.\n');
  await expect(page.getByTestId('custom-text-start')).toBeVisible();

  await page.getByTestId('custom-text-start').click();
  const input = page.getByLabel(en.test.inputLabel);
  await expect(input).toBeVisible();
  await input.pressSequentially('Typing is fun.');
  await expect(resultsHeading(page)).toBeAttached();

  await page.waitForTimeout(PAST_GUARD_MS);
  await page.keyboard.press('Enter');

  await expect(resultsHeading(page)).toHaveCount(0);
  expect(await readTarget(input)).toBe('Typing is fun.');
  await expect(input).toHaveValue('');
});

test('on a touch screen the keyboard hints are hidden', async ({ page }) => {
  await finishSentence(page);
  await expect(page.getByTestId('shortcut-hint-retry')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('shortcut-hint-restart')).toBeHidden();
});

test.describe('with a mouse or trackpad', () => {
  test.use({ hasTouch: false, isMobile: false });

  test('the keyboard hints are shown', async ({ page }) => {
    await page.goto('/en/');
    const restartHint = page.getByTestId('shortcut-hint-restart');
    await expect(restartHint).toBeVisible();
    await expect(restartHint).toContainText(`Esc: ${en.test.shortcutRestart}`);

    await chooseMode(page, 'quote', en);
    const input = page.getByLabel(en.test.inputLabel);
    await input.pressSequentially(await readTarget(input));
    const retryHint = page.getByTestId('shortcut-hint-retry');
    await expect(retryHint).toBeVisible();
    await expect(retryHint).toContainText(`Enter: ${en.results.shortcutRetry}`);
  });
});
