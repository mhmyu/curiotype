import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { en } from '../../src/i18n/ui/en';
import { chooseMode } from './helpers';

/**
 * Two tabs of one browser finish a test at the same moment. Each save reads the stored data again
 * inside a lock and adds to it, so neither tab overwrites the other's result.
 */
async function finishSentence(page: Page) {
  await chooseMode(page, 'quote', en);
  const input = page.getByLabel(en.test.inputLabel);
  await expect(input).toBeEnabled();
  const target = await input.evaluate((el) => (el.previousElementSibling as HTMLElement).textContent ?? '');
  await input.pressSequentially(target);
  await expect(page.getByRole('button', { name: en.results.tryAgain })).toBeVisible();
}

test('two tabs finishing a test together keep both results and count both in the streak', async ({
  context,
}) => {
  const first = await context.newPage();
  const second = await context.newPage();
  await Promise.all([first.goto('/en/'), second.goto('/en/')]);

  await Promise.all([finishSentence(first), finishSentence(second)]);

  const read = (key: string) => first.evaluate((k) => localStorage.getItem(k), key);
  // The saves of both tabs finish asynchronously, so poll instead of reading once.
  await expect
    .poll(async () => (JSON.parse((await read('typing:history:v1')) ?? '[]') as unknown[]).length)
    .toBe(2);
  await expect
    .poll(async () => (JSON.parse((await read('typing:streak:v1')) ?? 'null') as { todayCount?: number } | null)?.todayCount)
    .toBe(2);
});
