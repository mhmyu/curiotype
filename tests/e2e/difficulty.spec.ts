import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { en } from '../../src/i18n/ui/en';
import { classifyDifficulty } from '../../src/lib/difficulty';
import { chooseMode, modeSelect, openFilters } from './helpers';

async function readTarget(page: Page): Promise<string> {
  const input = page.getByLabel(en.test.inputLabel);
  await expect(input).toBeVisible();
  return (await input.locator('xpath=preceding-sibling::div[1]').textContent()) ?? '';
}

async function openSentenceMode(page: Page) {
  await page.goto('/en/');
  await expect(modeSelect(page, en)).toBeVisible();
  await chooseMode(page, 'quote', en);
}

for (const level of ['easy', 'hard'] as const) {
  test(`the "${level}" filter serves sentences that really score ${level}, and the result card labels them`, async ({
    page,
  }) => {
    await openSentenceMode(page);
    const select = (await openFilters(page)).getByLabel(en.test.difficultyLabel);

    if (level === 'easy') {
      // The filter has two levels, no "Medium", and explains the chosen level.
      await expect(select.getByRole('option')).toHaveText([en.test.all, en.difficulties.easy, en.difficulties.hard]);
      await expect(page.getByTestId('difficulty-hint')).toHaveCount(0);
      await select.selectOption('easy');
      await expect(page.getByTestId('difficulty-hint')).toHaveText(en.test.difficultyEasyHint);
      await expect(select).toHaveAttribute('aria-describedby', 'difficulty-hint');
      await select.selectOption('hard');
      await expect(page.getByTestId('difficulty-hint')).toHaveText(en.test.difficultyHardHint);
      await select.selectOption('all');
      await expect(page.getByTestId('difficulty-hint')).toHaveCount(0);
      await expect(select).not.toHaveAttribute('aria-describedby', /.+/);
    }

    await select.selectOption(level);

    // A new test starts after the change; wait until the target is one of the chosen level
    // (the sentence of the first test may still be on screen for a moment).
    await expect
      .poll(async () => classifyDifficulty(await readTarget(page), 'en'))
      .toBe(level);

    const target = await readTarget(page);
    await page.getByLabel(en.test.inputLabel).pressSequentially(target);

    await expect(page.getByRole('heading', { name: en.results.learnedTitle })).toBeVisible();
    const badge = page.getByTestId('difficulty-badge').first();
    await expect(badge).toHaveAttribute('data-difficulty', level);
    await expect(badge).toHaveText(en.difficulties[level]);
  });
}
