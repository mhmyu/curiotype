import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { en } from '../../src/i18n/ui/en';
import { id } from '../../src/i18n/ui/id';
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

/*
 * Only the edits of typing may change the field (input-types.ts). Everything else is cancelled in
 * beforeinput: undo, redo, cut, drop, replaced words, line breaks, forward deletes.
 */
test.describe('only typing edits reach the field', () => {
  async function typeTwenty(page: Page) {
    const { input, targetText } = await openTest(page);
    const target = await targetText();
    await input.pressSequentially(target.slice(0, 20));
    await expect(input).toHaveValue(target.slice(0, 20));
    return { input, target };
  }

  test('Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z do not change the typed text', async ({ page }) => {
    const { input, target } = await typeTwenty(page);

    for (const key of ['Control+z', 'Control+y', 'Control+Shift+z']) await input.press(key);

    await expect(input).toHaveValue(target.slice(0, 20));
    await input.pressSequentially(target.slice(20, 22));
    await expect(input).toHaveValue(target.slice(0, 22));
  });

  test('forbidden edit kinds are cancelled and typing kinds are not', async ({ page }) => {
    const { input } = await typeTwenty(page);

    const cancelled = await input.evaluate((element) => {
      const kinds = [
        'historyUndo',
        'historyRedo',
        'deleteByCut',
        'insertFromDrop',
        'insertFromPaste',
        'insertReplacementText',
        'insertTranscription',
        'insertLineBreak',
        'insertParagraph',
        'deleteContentForward',
        'deleteSoftLineBackward',
        'deleteHardLineBackward',
        'insertText',
        'deleteContentBackward',
        'deleteWordBackward',
      ];
      const result: Record<string, boolean> = {};
      for (const inputType of kinds) {
        const event = new InputEvent('beforeinput', { inputType, bubbles: true, cancelable: true });
        element.dispatchEvent(event);
        result[inputType] = event.defaultPrevented;
      }
      return result;
    });

    for (const [kind, prevented] of Object.entries(cancelled)) {
      const typing = ['insertText', 'deleteContentBackward', 'deleteWordBackward'].includes(kind);
      expect(prevented, kind).toBe(!typing);
    }
  });

  test('Ctrl+Backspace still deletes a word at the end', async ({ page }) => {
    const { input } = await openTest(page);
    await input.pressSequentially('ab cd');

    await input.press('Control+Backspace');

    await expect(input).toHaveValue('ab ');
  });
});

/*
 * A short note shows while Caps Lock is on. Browsers only tell on key events, so the tests send
 * key events that carry the Caps Lock state. The note uses the Restart row: nothing moves.
 */
