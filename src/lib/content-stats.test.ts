import { describe, expect, it } from 'vitest';
import {
  TARGET_PER_CATEGORY,
  computeContentStats,
  findWarnings,
  formatScores,
  formatStats,
  percentOf,
  summarizeScores,
} from './content-stats.ts';
import type { StatsFile } from './content-stats.ts';

function file(lang: string, category: string, easy: number, hard: number): StatsFile {
  const items = [
    ...Array(easy).fill({ difficulty: 'easy' }),
    ...Array(hard).fill({ difficulty: 'hard' }),
  ];
  return { lang, category, items };
}

/** One-word sentence of `length` characters (score = length + 5 once it has 10 or more). */
function textOfLength(length: number): string {
  return 'a'.repeat(length - 1) + '.';
}

describe('computeContentStats', () => {
  it('counts per language, category, and difficulty', () => {
    const [en] = computeContentStats([file('en', 'science', 1, 3), file('en', 'history', 0, 1)]);
    expect(en.lang).toBe('en');
    expect(en.total).toBe(5);
    expect(en.byDifficulty).toEqual({ easy: 1, hard: 4 });
    expect(en.categories.find((c) => c.category === 'science')?.byDifficulty).toEqual({ easy: 1, hard: 3 });
  });

  it('lists every known category, with zero for a missing file', () => {
    const [en] = computeContentStats([file('en', 'science', 1, 0)]);
    expect(en.categories.map((c) => c.category)).toEqual(['science', 'history', 'technology', 'health']);
    expect(en.categories.find((c) => c.category === 'health')?.total).toBe(0);
  });

  it('lists unknown categories after the known ones and sorts languages', () => {
    const stats = computeContentStats([file('id', 'cooking', 1, 0), file('en', 'science', 1, 0)]);
    expect(stats.map((s) => s.lang)).toEqual(['en', 'id']);
    expect(stats[1].categories.at(-1)?.category).toBe('cooking');
  });

  it('counts an unknown difficulty separately', () => {
    const [en] = computeContentStats([{ lang: 'en', category: 'science', items: [{ difficulty: 'extreme' }] }]);
    const science = en.categories[0];
    expect(science.total).toBe(1);
    expect(science.unknownDifficulty).toBe(1);
    expect(science.byDifficulty).toEqual({ easy: 0, hard: 0 });
  });
});

describe('percentOf', () => {
  it('rounds and handles zero', () => {
    expect(percentOf(1, 3)).toBe(33);
    expect(percentOf(0, 0)).toBe(0);
  });
});

describe('findWarnings', () => {
  const full = (lang: string) =>
    ['science', 'history', 'technology', 'health'].map((c) => file(lang, c, 50, 50));

  it('has no warnings when targets are met', () => {
    expect(findWarnings(computeContentStats(full('en')))).toEqual([]);
  });

  it('warns about a category below the target and names it', () => {
    const files = [...full('en').slice(1), file('en', 'science', 5, 5)];
    const warnings = findWarnings(computeContentStats(files));
    expect(warnings).toEqual([`en/science: 10 sentences, target is ${TARGET_PER_CATEGORY}.`]);
  });

  it('warns when the difficulty mix drifts more than the tolerance', () => {
    const files = [...full('id').slice(1), file('id', 'science', 70, 30)];
    const warnings = findWarnings(computeContentStats(files));
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain('id/science: easy is 70%');
    expect(warnings[1]).toContain('hard is 30%');
  });

  it('allows a drift of exactly the tolerance', () => {
    const files = [...full('en').slice(1), file('en', 'science', 60, 40)];
    expect(findWarnings(computeContentStats(files))).toEqual([]);
  });

  it('skips the share check for very small categories', () => {
    const warnings = findWarnings(computeContentStats([file('en', 'science', 5, 0)]));
    expect(warnings.some((w) => w.includes('% of the sentences'))).toBe(false);
  });

  it('warns about an unknown difficulty and about an empty corpus', () => {
    const stats = computeContentStats([{ lang: 'en', category: 'science', items: [{ difficulty: 'x' }] }]);
    expect(findWarnings(stats).some((w) => w.includes('unknown difficulty'))).toBe(true);
    expect(findWarnings([])).toEqual(['No sentence files found.']);
  });
});

