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

test('the mode is one select with every mode, starting on Time, keeping focus and not remembered', { tag: '@smoke' }, async ({
  page,
}) => {
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

  // The focus stays on the select after a change, and a reload starts on Time again.
  await select.focus();
  await select.selectOption('count');
  await expect(select).toBeFocused();
  await page.reload();
  await expect(modeSelect(page)).toHaveValue('time');

  // Esc on the mode select does not restart the test.
  const input = page.getByLabel(en.test.inputLabel);
  const target = (await input.locator('xpath=preceding-sibling::div[1]').textContent()) ?? '';
  await input.pressSequentially(target.slice(0, 5));
  await expect(input).toHaveValue(target.slice(0, 5));
  await modeSelect(page).focus();
  await page.keyboard.press('Escape');
  await expect(input).toHaveValue(target.slice(0, 5));
});

test('duration and count are selects: mm:ss for Time, numbers for Count; only these two modes have one', { tag: '@smoke' }, async ({
  page,
}) => {
  await openHome(page);
  const durations = durationSelect(page);
  await expect(durations).toHaveValue('60');
  await expect(durations.getByRole('option')).toHaveText(['00:15', '00:30', '01:00', '02:00']);
  await expect(countSelect(page)).toHaveCount(0);

  // Changing the duration restarts the test and keeps the focus on the select.
  const input = page.getByLabel(en.test.inputLabel);
  await durations.focus();
  await chooseDuration(page, 15);
  await expect(durations).toHaveValue('15');
  await expect(durations).toBeFocused();
  await expect(input).toHaveValue('');

  // In Count mode the duration select is replaced by the sentence-count select.
  await chooseMode(page, 'count');
  const counts = countSelect(page);
  await expect(durationSelect(page)).toHaveCount(0);
  await expect(counts.getByRole('option')).toHaveText(['1', '3', '5', '10']);
  await expect(counts).toHaveValue('3');

  // The count select stays while the test runs: changing it starts a new test, focus stays.
  await input.pressSequentially('a');
  await expect(input).toHaveValue('a');
  await counts.focus();
  await counts.selectOption('5');
  await expect(input).toHaveValue('');
  await expect(counts).toBeFocused();

  // The other modes have no second select.
  for (const mode of ['quote', 'relaxed', 'custom'] as const) {
    await chooseMode(page, mode);
    await expect(durationSelect(page), `duration in ${mode}`).toHaveCount(0);
    await expect(countSelect(page), `count in ${mode}`).toHaveCount(0);
  }
});

