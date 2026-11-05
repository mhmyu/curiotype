import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { en } from '../../src/i18n/ui/en';
import { chooseMode, modeSelect } from './helpers';

const SETTINGS_KEY = 'typing:settings:v1';
const HISTORY_KEY = 'typing:history:v1';
const BESTS_KEY = 'typing:personal-bests:v1';

async function readKey(page: Page, key: string) {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), key);
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'page is wider than the viewport').toBeLessThanOrEqual(0);
}

/** The text a test asks for, read from the element right before the input (as the other specs do). */
async function readTarget(input: Locator): Promise<string> {
  await expect(input).toBeVisible();
  return (await input.locator('xpath=preceding-sibling::div[1]').textContent()) ?? '';
}

async function openSentenceTest(page: Page) {
  await page.goto('/en/');
  await expect(modeSelect(page, en)).toBeVisible();
  await chooseMode(page, 'quote', en);
  return page.getByLabel(en.test.inputLabel);
}

/** Replaces WebAudio with a fake that counts the clicks (one oscillator each). */
async function fakeAudio(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __clicks: number; AudioContext: unknown };
    w.__clicks = 0;
    class FakeAudioContext {
      state = 'running';
      currentTime = 0;
      destination = {};
      resume() {
        return Promise.resolve();
      }
      createOscillator() {
        w.__clicks += 1;
        return {
          type: '',
          frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
          connect() {},
          start() {},
          stop() {},
        };
      }
      createGain() {
        return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} };
      }
    }
    w.AudioContext = FakeAudioContext;
  });
}

const readClicks = (page: Page) =>
  page.evaluate(() => (window as unknown as { __clicks: number }).__clicks);