test.describe('Caps Lock note', () => {
  type KeyEventKind = 'keydown' | 'keyup';

  async function sendKey(input: Locator, kind: KeyEventKind, capsLock: boolean) {
    await input.evaluate(
      (element, args) => {
        element.dispatchEvent(
          new KeyboardEvent(args.kind, { key: 'a', bubbles: true, modifierCapsLock: args.capsLock }),
        );
      },
      { kind, capsLock },
    );
  }

  test('shows while Caps Lock is on and goes away when it is off', async ({ page }) => {
    const { input } = await openTest(page);
    const note = page.getByTestId('caps-lock-note');
    await expect(note).toHaveCount(0);

    await sendKey(input, 'keydown', true);
    await expect(note).toHaveText(ui.test.capsLock);

    await sendKey(input, 'keyup', false);
    await expect(note).toHaveCount(0);

    // Real key presses report Caps Lock off, so typing clears a stale note too.
    await sendKey(input, 'keydown', true);
    await expect(note).toBeVisible();
    await input.pressSequentially('a');
    await expect(note).toHaveCount(0);
  });

  test('goes away when the field loses focus', async ({ page }) => {
    const { input } = await openTest(page);
    await sendKey(input, 'keydown', true);
    await expect(page.getByTestId('caps-lock-note')).toBeVisible();

    await input.blur();

    await expect(page.getByTestId('caps-lock-note')).toHaveCount(0);
  });

  test('the note is announced through a status region that is always present', async ({ page }) => {
    const { input } = await openTest(page);
    const region = page.getByTestId('caps-lock-region');
    await expect(region).toHaveAttribute('role', 'status');
    await expect(region).toHaveText('');

    await sendKey(input, 'keydown', true);

    await expect(region).toHaveText(ui.test.capsLock);
  });

  for (const [path, dictionary] of [
    ['/en/', en],
    ['/id/', id],
  ] as const) {
    test(`the note does not move anything at 320 px (${path})`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await page.goto(path);
      const input = page.getByLabel(dictionary.test.inputLabel);
      await expect(input).toBeEnabled();
      const restart = page.getByRole('button', { name: dictionary.test.restart, exact: true });
      const measure = async () => ({
        height: await page.evaluate(() => document.documentElement.scrollHeight),
        restart: await restart.boundingBox(),
      });
      const before = await measure();

      await sendKey(input, 'keydown', true);
      await expect(page.getByTestId('caps-lock-note')).toBeVisible();
      const after = await measure();

      expect(after.height).toBe(before.height);
      expect(after.restart?.y).toBe(before.restart?.y);
      expect(after.restart?.height).toBe(before.restart?.height);
      // No horizontal scroll either.
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }
});

test('the input asks browser helpers and extensions to leave it alone', async ({ page }) => {
  const { input } = await openTest(page);
  const expected = {
    autocomplete: 'off',
    autocapitalize: 'off',
    autocorrect: 'off',
    spellcheck: 'false',
    'data-gramm': 'false',
    'data-gramm_editor': 'false',
    'data-enable-grammarly': 'false',
    'data-lpignore': 'true',
    'data-1p-ignore': 'true',
    'data-form-type': 'other',
  };
  for (const [name, value] of Object.entries(expected)) {
    await expect(input, name).toHaveAttribute(name, value);
  }
});

/*
 * A change the typing did not make (an extension or a script rewriting the field) must not reach
 * the engine: the last good text is put back (input-recovery.ts).
 */
test.describe('a change the typing did not make is undone', () => {
  async function typeTwenty(page: Page) {
    const { input, targetText } = await openTest(page);
    const target = await targetText();
    await input.pressSequentially(target.slice(0, 20));
    await expect(input).toHaveValue(target.slice(0, 20));
    const redCount = () => input.locator('xpath=preceding-sibling::div[1]').locator('span.text-error').count();
    return { input, target, redCount };
  }

  test('text appended by a script is thrown away', async ({ page }) => {
    const { input, target, redCount } = await typeTwenty(page);

    await input.evaluate((el: HTMLInputElement) => {
      el.value += ' inserted by an extension';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await expect(input).toHaveValue(target.slice(0, 20));
    expect(await redCount()).toBe(0);
    await input.pressSequentially(target.slice(20, 23));
    await expect(input).toHaveValue(target.slice(0, 23));
  });

  test('text rewritten in the middle is put back', async ({ page }) => {
    const { input, target, redCount } = await typeTwenty(page);

    await input.evaluate((el: HTMLInputElement) => {
      el.value = 'ZZZ' + el.value.slice(3);
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'Z' }));
    });

    await expect(input).toHaveValue(target.slice(0, 20));
    expect(await redCount()).toBe(0);
  });

  test('two characters in one event are accepted, and Backspace works afterwards', async ({ page }) => {
    const { input, target } = await typeTwenty(page);

    await page.keyboard.insertText(target.slice(20, 22));
    await expect(input).toHaveValue(target.slice(0, 22));

    await input.press('Backspace');
    await expect(input).toHaveValue(target.slice(0, 21));
  });

  test('Ctrl+Backspace still removes a word and the next letters are accepted', async ({ page }) => {
    const { input, target } = await typeTwenty(page);

    await input.press('Control+Backspace');
    const afterWord = await input.inputValue();
    expect(afterWord.length).toBeLessThan(20);
    expect(target.startsWith(afterWord)).toBe(true);

    await input.pressSequentially(target.slice(afterWord.length, afterWord.length + 2));
    await expect(input).toHaveValue(target.slice(0, afterWord.length + 2));
  });
});
