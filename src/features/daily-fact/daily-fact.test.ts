import { describe, expect, it } from 'vitest';
import type { Sentence } from '@/lib/types';
import { getDailyFactIndex, hashString, pickDailyFact } from './daily-fact';

function makeSentences(count: number, lang: 'en' | 'id' = 'en'): Sentence[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${lang}-science-${String(i + 1).padStart(3, '0')}`,
    lang,
    category: 'science',
    difficulty: 'easy',
    text: `Sentence number ${i + 1}.`,
    explanation: 'An explanation that is long enough to look real.',
    source: { title: 'Publisher: Page', url: 'https://example.org/page' },
  }));
}

/** `YYYY-MM-DD` for `offset` days after 2026-01-01 (UTC maths, so the test is time zone proof). */
function dayAfter(offset: number): string {
  return new Date(Date.UTC(2026, 0, 1 + offset)).toISOString().slice(0, 10);
}

describe('hashString', () => {
  it('matches the published FNV-1a test vectors', () => {
    expect(hashString('')).toBe(0x811c9dc5);
    expect(hashString('a')).toBe(0xe40c292c);
    expect(hashString('foobar')).toBe(0xbf9cf968);
  });

  it('always returns an unsigned 32-bit integer', () => {
    for (let i = 0; i < 200; i++) {
      const hash = hashString(`${dayAfter(i)}en`);
      expect(Number.isInteger(hash)).toBe(true);
      expect(hash).toBeGreaterThanOrEqual(0);
      expect(hash).toBeLessThanOrEqual(0xffffffff);
    }
  });
});

describe('getDailyFactIndex', () => {
  it('is the hash of the day plus the language, modulo the corpus size', () => {
    expect(getDailyFactIndex('2026-11-01', 'en', 40)).toBe(hashString('2026-11-01en') % 40);
    expect(getDailyFactIndex('2026-11-01', 'id', 7)).toBe(hashString('2026-11-01id') % 7);
  });

  it('stays inside the corpus for any size', () => {
    for (const count of [1, 2, 5, 40, 100, 1234]) {
      for (let i = 0; i < 60; i++) {
        const index = getDailyFactIndex(dayAfter(i), 'en', count);
        expect(index).not.toBeNull();
        expect(index as number).toBeGreaterThanOrEqual(0);
        expect(index as number).toBeLessThan(count);
      }
    }
  });

  it('is null when there is nothing to pick from', () => {
    expect(getDailyFactIndex('2026-11-01', 'en', 0)).toBeNull();
    expect(getDailyFactIndex('2026-11-01', 'en', -3)).toBeNull();
    expect(getDailyFactIndex('2026-11-01', 'en', 2.5)).toBeNull();
    expect(getDailyFactIndex('2026-11-01', 'en', Number.NaN)).toBeNull();
  });

  it('always gives index 0 for a corpus of one', () => {
    expect(getDailyFactIndex('2026-11-01', 'en', 1)).toBe(0);
    expect(getDailyFactIndex('2030-02-28', 'id', 1)).toBe(0);
  });

  it('gives the same answer every time for the same day and language', () => {
    expect(getDailyFactIndex('2026-11-01', 'en', 40)).toBe(getDailyFactIndex('2026-11-01', 'en', 40));
  });

  it('depends on the language', () => {
    const days = Array.from({ length: 60 }, (_, i) => dayAfter(i));
    const differing = days.filter((d) => getDailyFactIndex(d, 'en', 40) !== getDailyFactIndex(d, 'id', 40));
    expect(differing.length).toBeGreaterThan(30);
  });

  it('changes from day to day and uses most of the corpus over a year', () => {
    const seen = new Set<number>();
    let changes = 0;
    let previous: number | null = null;
    for (let i = 0; i < 365; i++) {
      const index = getDailyFactIndex(dayAfter(i), 'en', 40) as number;
      seen.add(index);
      if (previous !== null && index !== previous) changes++;
      previous = index;
    }
    expect(changes).toBeGreaterThan(300);
    expect(seen.size).toBeGreaterThanOrEqual(30);
  });
});

describe('pickDailyFact', () => {
  const sentences = makeSentences(40);

  it('returns null for an empty corpus', () => {
    expect(pickDailyFact([], '2026-11-01', 'en')).toBeNull();
  });

  it('returns the sentence at the hashed position of the id-ordered corpus', () => {
    const index = getDailyFactIndex('2026-11-01', 'en', 40) as number;
    expect(pickDailyFact(sentences, '2026-11-01', 'en')).toBe(sentences[index]);
  });

  it('is the same on the same day and can differ on another day', () => {
    const first = pickDailyFact(sentences, '2026-11-01', 'en');
    expect(pickDailyFact(sentences, '2026-11-01', 'en')).toBe(first);
    const picks = new Set(Array.from({ length: 10 }, (_, i) => pickDailyFact(sentences, dayAfter(i), 'en')?.id));
    expect(picks.size).toBeGreaterThan(1);
  });

  it('does not depend on the order of the list, and does not modify it', () => {
    const shuffled = [...sentences].reverse();
    const before = shuffled.map((s) => s.id);
    for (let i = 0; i < 30; i++) {
      const day = dayAfter(i);
      expect(pickDailyFact(shuffled, day, 'en')?.id).toBe(pickDailyFact(sentences, day, 'en')?.id);
    }
    expect(shuffled.map((s) => s.id)).toEqual(before);
  });

  it('handles a corpus of one sentence', () => {
    const [only] = makeSentences(1);
    expect(pickDailyFact([only], '2026-11-01', 'en')).toBe(only);
  });

  it('picks from the corpus it is given, whatever the language', () => {
    const indonesian = makeSentences(40, 'id');
    expect(pickDailyFact(indonesian, '2026-11-01', 'id')?.lang).toBe('id');
  });
});
