import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { en } from '../../src/i18n/ui/en';
import {
  chooseDuration,
  chooseMode,
  contentLangSelect,
  countSelect,
  durationSelect,
  modeSelect,
  openFilters,
} from './helpers';

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'page is wider than the viewport').toBeLessThanOrEqual(0);
}

async function openHome(page: Page) {
  await page.goto('/en/');
  await expect(page.getByLabel(en.test.inputLabel)).toBeVisible();
}

test('the mode is one select with every mode, starting on Time', async ({ page }) => {
  await openHome(page);
  const select = modeSelect(page);

  await expect(select).toHaveValue('time');
  // The options show the short names (the select stays narrow); the full names are the tooltips.
  await expect(select.getByRole('option')).toHaveText([
    en.test.modesShort.time,
    en.test.modesShort.quote,
    en.test.modesShort.count,
    en.test.modesShort.relaxed,
    en.test.modesShort.custom,
  ]);

  // Every mode, Relaxed and Own text included, is one selectOption away.
  await chooseMode(page, 'quote');
  await expect(select).toHaveValue('quote');
  await chooseMode(page, 'relaxed');
  await expect(select).toHaveValue('relaxed');
  await chooseMode(page, 'time');
  await expect(select).toHaveValue('time');
});

test('the mode select keeps the focus after a change and a reload starts on Time again', async ({
  page,
}) => {
  await openHome(page);
  const select = modeSelect(page);
  await select.focus();
  await select.selectOption('count');
  await expect(select).toBeFocused();

  // The choice is not remembered.
  await page.reload();
  await expect(modeSelect(page)).toHaveValue('time');
});

test('Esc on the mode select does not restart the test', async ({ page }) => {
  await openHome(page);
  const input = page.getByLabel(en.test.inputLabel);
  const target = (await input.locator('xpath=preceding-sibling::div[1]').textContent()) ?? '';
  await input.pressSequentially(target.slice(0, 5));
  await expect(input).toHaveValue(target.slice(0, 5));

  await modeSelect(page).focus();
  await page.keyboard.press('Escape');
  await expect(input).toHaveValue(target.slice(0, 5));
});

test('duration and count are selects: mm:ss for Time (00:30 by default), numbers for Count', async ({
  page,
}) => {
  await openHome(page);
  const durations = durationSelect(page);
  await expect(durations).toHaveValue('30');
  await expect(durations.getByRole('option')).toHaveText(['00:15', '00:30', '01:00', '02:00']);
  await expect(countSelect(page)).toHaveCount(0);

  // Changing the duration restarts the test and keeps the focus on the select.
  await durations.focus();
  await chooseDuration(page, 60);
  await expect(durations).toHaveValue('60');
  await expect(durations).toBeFocused();

  // In Count mode the duration select is replaced by the sentence-count select.
  await chooseMode(page, 'count');
  const counts = countSelect(page);
  await expect(durationSelect(page)).toHaveCount(0);
  await expect(counts.getByRole('option')).toHaveText(['1', '3', '5', '10']);
  await expect(counts).toHaveValue('3');
});