test('the controls are in the order language, mode, duration, Filter, above the typing box, and Tab follows it', async ({
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

  // The language select is as wide as its content and sits above the typing box, left of Filter.
  const [s, f, i] = await Promise.all([
    contentLangSelect(page).boundingBox(),
    page.getByTestId('filters-toggle').boundingBox(),
    page.getByLabel(en.test.inputLabel).boundingBox(),
  ]);
  if (!s || !f || !i) throw new Error('controls are not laid out');
  expect(s.y + s.height).toBeLessThanOrEqual(i.y);
  expect(f.y + f.height).toBeLessThanOrEqual(i.y);
  expect(s.x).toBeLessThan(f.x);
  expect(s.width).toBeLessThan(300);

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

test('the Filter panel starts closed, counts active filters, Esc closes only the panel, and some modes hide parts of it', async ({
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

  // Own text has no Filter button; Relaxed has it without weak-key practice.
  await chooseMode(page, 'custom');
  await expect(toggle).toHaveCount(0);
  await chooseMode(page, 'relaxed');
  const relaxedPanel = await openFilters(page);
  await expect(relaxedPanel.getByLabel(en.test.difficultyLabel)).toBeVisible();
  await expect(relaxedPanel.getByRole('button', { name: en.test.focusWeakKeys })).toHaveCount(0);
});

// The narrowest width covers "no horizontal page scroll" for the wider ones; every mode, its
// description, the progress bar and the open Filter panel are checked here.
test('nothing makes the page scroll sideways at 320px: every mode, the bar, the descriptions, the Filter panel', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await openHome(page);
  await expectNoHorizontalScroll(page);

  await typeFirstKey(page);
  await expect(page.getByTestId('time-bar')).toBeVisible();
  await expectNoHorizontalScroll(page);

  for (const mode of ['time', 'quote', 'count', 'relaxed', 'custom'] as const) {
    await chooseMode(page, mode);
    await expect(page.getByTestId('mode-description'), `description in ${mode}`).toBeVisible();
    await expectNoHorizontalScroll(page);
  }

  await chooseMode(page, 'relaxed');
  await openFilters(page);
  await expectNoHorizontalScroll(page);
});

// T38a3: language, mode, duration (or count) and Filter share one row at 390 and 360px, in every mode.
// Below 360px the row may wrap as a last resort (never a horizontal page scroll; see the 320px test).
test('the controls fit one row at 390px and 360px in every mode', async ({ page }) => {
  await openHome(page);
  const row = page.getByTestId('controls-row');
  for (const width of [390, 360]) {
    await page.setViewportSize({ width, height: 844 });
    for (const mode of ['time', 'quote', 'count', 'relaxed', 'custom'] as const) {
      await chooseMode(page, mode);
      if (mode === 'count') await countSelect(page).selectOption('10');
      const tops = await row
        .locator('> *')
        .evaluateAll((items) => [...new Set(items.map((i) => Math.round(i.getBoundingClientRect().top)))]);
      expect(tops, `mode ${mode} at ${width}px`).toHaveLength(1);
    }
  }
});

// T38b: the time readout (spec 22.4).
async function typeFirstKey(page: Page) {
  await page.getByLabel(en.test.inputLabel).pressSequentially('a');
}

test('Time: the countdown replaces the duration select in place, with the same box', { tag: '@smoke' }, async ({
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

test('Time: the bar sits right above the typing box, is decorative, full before the start, and only Time mode has it', async ({
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

  // The other modes have no bar; Relaxed and the Own text editor have no readout either.
  for (const mode of ['quote', 'count', 'relaxed', 'custom'] as const) {
    await chooseMode(page, mode);
    await expect(page.getByTestId('time-bar'), `bar in ${mode}`).toHaveCount(0);
  }
  await expect(page.getByTestId('time-readout')).toHaveCount(0);
  await chooseMode(page, 'time');
  await expect(page.getByTestId('time-bar')).toBeVisible();
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

test('Time: Esc snaps the bar back to full; when the countdown ends the result has no bar and the select returns', async ({
  page,
}) => {
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
  await expect(page.getByTestId('time-readout')).toHaveCount(0);
  await expect(durationSelect(page)).toHaveValue('15');
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

test('every mode shows its own description under the typing box, and it does not move when the test starts', async ({
  page,
}) => {
  await openHome(page);
  const description = page.getByTestId('mode-description');

  // It sits under the typing box and above the restart row.
  const box = await page.getByLabel(en.test.inputLabel).boundingBox();
  const placed = await description.boundingBox();
  const restart = await page.getByTestId('shortcut-hint-restart').evaluate((el) => {
    // The hint is hidden on touch screens; its row (the Restart button) is what we compare with.
    return el.parentElement?.getBoundingClientRect().top ?? 0;
  });
  if (!box || !placed) throw new Error('not laid out');
  expect(placed.y).toBeGreaterThanOrEqual(box.y + box.height - 1);
  expect(placed.y + placed.height).toBeLessThanOrEqual(restart + 1);

  await typeFirstKey(page);
  await expect(page.getByTestId('time-readout')).toBeVisible();
  const after = await description.boundingBox();
  expect(after!.y).toBeCloseTo(placed.y, 0);

  // One line, always there, in every mode: the typing box layout, Relaxed and the editor alike.
  for (const mode of ['time', 'quote', 'count', 'relaxed', 'custom'] as const) {
    await chooseMode(page, mode);
    await expect(description).toHaveCount(1);
    await expect(description).toHaveText(en.test.modeDescriptions[mode]);
  }
});
