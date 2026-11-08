import { describe, expect, it } from 'vitest';
import {
  TARGET_PER_CATEGORY,
  computeContentDetails,
  computeContentStats,
  describeSourceUrl,
  findSourceWarnings,
  findCategoryNotes,
  findWarnings,
  formatScores,
  formatStats,
  percentOf,
  summarizeScores,
} from './content-stats.ts';
import type { DetailFile, StatsFile } from './content-stats.ts';

/** The categories listed in `categories.json` for most tests (the same four the site ships with). */
const FOUR = ['science', 'history', 'technology', 'health'];
const compute = (files: readonly StatsFile[], registered: readonly string[] = FOUR) =>
  computeContentStats(files, registered);
const warn = (stats: ReturnType<typeof compute>, registered: readonly string[] = FOUR) =>
  findWarnings(stats, registered);

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
    const [en] = compute([file('en', 'science', 1, 3), file('en', 'history', 0, 1)]);
    expect(en.lang).toBe('en');
    expect(en.total).toBe(5);
    expect(en.byDifficulty).toEqual({ easy: 1, hard: 4 });
    expect(en.categories.find((c) => c.category === 'science')?.byDifficulty).toEqual({ easy: 1, hard: 3 });
  });

  it('lists only the categories a language has a file for, in the order of the registry', () => {
    const [en] = compute([file('en', 'health', 1, 0), file('en', 'science', 1, 0)]);
    expect(en.categories.map((c) => c.category)).toEqual(['science', 'health']);
    expect(en.categories.every((c) => c.registered)).toBe(true);
  });

  it('follows the order of the given registry, also for a new category', () => {
    const registry = ['geography', 'science'];
    const [id] = compute([file('id', 'science', 1, 0), file('id', 'geography', 1, 0)], registry);
    expect(id.categories.map((c) => c.category)).toEqual(['geography', 'science']);
  });

  it('lists unregistered categories after the registered ones, by name, and sorts languages', () => {
    const stats = compute([
      file('id', 'zebra', 1, 0),
      file('id', 'cooking', 1, 0),
      file('id', 'science', 1, 0),
      file('en', 'science', 1, 0),
    ]);
    expect(stats.map((s) => s.lang)).toEqual(['en', 'id']);
    expect(stats[1].categories.map((c) => [c.category, c.registered])).toEqual([
      ['science', true],
      ['cooking', false],
      ['zebra', false],
    ]);
  });

  it('counts an unknown difficulty separately', () => {
    const [en] = compute([{ lang: 'en', category: 'science', items: [{ difficulty: 'extreme' }] }]);
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
    expect(warn(compute(full('en')))).toEqual([]);
  });

  it('warns about a category below the target and names it', () => {
    const files = [...full('en').slice(1), file('en', 'science', 5, 5)];
    const warnings = warn(compute(files));
    expect(warnings).toEqual([`en/science: 10 sentences, target is ${TARGET_PER_CATEGORY}.`]);
  });

  it('warns when the difficulty mix drifts more than the tolerance', () => {
    const files = [...full('id').slice(1), file('id', 'science', 70, 30)];
    const warnings = warn(compute(files));
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain('id/science: easy is 70%');
    expect(warnings[1]).toContain('hard is 30%');
  });

  it('allows a drift of exactly the tolerance', () => {
    const files = [...full('en').slice(1), file('en', 'science', 60, 40)];
    expect(warn(compute(files))).toEqual([]);
  });

  it('skips the share check for very small categories', () => {
    const warnings = warn(compute([file('en', 'science', 5, 0)]));
    expect(warnings.some((w) => w.includes('% of the sentences'))).toBe(false);
  });

  it('warns about an unknown difficulty and about an empty corpus', () => {
    const stats = compute([{ lang: 'en', category: 'science', items: [{ difficulty: 'x' }] }]);
    expect(warn(stats).some((w) => w.includes('unknown difficulty'))).toBe(true);
    expect(warn([], [])).toEqual(['No sentence files found.']);
  });
});