test('the controls are in the order language, mode, duration, Filter, and Tab follows it', async ({
  page,
}) => {
  await openHome(page);
  const row = page.getByTestId('controls-row');

  // DOM order (the visual order is the same: the row has no `order` styles).
  const names = await row
    .locator('select, button')
    .evaluateAll((items) => items.map((i) => i.getAttribute('aria-label')));
  expect(names).toEqual([
    en.test.contentLangLabel,
    en.test.modeLabel,
    en.test.durationLabel,
    en.test.filters,
  ]);

  // Tab walks the same order and then reaches the typing box (no positive tabindex anywhere).
  await contentLangSelect(page).focus();
  await page.keyboard.press('Tab');
  await expect(modeSelect(page)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(durationSelect(page)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('filters-toggle')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel(en.test.inputLabel)).toBeFocused();
});

test('only Time and Count have a second select; the other modes have none', async ({ page }) => {
  await openHome(page);
  const expected = {
    time: { duration: 1, count: 0 },
    quote: { duration: 0, count: 0 },
    count: { duration: 0, count: 1 },
    relaxed: { duration: 0, count: 0 },
    custom: { duration: 0, count: 0 },
  } as const;
  for (const [mode, counts] of Object.entries(expected)) {
    await chooseMode(page, mode as keyof typeof expected);
    await expect(durationSelect(page), `duration in ${mode}`).toHaveCount(counts.duration);
    await expect(countSelect(page), `count in ${mode}`).toHaveCount(counts.count);
  }
});

test('changing the duration or the count keeps the focus on the select', async ({ page }) => {
  await openHome(page);
  const input = page.getByLabel(en.test.inputLabel);

  await durationSelect(page).focus();
  await durationSelect(page).selectOption('15');
  await expect(input).toHaveValue('');
  await expect(durationSelect(page)).toBeFocused();

  // In Count mode the count select stays while the test runs, so it can be changed midway: the
  // change starts a new test (the typed text is gone) and the focus stays on the select.
  await chooseMode(page, 'count');
  await input.pressSequentially('a');
  await expect(input).toHaveValue('a');
  await countSelect(page).focus();
  await countSelect(page).selectOption('5');
  await expect(input).toHaveValue('');
  await expect(countSelect(page)).toBeFocused();
});

test('the sentence language is a select above the typing box, left of the Filter button', async ({
  page,
}) => {
  await openHome(page);
  const select = contentLangSelect(page);
  const filters = page.getByTestId('filters-toggle');
  const input = page.getByLabel(en.test.inputLabel);

  const [s, f, i] = await Promise.all([
    select.boundingBox(),
    filters.boundingBox(),
    input.boundingBox(),
  ]);
  if (!s || !f || !i) throw new Error('controls are not laid out');
  expect(s.y + s.height).toBeLessThanOrEqual(i.y);
  expect(f.y + f.height).toBeLessThanOrEqual(i.y);
  expect(s.x).toBeLessThan(f.x);
  expect(s.width).toBeLessThan(300); // as wide as its content, not the whole row
});

test('the Filter panel starts closed, counts active filters and Esc closes only the panel', async ({
  page,
}) => {
  await openHome(page);
  const toggle = page.getByTestId('filters-toggle');
  await expect(toggle).toHaveAttribute('aria-label', en.test.filters);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#filter-panel')).toHaveCount(0);

  await chooseMode(page, 'quote');
  const panel = await openFilters(page);
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(toggle).toHaveAttribute('aria-controls', 'filter-panel');

  await panel.getByLabel(en.test.categoryLabel).selectOption('science');
  await expect(toggle).toHaveAttribute('aria-label', `${en.test.filters} (1)`);
  await panel.getByLabel(en.test.difficultyLabel).selectOption('easy');
  await expect(toggle).toHaveAttribute('aria-label', `${en.test.filters} (2)`);
  await panel.getByRole('button', { name: en.test.focusWeakKeys, exact: true }).click();
  await expect(toggle).toHaveAttribute('aria-label', `${en.test.filters} (3)`);

  // Esc inside the panel closes it, keeps the filters and does not restart the test.
  const input = page.getByLabel(en.test.inputLabel);
  const target = (await input.locator('xpath=preceding-sibling::div[1]').textContent()) ?? '';
  await input.pressSequentially(target.slice(0, 4));
  await panel.getByLabel(en.test.categoryLabel).focus();
  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-label', `${en.test.filters} (3)`);
  await expect(input).toHaveValue(target.slice(0, 4));

  // Clearing them brings the plain label back.
  const reopened = await openFilters(page);
  await reopened.getByLabel(en.test.categoryLabel).selectOption('all');
  await reopened.getByLabel(en.test.difficultyLabel).selectOption('all');
  await reopened.getByRole('button', { name: en.test.focusWeakKeys, exact: true }).click();
  await expect(toggle).toHaveAttribute('aria-label', en.test.filters);
});

test('Own text has no Filter button; Relaxed has it without weak-key practice', async ({ page }) => {
  await openHome(page);
  await chooseMode(page, 'custom');
  await expect(page.getByTestId('filters-toggle')).toHaveCount(0);

  await chooseMode(page, 'relaxed');
  const panel = await openFilters(page);
  await expect(panel.getByLabel(en.test.difficultyLabel)).toBeVisible();
  await expect(panel.getByRole('button', { name: en.test.focusWeakKeys })).toHaveCount(0);
});

for (const width of [320, 360, 390]) {
  test(`no horizontal page scroll at ${width}px with every panel open`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await openHome(page);
    await expectNoHorizontalScroll(page);

    await chooseMode(page, 'count');
    await expectNoHorizontalScroll(page);

    await chooseMode(page, 'relaxed');
    await expectNoHorizontalScroll(page);

    await openFilters(page);
    await expectNoHorizontalScroll(page);
  });
}

