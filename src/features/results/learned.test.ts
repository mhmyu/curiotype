import { describe, expect, it } from 'vitest';
import type { Category } from '@/lib/taxonomy';
import type { Sentence } from '@/lib/types';
import { getCategoryChars, getCompletedSentences, getTypedSentences } from './learned';

function sentence(id: string, text: string, category: Category = 'science'): Sentence {
  return {
    id,
    lang: 'en',
    category,
    difficulty: 'easy',
    text,
    explanation: 'Explanation.',
    source: { title: 'Publisher: Page', url: 'https://example.org/page' },
  };
}

// Target text: "aaaa bbb cc" (offsets 0-3, 5-7, 9-10)
const sentences = [
  sentence('s1', 'aaaa', 'science'),
  sentence('s2', 'bbb', 'history'),
  sentence('s3', 'cc', 'science'),
];

describe('getTypedSentences', () => {
  it('returns nothing before the first character is typed', () => {
    expect(getTypedSentences(sentences, 0)).toEqual([]);
  });

  it('includes a sentence as soon as its first character is typed', () => {
    expect(getTypedSentences(sentences, 1).map((s) => s.id)).toEqual(['s1']);
    // Typed length 5 = "aaaa" + the separating space; s2 is not started yet.
    expect(getTypedSentences(sentences, 5).map((s) => s.id)).toEqual(['s1']);
    expect(getTypedSentences(sentences, 6).map((s) => s.id)).toEqual(['s1', 's2']);
  });

  it('returns every sentence when the whole target is typed', () => {
    expect(getTypedSentences(sentences, 11).map((s) => s.id)).toEqual(['s1', 's2', 's3']);
  });
});

describe('getCompletedSentences', () => {
  it('returns nothing while the first sentence is unfinished', () => {
    expect(getCompletedSentences(sentences, 0)).toEqual([]);
    expect(getCompletedSentences(sentences, 3)).toEqual([]);
  });

  it('counts a sentence once its last character is typed, without the separator', () => {
    expect(getCompletedSentences(sentences, 4).map((s) => s.id)).toEqual(['s1']);
    expect(getCompletedSentences(sentences, 5).map((s) => s.id)).toEqual(['s1']);
  });

  it('leaves out the sentence that is only partly typed', () => {
    expect(getCompletedSentences(sentences, 7).map((s) => s.id)).toEqual(['s1']);
    expect(getCompletedSentences(sentences, 8).map((s) => s.id)).toEqual(['s1', 's2']);
  });

  it('returns every sentence when the whole target is typed', () => {
    expect(getCompletedSentences(sentences, 11).map((s) => s.id)).toEqual(['s1', 's2', 's3']);
  });
});

describe('getCategoryChars', () => {
  it('is empty before anything is typed', () => {
    expect(getCategoryChars(sentences, 0)).toEqual({});
  });

  it('counts only typed characters of a partly typed sentence', () => {
    expect(getCategoryChars(sentences, 2)).toEqual({ science: 2 });
  });

  it('does not count the separating spaces', () => {
    expect(getCategoryChars(sentences, 5)).toEqual({ science: 4 });
    expect(getCategoryChars(sentences, 6)).toEqual({ science: 4, history: 1 });
    expect(getCategoryChars(sentences, 7)).toEqual({ science: 4, history: 2 });
  });

  it('adds up sentences of the same category', () => {
    expect(getCategoryChars(sentences, 11)).toEqual({ science: 6, history: 3 });
  });

  it('adds up to the typed length minus the separators', () => {
    const total = Object.values(getCategoryChars(sentences, 11)).reduce((a, b) => (a ?? 0) + (b ?? 0), 0);
    expect(total).toBe(11 - 2);
  });
});
