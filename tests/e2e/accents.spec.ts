import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { en } from '../../src/i18n/ui/en';
import { chooseMode } from './helpers';

/*
 * Accent-safe input (T37c, spec 21.3). The draft language `es` is set through `localStorage`
 * (it is hidden from the production select but is built and usable). Each test types a whole
 * Spanish sentence that has accents, in a different way, and expects no false error.
 */

const SETTINGS_KEY = 'typing:settings:v1';
const HISTORY_KEY = 'typing:history:v1';
const ACCENTED = /[áéíóúüñ]/;

async function readTarget(input: Locator): Promise<string> {
  return (await input.locator('xpath=preceding-sibling::div[1]').textContent()) ?? '';
}

/** Opens `/en/` with Spanish sentences, in Sentence mode, on a sentence that has an accent. */
async function openAccentedSentence(page: Page) {
  await page.addInitScript(
    ([key]) => localStorage.setItem(key, JSON.stringify({ contentLang: 'es' })),
    [SETTINGS_KEY],
  );
  await page.goto('/en/');
  await chooseMode(page, 'quote');
  const input = page.getByLabel(en.test.inputLabel);
  await expect(input).toBeVisible();
  // The sample has 20 sentences and most have accents; Esc draws another one until one does.
  for (let attempt = 0; attempt < 30 && !ACCENTED.test(await readTarget(input)); attempt++) {
    await input.press('Escape');
  }
  const target = await readTarget(input);
  expect(target).toMatch(ACCENTED);
  await expect(input).toBeFocused();
  return { input, target };
}

async function lastResult(page: Page) {
  await expect(page.getByRole('heading', { name: en.results.title })).toBeAttached();
  const history = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? '[]') as Array<Record<string, unknown>>,
    HISTORY_KEY,
  );
  return history[0];
}

test.describe('accented letters', () => {
  test('precomposed letters (e with acute as one character) finish with no error', { tag: '@smoke' }, async ({
    page,
  }) => {
    const { target } = await openAccentedSentence(page);
    for (const char of target) await page.keyboard.insertText(char);

    expect(await lastResult(page)).toMatchObject({ contentLang: 'es', accuracy: 100, errors: 0 });
  });

  test('decomposed letters (base letter, then a combining mark) finish with no error', async ({
    page,
  }) => {
    const { target } = await openAccentedSentence(page);
    // Every accented letter arrives as two separate input events: the bare letter, then the mark.
    for (const char of target) {
      const parts = char.normalize('NFD');
      if (parts.length === 1) {
        await page.keyboard.insertText(char);
        continue;
      }
      await page.keyboard.insertText(parts[0]);
      // Between the two events the field holds the bare letter; the field must stay in step.
      await page.keyboard.insertText(parts.slice(1));
    }

    expect(await lastResult(page)).toMatchObject({ contentLang: 'es', accuracy: 100, errors: 0 });
  });

  test('one decomposed insertion (e + U+0301 at once) counts once and keeps the field in step', async ({
    page,
  }) => {
    const { input, target } = await openAccentedSentence(page);
    const firstAccent = [...target].findIndex((char) => ACCENTED.test(char));
    const before = target.slice(0, firstAccent);

    await page.keyboard.insertText(before);
    await page.keyboard.insertText(target[firstAccent].normalize('NFD'));

    // The field holds the NFC letter, so its length matches the target text position.
    await expect(input).toHaveValue(target.slice(0, firstAccent + 1));
  });

  test('a missing accent is one error, not a stuck cursor', async ({ page }) => {
    const { input, target } = await openAccentedSentence(page);
    const bare = target.normalize('NFD').replace(/\p{M}/gu, '');
    await input.pressSequentially(bare);

    const result = await lastResult(page);
    expect(result).toMatchObject({ contentLang: 'es' });
    expect(result.errors).toBeGreaterThan(0);
    expect(result.accuracy).toBeLessThan(100);
  });

  test('a dead key composition (compositionstart to compositionend) counts once with no false error', async ({
    page,
  }) => {
    const { input, target } = await openAccentedSentence(page);
    const firstAccent = [...target].findIndex((char) => ACCENTED.test(char));
    const accented = target[firstAccent];
    const cdp = await page.context().newCDPSession(page);

    // Type the text before the first accent, then compose the accented letter like a dead key
    // does: a provisional mark, the provisional letter, then the commit.
    await page.keyboard.insertText(target.slice(0, firstAccent));
    await cdp.send('Input.imeSetComposition', { text: '´', selectionStart: 1, selectionEnd: 1 });
    await cdp.send('Input.imeSetComposition', { text: accented, selectionStart: 1, selectionEnd: 1 });
    // While the composition is open the engine has seen nothing of it.
    await cdp.send('Input.insertText', { text: accented });

    await expect(input).toHaveValue(target.slice(0, firstAccent + 1));
    // The rest of the sentence still types normally and ends with no error.
    await page.keyboard.insertText(target.slice(firstAccent + 1));
    expect(await lastResult(page)).toMatchObject({ contentLang: 'es', accuracy: 100, errors: 0 });
  });

  test('Escape during a composition does not restart the test', async ({ page }) => {
    const { input, target } = await openAccentedSentence(page);
    const cdp = await page.context().newCDPSession(page);

    await page.keyboard.insertText(target.slice(0, 3));
    await cdp.send('Input.imeSetComposition', { text: '´', selectionStart: 1, selectionEnd: 1 });
    await page.keyboard.press('Escape');

    // Committing the next character keeps the first three: the test was not restarted (a restart
    // would have emptied the field, and the commit would leave this character alone).
    await cdp.send('Input.insertText', { text: target[3] });
    await expect(input).toHaveValue(target.slice(0, 4));
  });
});