// T38a3: language, mode, duration (or count) and Filter share one row at 390 and 360px, in every mode.
// Below 360px the row may wrap as a last resort (never a horizontal page scroll; see the width tests).
for (const width of [390, 360]) {
  test(`the controls fit one row at ${width}px in every mode`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await openHome(page);
    const row = page.getByTestId('controls-row');
    for (const mode of ['time', 'quote', 'count', 'relaxed', 'custom'] as const) {
      await chooseMode(page, mode);
      if (mode === 'count') await countSelect(page).selectOption('10');
      const tops = await row
        .locator('> *')
        .evaluateAll((items) => [...new Set(items.map((i) => Math.round(i.getBoundingClientRect().top)))]);
      expect(tops, `mode ${mode}`).toHaveLength(1);
    }
  });
}

// T38b: the time readout (spec 22.4).
async function typeFirstKey(page: Page) {
  await page.getByLabel(en.test.inputLabel).pressSequentially('a');
}

test('Time: the countdown replaces the duration select in place, with the same box', async ({
  page,
}) => {
  await openHome(page);
  await chooseDuration(page, 60);
  const select = durationSelect(page);
  const before = await select.boundingBox();
  const input = page.getByLabel(en.test.inputLabel);
  const typingBefore = await input.boundingBox();
  if (!before || !typingBefore) throw new Error('controls are not laid out');
  await expect(page.getByTestId('time-readout')).toHaveCount(0);

  await typeFirstKey(page);
  const readout = page.getByTestId('time-readout');
  await expect(readout).toBeVisible();
  await expect(readout).toHaveText(/^(01:00|00:5\d)$/);
  await expect(readout).toHaveAttribute('role', 'timer');
  await expect(readout).toHaveAttribute('aria-live', 'off');
  // The select is hidden while the test runs (not focusable, not announced).
  await expect(durationSelect(page)).toHaveCount(0);

  const after = await readout.boundingBox();
  if (!after) throw new Error('the readout is not laid out');
  expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(1);
  // Nothing moves when the test starts.
  const typingAfter = await input.boundingBox();
  expect(typingAfter?.y).toBeCloseTo(typingBefore.y, 0);

  // Esc restarts: the select is back with the duration chosen before.
  await page.keyboard.press('Escape');
  await expect(readout).toHaveCount(0);
  await expect(durationSelect(page)).toHaveValue('60');
});

test('Time: the select is back with the same duration when the test has finished', async ({
  page,
}) => {
  await openHome(page);
  await chooseDuration(page, 15);
  await typeFirstKey(page);
  await expect(page.getByTestId('time-readout')).toBeVisible();

  // The countdown ends on its own: the result appears and the select returns.
  await expect(page.getByRole('heading', { name: en.results.title })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('time-readout')).toHaveCount(0);
  await expect(durationSelect(page)).toHaveValue('15');
});

