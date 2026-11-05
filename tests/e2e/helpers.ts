import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { en } from '../../src/i18n/ui/en';
import type { Dictionary } from '../../src/i18n/types';

/** Mode select on the home page (a native `<select>`; the option values are the mode ids). */
export function modeSelect(page: Page, ui: Dictionary = en) {
  return page.getByRole('combobox', { name: ui.test.modeLabel });
}

/**
 * Picks a test mode on the home page. The mode is a native select: one `selectOption` call, for
 * every mode (Time is the default on each page load).
 */
export async function chooseMode(
  page: Page,
  mode: keyof Dictionary['test']['modes'],
  ui: Dictionary = en,
) {
  const select = modeSelect(page, ui);
  // The island renders after the sentences load; selecting before that would find nothing.
  await expect(select).toBeVisible();
  await select.selectOption(mode);
}

/** Duration select (Time mode only); options read `mm:ss`. */
export function durationSelect(page: Page, ui: Dictionary = en) {
  return page.getByRole('combobox', { name: ui.test.durationLabel });
}

/** Sentence-count select (Count mode only). */
export function countSelect(page: Page, ui: Dictionary = en) {
  return page.getByRole('combobox', { name: ui.test.countLabel });
}

/** Picks a duration in Time mode by its seconds (the option values are seconds, the text `mm:ss`). */
export async function chooseDuration(page: Page, seconds: number, ui: Dictionary = en) {
  const select = durationSelect(page, ui);
  await expect(select).toBeVisible();
  await select.selectOption(String(seconds));
}

/** Switches to Count mode and picks the number of sentences. */
export async function chooseCount(page: Page, count: number, ui: Dictionary = en) {
  await chooseMode(page, 'count', ui);
  const select = countSelect(page, ui);
  await expect(select).toBeVisible();
  await select.selectOption(String(count));
}

/** Opens the filter panel (category, difficulty, weak-key practice) if it is closed. */
export async function openFilters(page: Page, ui: Dictionary = en) {
  const toggle = page.getByTestId('filters-toggle');
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await expect(page.locator('#filter-panel')).toBeVisible();
  return page.getByRole('group', { name: ui.test.filters });
}

/** Sentence language select on the home page (and on the other pages that show it). */
export function contentLangSelect(page: Page, ui: Dictionary = en) {
  return page.getByRole('combobox', { name: ui.test.contentLangLabel });
}
