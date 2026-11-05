import { describe, expect, it } from 'vitest';
import type { Sentence } from '@/lib/types';
import { createSentenceQueue, filterSentences } from './picker';

function sentence(id: string, category: Sentence['category'], difficulty: Sentence['difficulty']): Sentence {
  return {
    id,
    lang: 'en',
    category,
    difficulty,
    text: `Text of ${id}.`,
    explanation: `Explanation of ${id}.`,
    source: { title: 'Publisher: Title', url: 'https://example.org' },
  };
}

/** Small deterministic random generator (mulberry32) so shuffles are reproducible. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const POOL: Sentence[] = [
  sentence('a', 'science', 'easy'),
  sentence('b', 'science', 'hard'),
  sentence('c', 'history', 'easy'),
  sentence('d', 'health', 'hard'),
];

describe('filterSentences', () => {
  it('returns everything for "all" and "all"', () => {
    expect(filterSentences(POOL, { category: 'all', difficulty: 'all' })).toHaveLength(4);
  });

  it('filters by category', () => {
    const ids = filterSentences(POOL, { category: 'science', difficulty: 'all' }).map((s) => s.id);
    expect(ids).toEqual(['a', 'b']);
  });

  it('filters by difficulty', () => {
    const ids = filterSentences(POOL, { category: 'all', difficulty: 'easy' }).map((s) => s.id);
    expect(ids).toEqual(['a', 'c']);
  });

  it('combines category and difficulty', () => {
    const ids = filterSentences(POOL, { category: 'science', difficulty: 'easy' }).map((s) => s.id);
    expect(ids).toEqual(['a']);
  });

  it('returns an empty list when nothing matches', () => {
    expect(filterSentences(POOL, { category: 'history', difficulty: 'hard' })).toEqual([]);
  });
});

describe('createSentenceQueue', () => {
  it('throws on an empty pool', () => {
    expect(() => createSentenceQueue([])).toThrow('Sentence pool is empty');
  });

  it('yields every sentence exactly once before any repeat', () => {
    const next = createSentenceQueue(POOL, seededRandom(1));
    const firstRound = Array.from({ length: POOL.length }, () => next().id);
    expect([...firstRound].sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('covers the whole pool again in each following round', () => {
    const next = createSentenceQueue(POOL, seededRandom(7));
    for (let round = 0; round < 5; round++) {
      const ids = Array.from({ length: POOL.length }, () => next().id);
      expect([...ids].sort()).toEqual(['a', 'b', 'c', 'd']);
    }
  });

  it('never repeats the same sentence back to back when the pool has 2 or more', () => {
    for (const size of [2, 3, 4]) {
      const pool = POOL.slice(0, size);
      for (let seed = 1; seed <= 50; seed++) {
        const next = createSentenceQueue(pool, seededRandom(seed));
        let previous = next().id;
        for (let i = 0; i < size * 6; i++) {
          const current = next().id;
          expect(current).not.toBe(previous);
          previous = current;
        }
      }
    }
  });

  it('repeats the only sentence of a one-item pool', () => {
    const next = createSentenceQueue([POOL[0]], seededRandom(3));
    expect(next().id).toBe('a');
    expect(next().id).toBe('a');
  });

  it('is reproducible for the same random source', () => {
    const run = (seed: number) => {
      const next = createSentenceQueue(POOL, seededRandom(seed));
      return Array.from({ length: 8 }, () => next().id);
    };
    expect(run(42)).toEqual(run(42));
  });

  it('does not modify the pool it was given', () => {
    const pool = [...POOL];
    const next = createSentenceQueue(pool, seededRandom(5));
    for (let i = 0; i < 8; i++) next();
    expect(pool.map((s) => s.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});