test('Sentence: the elapsed time sits in the row from the start and counts up', async ({ page }) => {
  await openHome(page);
  await chooseMode(page, 'quote');
  const readout = page.getByTestId('time-readout');
  await expect(readout).toHaveText('00:00');
  const row = page.getByTestId('controls-row');
  expect(await row.locator('[data-testid="time-readout"]').count()).toBe(1);

  const input = page.getByLabel(en.test.inputLabel);
  const typingBefore = await input.boundingBox();
  await typeFirstKey(page);
  await expect(readout).toHaveText('00:01', { timeout: 5_000 });
  expect((await input.boundingBox())?.y).toBeCloseTo(typingBefore?.y ?? -1, 0);
});

test('Count: the count select stays while running, with the elapsed time in a line below the row', async ({
  page,
}) => {
  await openHome(page);
  await chooseMode(page, 'count');
  const readout = page.getByTestId('time-readout');
  await expect(readout).toHaveText('00:00');
  // Not inside the row (it would not fit one row at 360 px), but right below it.
  const row = page.getByTestId('controls-row');
  expect(await row.locator('[data-testid="time-readout"]').count()).toBe(0);
  const rowBox = await row.boundingBox();
  const readoutBox = await readout.boundingBox();
  if (!rowBox || !readoutBox) throw new Error('controls are not laid out');
  expect(readoutBox.y).toBeGreaterThanOrEqual(rowBox.y + rowBox.height - 1);

  const typingBefore = await page.getByLabel(en.test.inputLabel).boundingBox();
  await typeFirstKey(page);
  await expect(readout).toHaveText('00:01', { timeout: 5_000 });
  await expect(countSelect(page)).toBeVisible();
  expect((await page.getByLabel(en.test.inputLabel).boundingBox())?.y).toBeCloseTo(
    typingBefore?.y ?? -1,
    0,
  );
});

test('Relaxed and the Own text editor have no readout', async ({ page }) => {
  await openHome(page);
  await chooseMode(page, 'relaxed');
  await expect(page.getByTestId('time-readout')).toHaveCount(0);
  await chooseMode(page, 'custom');
  await expect(page.getByTestId('time-readout')).toHaveCount(0);
});

// T38c: the progress bar of Time mode (spec 22.5).
/** Share of the track the fill still covers (0 to 1), read from the real boxes. */
async function barShare(page: Page): Promise<number> {
  return page.evaluate(() => {
    const track = document.querySelector('[data-testid="time-bar"]')?.getBoundingClientRect();
    const fill = document.querySelector('[data-testid="time-bar-fill"]')?.getBoundingClientRect();
    if (!track || !fill) throw new Error('the progress bar is not there');
    return Math.max(0, Math.min(1, (fill.right - track.left) / track.width));
  });
}

test('Time: the bar sits right above the typing box, is decorative and is full before the start', async ({
  page,
}) => {
  await openHome(page);
  const bar = page.getByTestId('time-bar');
  await expect(bar).toBeVisible();
  await expect(bar).toHaveAttribute('aria-hidden', 'true');
  const barBox = await bar.boundingBox();
  const inputBox = await page.getByLabel(en.test.inputLabel).boundingBox();
  if (!barBox || !inputBox) throw new Error('not laid out');
  expect(Math.round(barBox.height)).toBe(8);
  expect(barBox.y + barBox.height).toBeLessThanOrEqual(inputBox.y);
  expect(inputBox.y - (barBox.y + barBox.height)).toBeLessThan(24);
  expect(await barShare(page)).toBeCloseTo(1, 1);
});

test('Time: the bar shrinks while the test runs and nothing moves when it starts', async ({
  page,
}) => {
  await openHome(page);
  await chooseDuration(page, 15);
  const input = page.getByLabel(en.test.inputLabel);
  const before = await input.boundingBox();
  const barBefore = await page.getByTestId('time-bar').boundingBox();
  await typeFirstKey(page);
  await expect.poll(() => barShare(page), { timeout: 6_000 }).toBeLessThan(0.8);
  const early = await barShare(page);
  await expect.poll(() => barShare(page), { timeout: 6_000 }).toBeLessThan(early - 0.1);
  const after = await input.boundingBox();
  const barAfter = await page.getByTestId('time-bar').boundingBox();
  expect(after?.y).toBeCloseTo(before?.y ?? -1, 0);
  expect(barAfter?.y).toBeCloseTo(barBefore?.y ?? -1, 0);
});

