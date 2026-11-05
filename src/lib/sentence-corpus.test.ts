import { describe, expect, it } from 'vitest';
import { buildSentences } from './sentence-corpus';
import type { SentenceFile } from './sentence-corpus';

function item(id: string, text: string) {
  return {
    id,
    difficulty: 'easy' as const,
    text,
    explanation: 'x'.repeat(60),
    source: { title: 'Publisher: Page', url: 'https://example.org/page' },
  };
}

function file(lang: string, category: SentenceFile['data']['category'], items: ReturnType<typeof item>[]): SentenceFile {
  return { id: `${lang}/${category}`, data: { lang, category, items } };
}

describe('buildSentences', () => {
  it('adds lang and category to each item and sorts by id', () => {
    const result = buildSentences([
      file('fr', 'science', [item('fr-science-002', 'Deux.'), item('fr-science-001', 'Un.')]),
      file('fr', 'health', [item('fr-health-001', 'Trois.')]),
    ]);
    expect(result.map((s) => s.id)).toEqual(['fr-health-001', 'fr-science-001', 'fr-science-002']);
    expect(result[0]).toMatchObject({ lang: 'fr', category: 'health', text: 'Trois.' });
  });

  it('returns an empty list for no files', () => {
    expect(buildSentences([])).toEqual([]);
  });

  it('throws when lang or category does not match the file path', () => {
    const wrongFolder: SentenceFile = { id: 'en/science', data: file('id', 'science', [item('id-science-001', 'A.')]).data };
    expect(() => buildSentences([wrongFolder])).toThrow(/src\/content\/sentences\/id\/science\.json/);

    const wrongName: SentenceFile = { id: 'id/health', data: file('id', 'science', [item('id-science-001', 'A.')]).data };
    expect(() => buildSentences([wrongName])).toThrow(/must live at/);
  });

  it('throws on a duplicate id', () => {
    expect(() =>
      buildSentences([
        file('en', 'science', [item('en-science-001', 'One.'), item('en-science-001', 'Two.')]),
      ]),
    ).toThrow(/Duplicate sentence id: en-science-001/);
  });

  it('throws on a duplicate text, ignoring case, also across files', () => {
    expect(() =>
      buildSentences([
        file('en', 'science', [item('en-science-001', 'Same text.')]),
        file('en', 'health', [item('en-health-001', 'SAME TEXT.')]),
      ]),
    ).toThrow(/Duplicate sentence text \(en-health-001\)/);
  });
});