describe('formatStats', () => {
  it('prints a table per language and the warnings', () => {
    const stats = computeContentStats([file('en', 'science', 3, 2)]);
    const text = formatStats(stats, findWarnings(stats));
    expect(text).toContain('en: 5 sentences');
    expect(text).toContain('50/50');
    expect(text).not.toContain('medium');
    expect(text).toContain('science');
    expect(text).toContain('ALL');
    expect(text).toContain('warning(s):');
  });

  it('says so when there are no warnings', () => {
    expect(formatStats([], [])).toContain('No warnings.');
  });

  it('marks a draft language and lists the drafts once', () => {
    const stats = computeContentStats([file('es', 'science', 3, 2), file('en', 'science', 3, 2)]);
    expect(stats.map((s) => [s.lang, s.draft])).toEqual([
      ['en', false],
      ['es', true],
    ]);
    const text = formatStats(stats, []);
    expect(text).toContain('es: 5 sentences (draft: not offered in the production language select)');
    expect(text).toContain('en: 5 sentences\n');
    expect(text).toContain('Draft languages: es.');
  });

  it('prints no draft line when no language is a draft', () => {
    const text = formatStats(computeContentStats([file('en', 'science', 3, 2)]), []);
    expect(text).not.toContain('draft');
  });
});

describe('scores', () => {
  // Scores en: 55 (easy), 99 (easy), 100 (hard), 130 (hard); the en threshold is 100.
  const texts = [textOfLength(50), textOfLength(94), textOfLength(95), textOfLength(125)];
  const labels = ['easy', 'easy', 'hard', 'hard'];
  const withText: StatsFile = {
    lang: 'en',
    category: 'science',
    items: texts.map((text, i) => ({ difficulty: labels[i], text })),
  };

  it('summarizeScores gives min, median, max and the threshold; null when empty', () => {
    expect(summarizeScores([], 100)).toBeNull();
    expect(summarizeScores([130, 55, 99, 100], 100)).toEqual({
      count: 4,
      min: 55,
      median: 99.5,
      max: 130,
      threshold: 100,
    });
    expect(summarizeScores([7, 3, 5], 4)?.median).toBe(5);
  });

  it('computeContentStats adds the summary when the sentences carry their text', () => {
    const [en] = computeContentStats([withText]);
    expect(en.scores).toMatchObject({ count: 4, min: 55, max: 130, threshold: 100 });
    expect(en.categories[0].mislabeled).toBe(0);
    expect(computeContentStats([file('en', 'science', 1, 1)])[0].scores).toBeNull();
  });

  it('counts a label that differs from its score and warns about it', () => {
    const wrong: StatsFile = { ...withText, items: withText.items.map((item) => ({ ...item, difficulty: 'hard' })) };
    const stats = computeContentStats([wrong]);
    expect(stats[0].categories[0].mislabeled).toBe(2);
    expect(findWarnings(stats).some((w) => w.includes('en/science: 2 sentence(s) labelled differently'))).toBe(true);
  });

  it('formatStats prints the score line', () => {
    const stats = computeContentStats([withText]);
    expect(formatStats(stats, [])).toContain('scores: min 55, median 99.5, max 130; threshold 100');
  });

  it('formatScores lists every sentence lowest score first and marks a wrong label', () => {
    const files = [
      {
        lang: 'en',
        category: 'science',
        items: [
          { id: 'en-science-002', difficulty: 'hard', text: textOfLength(50) },
          { id: 'en-science-001', difficulty: 'hard', text: textOfLength(125) },
        ],
      },
    ];
    const lines = formatScores(files).split('\n');
    expect(lines[0]).toContain('en: threshold 100');
    expect(lines[1]).toMatch(/en-science-002\s+55\s+easy\s+<- labelled "hard", must be "easy"/);
    expect(lines[2]).toMatch(/en-science-001\s+130\s+hard$/);
  });
});