test('Time: Esc snaps the bar back to full and the result screen has no bar', async ({ page }) => {
  await openHome(page);
  await chooseDuration(page, 15);
  await typeFirstKey(page);
  await expect.poll(() => barShare(page), { timeout: 6_000 }).toBeLessThan(0.9);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('time-readout')).toHaveCount(0);
  // No animation back up: full at once.
  expect(await barShare(page)).toBeCloseTo(1, 2);

  await typeFirstKey(page);
  await expect(page.getByRole('heading', { name: en.results.title })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('time-bar')).toHaveCount(0);
});

test('only Time mode has the bar', async ({ page }) => {
  await openHome(page);
  for (const mode of ['quote', 'count', 'relaxed', 'custom'] as const) {
    await chooseMode(page, mode);
    await expect(page.getByTestId('time-bar')).toHaveCount(0);
  }
  await chooseMode(page, 'time');
  await expect(page.getByTestId('time-bar')).toBeVisible();
});

test('reduced motion: the bar has no transition and steps once per second', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openHome(page);
  await chooseDuration(page, 15);
  await typeFirstKey(page);
  const fill = page.getByTestId('time-bar-fill');
  await expect(fill).toHaveAttribute('data-running', 'true');
  const duration = await fill.evaluate((el) => getComputedStyle(el).transitionDuration);
  // The global reduced-motion rule makes transitions practically instant (1e-5s), never 1s.
  expect(Number.parseFloat(duration)).toBeLessThan(0.01);
  await expect.poll(() => barShare(page), { timeout: 6_000 }).toBeLessThan(0.95);
});

test('the bar fits at 320px without horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await openHome(page);
  await typeFirstKey(page);
  await expect(page.getByTestId('time-bar')).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('every mode shows its own description, and the text changes with the mode', async ({ page }) => {
  await openHome(page);
  const description = page.getByTestId('mode-description');
  for (const mode of ['time', 'quote', 'count', 'relaxed', 'custom'] as const) {
    await chooseMode(page, mode);
    // One line, always there: in the typing box layout, Relaxed and the Own text editor alike.
    await expect(description).toHaveCount(1);
    await expect(description).toHaveText(en.test.modeDescriptions[mode]);
  }
});

test('the description sits under the typing box and above the restart row', async ({ page }) => {
  await openHome(page);
  const box = await page.getByLabel(en.test.inputLabel).boundingBox();
  const description = await page.getByTestId('mode-description').boundingBox();
  const restart = await page.getByTestId('shortcut-hint-restart').evaluate((el) => {
    // The hint is hidden on touch screens; its row (the Restart button) is what we compare with.
    return el.parentElement?.getBoundingClientRect().top ?? 0;
  });
  expect(box).not.toBeNull();
  expect(description).not.toBeNull();
  expect(description!.y).toBeGreaterThanOrEqual(box!.y + box!.height - 1);
  expect(description!.y + description!.height).toBeLessThanOrEqual(restart + 1);
});

test('the description does not move the typing box when the test starts', async ({ page }) => {
  await openHome(page);
  const before = await page.getByTestId('mode-description').boundingBox();
  await typeFirstKey(page);
  await expect(page.getByTestId('time-readout')).toBeVisible();
  const after = await page.getByTestId('mode-description').boundingBox();
  expect(after!.y).toBeCloseTo(before!.y, 0);
});

test('the descriptions fit at 320px without horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await openHome(page);
  for (const mode of ['time', 'quote', 'count', 'relaxed', 'custom'] as const) {
    await chooseMode(page, mode);
    await expect(page.getByTestId('mode-description')).toBeVisible();
    await expectNoHorizontalScroll(page);
  }
});
