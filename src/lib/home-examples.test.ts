import { describe, expect, it } from 'vitest';
import { pickHomeExamples } from './home-examples';
import type { Sentence } from './types';

function sentence(id: string, category: string): Sentence {
  return {
    id,
    lang: 'en',
    category,
    difficulty: 'easy',
    text: `Text ${id}.`,
    explanation: `Explanation ${id}.`,
    source: { title: 'Publisher: Page', url: 'https://example.org/page' },
  };
}

const CORPUS = [
  sentence('en-health-002', 'health'),
  sentence('en-science-002', 'science'),
  sentence('en-science-001', 'science'),
  sentence('en-history-001', 'history'),
  sentence('en-health-001', 'health'),
  sentence('en-technology-001', 'technology'),
];
const ORDER = ['science', 'history', 'technology', 'health'];

describe('pickHomeExamples', () => {
  it('takes the lowest id of each category, in category order', () => {
    expect(pickHomeExamples(CORPUS, ORDER).map((s) => s.id)).toEqual([
      'en-science-001',
      'en-history-001',
      'en-technology-001',
    ]);
  });

  it('does not depend on the order of the input', () => {
    const reversed = [...CORPUS].reverse();
    expect(pickHomeExamples(reversed, ORDER)).toEqual(pickHomeExamples(CORPUS, ORDER));
  });

  it('does not change the input array', () => {
    const copy = [...CORPUS];
    pickHomeExamples(CORPUS, ORDER);
    expect(CORPUS).toEqual(copy);
  });

  it('skips categories without sentences', () => {
    expect(pickHomeExamples(CORPUS, ['sports', 'health', 'history']).map((s) => s.id)).toEqual([
      'en-health-001',
      'en-history-001',
      'en-health-002',
    ]);
  });

  it('goes round again when there are fewer categories than examples', () => {
    expect(pickHomeExamples(CORPUS, ['science'], 3).map((s) => s.id)).toEqual(['en-science-001', 'en-science-002']);
  });

  it('returns what exists when the corpus is small or empty', () => {
    expect(pickHomeExamples([], ORDER)).toEqual([]);
    expect(pickHomeExamples(CORPUS, [])).toEqual([]);
    expect(pickHomeExamples(CORPUS, ORDER, 0)).toEqual([]);
  });
});