describe('category warnings and notes', () => {
  it('warns about a file whose category is not registered, naming the file', () => {
    const registry = ['science'];
    const stats = compute([file('id', 'science', 1, 0), file('id', 'geograpy', 1, 0)], registry);
    const warnings = warn(stats, registry).filter((w) => w.includes('has no entry'));
    expect(warnings).toEqual([
      'Category "geograpy" (id/geograpy.json) has no entry in src/content/categories.json (the build rejects this). Add one, or fix the file name if it is a typo.',
    ]);
  });

  it('warns about a registered category that has no sentence file in any language', () => {
    const registry = ['science', 'geography'];
    const stats = compute([file('id', 'science', 1, 0), file('en', 'science', 1, 0)], registry);
    const warnings = warn(stats, registry).filter((w) => w.includes('geography'));
    expect(warnings).toEqual([
      'Category "geography" is listed in src/content/categories.json but has no sentence file, so the site does not show it.',
    ]);
  });

  it('does not warn about a registered category when one language has its file', () => {
    const registry = ['science', 'geography'];
    const stats = compute([file('id', 'geography', 1, 0), file('id', 'science', 1, 0), file('en', 'science', 1, 0)], registry);
    expect(warn(stats, registry).some((w) => w.includes('has no sentence file'))).toBe(false);
  });

  it('notes a category that exists in only some languages, and is not a warning', () => {
    const registry = ['science', 'geography'];
    const files = [
      file('id', 'geography', 1, 0),
      file('id', 'science', 1, 0),
      file('en', 'science', 1, 0),
      file('es', 'science', 1, 0),
    ];
    const stats = compute(files, registry);
    expect(findCategoryNotes(stats)).toEqual(['Category geography: only in id (missing in en, es)']);
    expect(warn(stats, registry).some((w) => w.includes('geography') && w.includes('only in'))).toBe(false);
  });

  it('lists every language that has the category when it is in two of three', () => {
    const stats = compute(
      [file('en', 'geography', 1, 0), file('id', 'geography', 1, 0), file('es', 'science', 1, 0)],
      ['science', 'geography'],
    );
    expect(findCategoryNotes(stats)).toContain('Category geography: only in en, id (missing in es)');
  });

  it('has no notes when every language has every category, or when there is one language', () => {
    const both = compute([file('en', 'science', 1, 0), file('id', 'science', 1, 0)]);
    expect(findCategoryNotes(both)).toEqual([]);
    expect(findCategoryNotes(compute([file('en', 'science', 1, 0)]))).toEqual([]);
  });

  it('prints the notes in the report without counting them as warnings', () => {
    const stats = compute(
      [file('id', 'geography', 1, 0), file('id', 'science', 1, 0), file('en', 'science', 1, 0)],
      ['science', 'geography'],
    );
    const text = formatStats(stats, [], findCategoryNotes(stats));
    expect(text).toContain('Notes:\n  - Category geography: only in id (missing in en)');
    expect(text).toContain('No warnings.');
  });
});