test.describe('caret style', () => {
  test('the settings page previews and saves each style, and the typing area uses it', async ({
    page,
  }) => {
    await page.goto('/en/settings/');
    const group = page.getByRole('group', { name: en.settings.caretLabel });
    const preview = page.getByTestId('caret-preview');
    await expect(group.getByRole('button')).toHaveText([
      en.settings.caretStyles.line,
      en.settings.caretStyles.block,
      en.settings.caretStyles.underline,
    ]);
    // Nothing chosen yet: the default is the vertical line.
    await expect(group.getByRole('button', { name: en.settings.caretStyles.line })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(preview).toHaveAttribute('data-caret-style', 'line');

    const pseudoBox = () =>
      preview.locator('.caret').evaluate((el) => {
        const style = getComputedStyle(el, '::before');
        return { width: parseFloat(style.width), height: parseFloat(style.height) };
      });

    expect(await pseudoBox()).toMatchObject({ width: 2 });

    await group.getByRole('button', { name: en.settings.caretStyles.underline }).click();
    await expect(preview).toHaveAttribute('data-caret-style', 'underline');
    expect(await pseudoBox()).toMatchObject({ height: 2 });
    expect((await readKey(page, SETTINGS_KEY)).caretStyle).toBe('underline');

    await group.getByRole('button', { name: en.settings.caretStyles.block }).click();
    await expect(preview).toHaveAttribute('data-caret-style', 'block');
    // A block covers the whole character, so it is much wider than the 2 px line.
    expect((await pseudoBox()).width).toBeGreaterThan(5);
    expect((await readKey(page, SETTINGS_KEY)).caretStyle).toBe('block');
    await expectNoHorizontalScroll(page);

    // The saved style is the one the typing area draws.
    const input = await openSentenceTest(page);
    await expect(input.locator('xpath=preceding-sibling::div[1]')).toHaveAttribute(
      'data-caret-style',
      'block',
    );
  });
});

test.describe('stop on error', () => {
  test('is off by default and can be switched on in the settings', async ({ page }) => {
    await page.goto('/en/settings/');
    const group = page.getByRole('group', { name: en.settings.stopOnErrorLabel });
    await expect(group.getByRole('button', { name: en.settings.off, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await group.getByRole('button', { name: en.settings.on, exact: true }).click();
    await expect(group.getByRole('button', { name: en.settings.on, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect((await readKey(page, SETTINGS_KEY)).stopOnError).toBe(true);

    const input = await openSentenceTest(page);
    await expect(input).toBeVisible();
    await expect(page.getByTestId('stop-on-error-note')).toHaveText(en.test.stopOnErrorNote);
  });

  test('a wrong character stops the cursor, the last character must be right, and records are separate', async ({
    page,
  }) => {
    await page.goto('/en/settings/');
    await page
      .getByRole('group', { name: en.settings.stopOnErrorLabel })
      .getByRole('button', { name: en.settings.on, exact: true })
      .click();
    await expect.poll(async () => (await readKey(page, SETTINGS_KEY))?.stopOnError).toBe(true);

    const input = await openSentenceTest(page);
    const target = await readTarget(input);
    expect(target.length).toBeGreaterThan(20);
    const wrongAt3 = target[3] === 'x' ? 'y' : 'x';
    const wrongLast = target.at(-1) === 'x' ? 'y' : 'x';

    // A mistake appears, but what is typed after it is refused.
    await input.pressSequentially(target.slice(0, 3));
    await input.pressSequentially(`${wrongAt3}abc`);
    await expect(input).toHaveValue(target.slice(0, 3) + wrongAt3);

    // Deleting it lets typing go on.
    await page.keyboard.press('Backspace');
    await expect(input).toHaveValue(target.slice(0, 3));
    await input.pressSequentially(target.slice(3, -1));
    await expect(input).toHaveValue(target.slice(0, -1));

    // A wrong last character does not end the test.
    await input.pressSequentially(wrongLast);
    await expect(input).toHaveValue(target.slice(0, -1) + wrongLast);
    await expect(page.getByRole('heading', { name: en.results.title })).toHaveCount(0);

    await page.keyboard.press('Backspace');
    await input.pressSequentially(target.slice(-1));
    await expect(page.getByRole('heading', { name: en.results.title })).toBeAttached();

    // The record lives in its own bucket ("soe"); the normal Sentence bucket stays empty.
    await expect.poll(() => readKey(page, BESTS_KEY)).toEqual({
      'en:quote:na:soe': expect.any(Number),
    });
    const history = await readKey(page, HISTORY_KEY);
    expect(history[0]).toMatchObject({ mode: 'quote', stopOnError: true });
    expect(history[0].errors).toBeGreaterThan(0);
    await expect(page.getByText(en.test.stopOnErrorTag).first()).toBeVisible();
  });

  test('without it, a test saves no stopOnError flag and keeps the normal record', async ({ page }) => {
    const input = await openSentenceTest(page);
    await expect(page.getByTestId('stop-on-error-note')).toHaveCount(0);
    const target = await readTarget(input);
    await input.pressSequentially(target);
    await expect(page.getByRole('heading', { name: en.results.title })).toBeAttached();

    await expect.poll(() => readKey(page, BESTS_KEY)).toEqual({
      'en:quote:na': expect.any(Number),
    });
    const history = await readKey(page, HISTORY_KEY);
    expect(history[0]).not.toHaveProperty('stopOnError');
  });
});

test.describe('typing sound', () => {
  test('is off by default: typing makes no sound', async ({ page }) => {
    await fakeAudio(page);
    const input = await openSentenceTest(page);
    const target = await readTarget(input);
    await input.pressSequentially(target.slice(0, 5));
    await expect(input).toHaveValue(target.slice(0, 5));
    expect(await readClicks(page)).toBe(0);
  });

  test('plays one click per typed character once it is on, and none when deleting', async ({
    page,
  }) => {
    await fakeAudio(page);
    await page.goto('/en/settings/');
    const group = page.getByRole('group', { name: en.settings.soundLabel });
    await expect(page.getByTestId('volume-value')).toHaveCount(0);
    await group.getByRole('button', { name: en.settings.on, exact: true }).click();
    expect((await readKey(page, SETTINGS_KEY)).sound).toBe(true);

    // The volume control appears with the saved volume (50%) and the sample button clicks once.
    await expect(page.getByTestId('volume-value')).toHaveText('50%');
    await page.getByRole('button', { name: en.settings.soundTest, exact: true }).click();
    expect(await readClicks(page)).toBe(1);

    await page.getByRole('slider', { name: new RegExp(en.settings.volumeLabel) }).fill('25');
    await expect(page.getByTestId('volume-value')).toHaveText('25%');
    await expect.poll(async () => (await readKey(page, SETTINGS_KEY)).volume).toBe(0.25);
    await expectNoHorizontalScroll(page);

    // A fresh page load starts counting from zero again.
    const input = await openSentenceTest(page);
    const target = await readTarget(input);
    expect(await readClicks(page)).toBe(0);
    await input.pressSequentially(target.slice(0, 5));
    await expect.poll(() => readClicks(page)).toBe(5);

    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await expect(input).toHaveValue(target.slice(0, 3));
    expect(await readClicks(page)).toBe(5);
  });

  test('is silent at volume 0 even when it is on', async ({ page }) => {
    await fakeAudio(page);
    await page.addInitScript((key) => {
      localStorage.setItem(key, JSON.stringify({ sound: true, volume: 0 }));
    }, SETTINGS_KEY);
    const input = await openSentenceTest(page);
    const target = await readTarget(input);
    await input.pressSequentially(target.slice(0, 4));
    await expect(input).toHaveValue(target.slice(0, 4));
    expect(await readClicks(page)).toBe(0);
  });
});

test('the Indonesian settings page has the new sections', async ({ page }) => {
  await page.goto('/id/settings/');
  for (const label of ['Gaya caret', 'Berhenti saat salah', 'Suara ketikan']) {
    await expect(page.getByRole('heading', { level: 2, name: label })).toBeVisible();
  }
  await expectNoHorizontalScroll(page);
});
