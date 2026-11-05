import { describe, expect, it } from 'vitest';
import type { Sentence } from '@/lib/types';
import {
  MIN_PRACTICE_POOL,
  PRACTICE_POOL_SHARE,
  pickWeakKeySentences,
  scoreSentence,
} from './weak-key-picker';

function sentence(id: string, text: string): Sentence {
  return {
    id,
    lang: 'en',
    category: 'science',
    difficulty: 'easy',
    text,
    explanation: `Explanation of ${id}.`,
    source: { title: 'Publisher: Title', url: 'https://example.org' },
  };
}

/** `count` sentences with ids s01, s02, ...; the first `withKey` contain a "q". */
function corpus(count: number, withKey: number): Sentence[] {
  return Array.from({ length: count }, (_, i) =>
    sentence(`s${String(i + 1).padStart(2, '0')}`, i < withKey ? `Quiet quiz ${i}.` : `Plain text ${i}.`),
  );
}

describe('scoreSentence', () => {
  it('is the share of characters that are weak keys', () => {
    expect(scoreSentence('qqab', new Set(['q']))).toBe(0.5);
    expect(scoreSentence('abcd', new Set(['a', 'b']))).toBe(0.5);
  });

  it('compares case-insensitively, like key-stats', () => {
    expect(scoreSentence('QqQq', new Set(['q']))).toBe(1);
  });

  it('is 0 for an empty sentence, no weak keys or no match', () => {
    expect(scoreSentence('', new Set(['q']))).toBe(0);
    expect(scoreSentence('quick', new Set())).toBe(0);
    expect(scoreSentence('abc', new Set(['z']))).toBe(0);
  });

  it('counts punctuation and spaces when they are weak keys', () => {
    expect(scoreSentence('a.b.', new Set(['.']))).toBe(0.5);
  });
});

describe('pickWeakKeySentences', () => {
  it('returns a copy of the pool when there are no weak keys', () => {
    const pool = corpus(10, 3);
    const picked = pickWeakKeySentences(pool, []);
    expect(picked).toEqual(pool);
    expect(picked).not.toBe(pool);
  });

  it('returns an empty list for an empty pool', () => {
    expect(pickWeakKeySentences([], ['q'])).toEqual([]);
  });

  it('keeps only sentences with a weak key when enough of them exist', () => {
    const pool = corpus(40, 12);
    const picked = pickWeakKeySentences(pool, ['q']);
    expect(picked).toHaveLength(Math.ceil(40 * PRACTICE_POOL_SHARE));
    expect(picked.every((s) => s.text.toLowerCase().includes('q'))).toBe(true);
  });

  it('ranks by share of weak keys, then by id', () => {
    const pool = [
      sentence('b', 'a bq'),
      sentence('a', 'a bq'),
      sentence('c', 'qqqq'),
      sentence('d', 'abcd'),
      sentence('e', 'abcd'),
      sentence('f', 'abcd'),
    ];
    const picked = pickWeakKeySentences(pool, ['q']);
    // 6 sentences: size = max(5, 2) = 5, only 3 contain "q" -> filled up with the best zeros.
    expect(picked.map((s) => s.id)).toEqual(['c', 'a', 'b', 'd', 'e']);
  });

  it('fills the pool up to the minimum when few sentences contain a weak key', () => {
    const pool = corpus(40, 2);
    const picked = pickWeakKeySentences(pool, ['q']);
    expect(picked).toHaveLength(Math.max(MIN_PRACTICE_POOL, Math.ceil(40 * PRACTICE_POOL_SHARE)));
    expect(picked.slice(0, 2).map((s) => s.id)).toEqual(['s01', 's02']);
  });

  it('keeps only the weak-key sentences once there are enough of them', () => {
    const pool = corpus(40, MIN_PRACTICE_POOL);
    const picked = pickWeakKeySentences(pool, ['q']);
    // The top 12 hold exactly 5 sentences with a "q": the 7 without one are dropped.
    expect(picked).toHaveLength(MIN_PRACTICE_POOL);
    expect(picked.every((s) => s.text.toLowerCase().includes('q'))).toBe(true);
  });

  it('never returns more than the pool and never duplicates', () => {
    const pool = corpus(3, 1);
    const picked = pickWeakKeySentences(pool, ['q']);
    expect(picked).toHaveLength(3);
    expect(new Set(picked.map((s) => s.id)).size).toBe(3);
  });

  it('does not modify its input', () => {
    const pool = corpus(10, 4);
    const copy = [...pool];
    pickWeakKeySentences(pool, ['q']);
    expect(pool).toEqual(copy);
  });

  it('accepts weak keys in any case', () => {
    const pool = corpus(40, 12);
    expect(pickWeakKeySentences(pool, ['Q'])).toEqual(pickWeakKeySentences(pool, ['q']));
  });
});