describe('formatStats', () => {
  it('prints a table per language and the warnings', () => {
    const stats = compute([file('en', 'science', 3, 2)]);
    const text = formatStats(stats, warn(stats));
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
    const stats = compute([file('es', 'science', 3, 2), file('en', 'science', 3, 2)]);
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
    const text = formatStats(compute([file('en', 'science', 3, 2)]), []);
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
    const [en] = compute([withText]);
    expect(en.scores).toMatchObject({ count: 4, min: 55, max: 130, threshold: 100 });
    expect(en.categories[0].mislabeled).toBe(0);
    expect(compute([file('en', 'science', 1, 1)])[0].scores).toBeNull();
  });

  it('counts a label that differs from its score and warns about it', () => {
    const wrong: StatsFile = { ...withText, items: withText.items.map((item) => ({ ...item, difficulty: 'hard' })) };
    const stats = compute([wrong]);
    expect(stats[0].categories[0].mislabeled).toBe(2);
    expect(warn(stats).some((w) => w.includes('en/science: 2 sentence(s) labelled differently'))).toBe(true);
  });

  it('formatStats prints the score line', () => {
    const stats = compute([withText]);
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


describe('describeSourceUrl', () => {
  it('drops the fragment and a leading www, keeps path and query', () => {
    expect(describeSourceUrl('https://www.nasa.gov/venus?x=1#facts')).toEqual({
      page: 'https://www.nasa.gov/venus?x=1',
      domain: 'nasa.gov',
    });
  });

  it('keeps an unparsable value as it is', () => {
    expect(describeSourceUrl('not a url')).toEqual({ page: 'not a url', domain: 'not a url' });
  });
});

function detailFile(lang: string, category: string, items: DetailFile['items']): DetailFile {
  return { lang, category, items };
}

describe('computeContentDetails', () => {
  it('summarizes text and explanation length against their allowed range', () => {
    const long = 'x'.repeat(200);
    const [en] = computeContentDetails([
      detailFile('en', 'science', [
        { text: textOfLength(60), explanation: 'e'.repeat(50) },
        { text: textOfLength(160), explanation: long },
      ]),
    ]);
    expect(en.text).toEqual({ count: 2, min: 60, median: 110, max: 160, allowedMin: 50, allowedMax: 170, nearLimit: 1 });
    expect(en.explanation).toMatchObject({ min: 50, max: 200, allowedMin: 40, allowedMax: 220, nearLimit: 1 });
  });

  it('has no length summary without text or explanation', () => {
    const [en] = computeContentDetails([detailFile('en', 'science', [{ source: { url: 'https://a.org/x' } }])]);
    expect(en.text).toBeNull();
    expect(en.explanation).toBeNull();
  });

  it('counts pages without the fragment, domains, and the most used page', () => {
    const [en] = computeContentDetails([
      detailFile('en', 'science', [
        { source: { url: 'https://en.wikipedia.org/wiki/Bone#Structure' } },
        { source: { url: 'https://en.wikipedia.org/wiki/Bone#Function' } },
        { source: { url: 'https://www.who.int/news' } },
      ]),
    ]);
    expect(en.sources.pages).toBe(2);
    expect(en.sources.domains).toBe(2);
    expect(en.sources.topDomains[0]).toEqual({ domain: 'en.wikipedia.org', count: 2 });
    expect(en.sources.topPage).toEqual({ url: 'https://en.wikipedia.org/wiki/Bone', count: 2 });
  });

  it('counts digits per digit and the sentences that have one', () => {
    const [en] = computeContentDetails([
      detailFile('en', 'science', [{ text: 'In 1969 and 2 more.' }, { text: 'No numbers here.' }]),
    ]);
    expect(en.digits.sentences).toBe(2);
    expect(en.digits.withDigit).toBe(1);
    expect(en.digits.counts).toEqual([0, 1, 1, 0, 0, 0, 1, 0, 0, 2]);
  });

  it('lists rare letters from a to z (rarest first) and the letters outside it', () => {
    const [es] = computeContentDetails([detailFile('es', 'science', [{ text: 'Camión, mañana.' }])]);
    expect(es.letters.rare[0]).toEqual({ letter: 'b', count: 0 });
    expect(es.letters.rare.find((row) => row.letter === 'a')?.count).toBe(4);
    expect(es.letters.other).toEqual([
      { letter: 'ñ', count: 1 },
      { letter: 'ó', count: 1 },
    ]);
  });

  it('uses the length range of the language', () => {
    const [id] = computeContentDetails([detailFile('id', 'science', [{ text: textOfLength(60) }])]);
    expect(id.text).toMatchObject({ allowedMin: 55, allowedMax: 190 });
  });
});

describe('findSourceWarnings', () => {
  const items = (urls: string[]) => urls.map((url) => ({ source: { url } }));

  it('warns when one page serves more than 10% of a category of at least 20', () => {
    const urls = [...Array(3).fill('https://a.org/p#x'), ...Array.from({ length: 17 }, (_, i) => `https://b.org/${i}`)];
    const warnings = findSourceWarnings([detailFile('en', 'science', items(urls))]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('en/science: https://a.org/p is the source of 3 of 20 sentences (15%)');
  });

  it('accepts exactly 10% and ignores small categories', () => {
    const ok = [...Array(2).fill('https://a.org/p'), ...Array.from({ length: 18 }, (_, i) => `https://b.org/${i}`)];
    expect(findSourceWarnings([detailFile('en', 'science', items(ok))])).toEqual([]);
    expect(findSourceWarnings([detailFile('en', 'science', items(Array(19).fill('https://a.org/p')))])).toEqual([]);
  });

  it('does not warn about a domain that serves many different pages', () => {
    const urls = Array.from({ length: 30 }, (_, i) => `https://en.wikipedia.org/wiki/Page_${i}`);
    expect(findSourceWarnings([detailFile('en', 'science', items(urls))])).toEqual([]);
  });
});

describe('formatStats with details', () => {
  it('prints the detail lines under the scores of the language', () => {
    const files: DetailFile[] = [
      detailFile('en', 'science', [
        { text: textOfLength(60), explanation: 'e'.repeat(50), source: { url: 'https://a.org/p' } },
      ]),
    ];
    const text = formatStats(compute([file('en', 'science', 1, 0)]), [], [], computeContentDetails(files));
    expect(text).toContain('text length: min 60, median 60, max 60 (allowed 50-170 characters)');
    expect(text).toContain('explanation length: min 50');
    expect(text).toContain('sources: 1 page(s) on 1 domain(s); most used: a.org 1');
    expect(text).toContain('digits: in 0 of 1 sentences (0%)');
    expect(text).toContain('letters under 30 occurrences:');
  });

  it('prints nothing extra when no details are given', () => {
    expect(formatStats(compute([file('en', 'science', 1, 0)]), [])).not.toContain('text length');
  });
});
