import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { en } from '../../src/i18n/ui/en';
import { modeSelect } from './helpers';

const ui = en;

/** The input is overlaid on the target text; the text is the sibling just before it. */
async function openTest(page: Page) {
  await page.goto('/en/');
  const input = page.getByLabel(ui.test.inputLabel);
  await expect(input).toBeVisible();
  const targetText = async () =>
    (await input.locator('xpath=preceding-sibling::div[1]').textContent()) ?? '';
  return { input, targetText };
}

test('Escape restarts the test and clears the input', async ({ page }) => {
  const { input, targetText } = await openTest(page);
  const target = await targetText();

  await input.pressSequentially(target.slice(0, 5));
  await expect(input).toHaveValue(target.slice(0, 5));

  await input.press('Escape');

  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();
  // A restarted test is ready again: typing works and the timer shows the full duration.
  await input.pressSequentially('a');
  await expect(input).toHaveValue('a');
});

test('the restart button clears the input and keeps typing possible', async ({ page }) => {
  const { input, targetText } = await openTest(page);
  const target = await targetText();
  await input.pressSequentially(target.slice(0, 4));

  await page.getByRole('button', { name: ui.test.restart, exact: true }).click();

  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();
});

test('time mode appends sentences before the text runs out', async ({ page }) => {
  const { input, targetText } = await openTest(page);
  const initial = await targetText();

  // Leave fewer than 80 characters (the refill threshold) untyped.
  await input.pressSequentially(initial.slice(0, initial.length - 60));

  await expect.poll(async () => (await targetText()).length).toBeGreaterThan(initial.length);
  // The new text continues the old one, separated by a single space.
  expect((await targetText()).startsWith(initial + ' ')).toBe(true);
});

test('paste is blocked', async ({ page }) => {
  const { input } = await openTest(page);
  const prevented = await input.evaluate((element) => {
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(true);
});

test('losing focus shows the overlay, and a tap on it restores focus', async ({ page }) => {
  const { input } = await openTest(page);
  const overlay = page.getByRole('button', { name: ui.test.focusLost });
  await expect(overlay).toHaveCount(0);

  await input.blur();
  await expect(overlay).toBeVisible();

  await overlay.click();
  await expect(input).toBeFocused();
  await expect(overlay).toHaveCount(0);

  // Typing works again right away.
  await input.pressSequentially('a');
  await expect(input).toHaveValue('a');
});

test('a key press brings the focus back when nothing else is focused', async ({ page }) => {
  const { input } = await openTest(page);
  await input.blur();
  await expect(page.getByRole('button', { name: ui.test.focusLost })).toBeVisible();

  await page.keyboard.press('x');

  await expect(input).toBeFocused();
  await expect(page.getByRole('button', { name: ui.test.focusLost })).toHaveCount(0);
});

test('keyboard users keep control of the focused mode select while the input has no focus', async ({
  page,
}) => {
  await openTest(page);
  const select = modeSelect(page, ui);
  await expect(select).toHaveValue('time');

  // Focusing the select moves focus away from the input; the arrow key must still change the
  // mode, and the focus must stay on the select so the next arrow key keeps browsing.
  await select.focus();
  await page.keyboard.press('ArrowDown');

  await expect(select).toHaveValue('quote');
  await expect(select).toBeFocused();
});

test('the timer keeps running while the input has no focus', async ({ page }) => {
  const { input } = await openTest(page);
  // Before the first key the duration select is shown; the countdown replaces it once it runs.
  await expect(page.getByTestId('time-readout')).toHaveCount(0);

  await input.pressSequentially('a');
  const clock = page.getByTestId('time-readout');
  await expect(clock).toBeVisible();
  const seconds = async () => {
    const [minutes, rest] = ((await clock.textContent()) ?? '').trim().split(':').map(Number);
    return (minutes ?? Number.NaN) * 60 + (rest ?? Number.NaN);
  };
  expect(await seconds()).toBeGreaterThanOrEqual(29);
  await input.blur();

  // About two seconds later the countdown must have moved on (30 s default duration).
  await expect.poll(seconds).toBeLessThanOrEqual(28);
});

/*
 * The engine compares the whole input with the target, so the caret must stay at the end. A key
 * or a click that moved it used to make the next letter land in the middle and turn the typed
 * text red.
 */
test.describe('the caret stays at the end of the typed text', () => {
  async function typeTwenty(page: Page) {
    const { input, targetText } = await openTest(page);
    const target = await targetText();
    await input.pressSequentially(target.slice(0, 20));
    await expect(input).toHaveValue(target.slice(0, 20));
    const redCount = () => input.locator('xpath=preceding-sibling::div[1]').locator('span.text-error').count();
    return { input, target, redCount };
  }

  for (const key of ['Home', 'End', 'ArrowLeft', 'ArrowUp', 'PageUp', 'Delete', 'Control+a']) {
    test(`${key} does not move the caret or shift the text`, async ({ page }) => {
      const { input, target, redCount } = await typeTwenty(page);

      await input.press(key);
      await input.pressSequentially(target.slice(20, 23));

      await expect(input).toHaveValue(target.slice(0, 23));
      expect(await redCount()).toBe(0);
    });
  }

  test('a click in the middle of the text does not move the caret', async ({ page }) => {
    const { input, target, redCount } = await typeTwenty(page);

    await input.click({ position: { x: 4, y: 4 } });
    await input.pressSequentially(target.slice(20, 23));

    await expect(input).toHaveValue(target.slice(0, 23));
    expect(await redCount()).toBe(0);
  });

  test('a caret moved by a script is put back before the next letter', async ({ page }) => {
    const { input, target, redCount } = await typeTwenty(page);

    await input.evaluate((el: HTMLInputElement) => el.setSelectionRange(0, 0));
    await input.pressSequentially(target.slice(20, 22));

    await expect(input).toHaveValue(target.slice(0, 22));
    expect(await redCount()).toBe(0);
  });

  test('Backspace still corrects a mistake at the end', async ({ page }) => {
    const { input, target, redCount } = await typeTwenty(page);

    await input.pressSequentially('#');
    expect(await redCount()).toBe(1);
    await input.press('Backspace');
    await expect(input).toHaveValue(target.slice(0, 20));
    await input.press('Backspace');
    await expect(input).toHaveValue(target.slice(0, 19));
    expect(await redCount()).toBe(0);
  });
});
