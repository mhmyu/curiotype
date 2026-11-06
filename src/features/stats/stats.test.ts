import { describe, expect, it } from 'vitest';
import type { HistoryEntry } from '@/features/history/history';
import {
  TREND_LIMIT,
  bucketValue,
  computeCategoryAccuracy,
  computeCoverage,
  computeTotals,
  estimateTypingSeconds,
  filterByContentLang,
  getTrend,
  getTrendMax,
  latestBucket,
  listBuckets,
  listPersonalBests,
  percentOf,
  splitDuration,
  summarizeTrend,
} from './stats';

const bestKey = bucketValue;

let counter = 0;
function entry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  counter += 1;
  return {
    id: `e${counter}`,
    finishedAt: counter * 1000,
    contentLang: 'en',
    mode: 'time',
    durationSec: 60,
    category: 'all',
    difficulty: 'all',
    wpm: 40,
    rawWpm: 45,
    accuracy: 95,
    consistency: 80,
    errors: 3,
    ...overrides,
  };
}

describe('percentOf', () => {
  it('rounds to a whole percentage and never divides by zero', () => {
    expect(percentOf(1, 3)).toBe(33);
    expect(percentOf(2, 3)).toBe(67);
    expect(percentOf(5, 5)).toBe(100);
    expect(percentOf(0, 0)).toBe(0);
    expect(percentOf(3, 0)).toBe(0);
  });
});

describe('filterByContentLang', () => {
  it('keeps only the entries of one sentence language', () => {
    const en = entry({ contentLang: 'en' });
    const id = entry({ contentLang: 'id' });
    expect(filterByContentLang([en, id], 'id')).toEqual([id]);
    expect(filterByContentLang([en, id], 'en')).toEqual([en]);
    expect(filterByContentLang([en, id], 'fr')).toEqual([]);
  });
});

describe('estimateTypingSeconds', () => {
  it('uses the fixed duration of a time test', () => {
    expect(estimateTypingSeconds(entry({ durationSec: 30 }))).toBe(30);
  });

  it('derives the time of a test without duration from typed characters and raw WPM', () => {
    // 100 characters = 20 words; at 60 raw WPM that takes 20 seconds.
    const quote = entry({
      mode: 'quote',
      durationSec: null,
      rawWpm: 60,
      categoryChars: { science: 100 },
    });
    expect(estimateTypingSeconds(quote)).toBeCloseTo(20, 6);
  });

  it('adds the characters of every category', () => {
    const quote = entry({
      mode: 'quote',
      durationSec: null,
      rawWpm: 60,
      categoryChars: { science: 60, history: 40 },
    });
    expect(estimateTypingSeconds(quote)).toBeCloseTo(20, 6);
  });

  it('counts as 0 without characters or without raw WPM', () => {
    expect(estimateTypingSeconds(entry({ mode: 'quote', durationSec: null }))).toBe(0);
    expect(
      estimateTypingSeconds(
        entry({ mode: 'quote', durationSec: null, categoryChars: {}, rawWpm: 50 }),
      ),
    ).toBe(0);
    expect(
      estimateTypingSeconds(
        entry({ mode: 'quote', durationSec: null, categoryChars: { health: 80 }, rawWpm: 0 }),
      ),
    ).toBe(0);
  });
});

describe('computeTotals', () => {
  it('counts tests and adds the typing time', () => {
    const entries = [
      entry({ durationSec: 60 }),
      entry({ durationSec: 30 }),
      entry({ mode: 'quote', durationSec: null, rawWpm: 60, categoryChars: { science: 100 } }),
    ];
    const totals = computeTotals(entries);
    expect(totals.tests).toBe(3);
    expect(totals.typingSeconds).toBeCloseTo(110, 6);
  });

  it('is zero without tests', () => {
    expect(computeTotals([])).toEqual({ tests: 0, typingSeconds: 0 });
  });
});

describe('splitDuration', () => {
  it('uses seconds under a minute', () => {
    expect(splitDuration(0)).toEqual([{ unit: 'second', value: 0 }]);
    expect(splitDuration(45.4)).toEqual([{ unit: 'second', value: 45 }]);
    expect(splitDuration(-5)).toEqual([{ unit: 'second', value: 0 }]);
  });

  it('uses whole minutes under an hour', () => {
    expect(splitDuration(60)).toEqual([{ unit: 'minute', value: 1 }]);
    expect(splitDuration(140)).toEqual([{ unit: 'minute', value: 2 }]);
    expect(splitDuration(59.6 * 60)).toEqual([{ unit: 'hour', value: 1 }]);
  });

  it('uses hours and minutes from one hour, leaving out a zero part', () => {
    expect(splitDuration(3600)).toEqual([{ unit: 'hour', value: 1 }]);
    expect(splitDuration(3600 + 25 * 60)).toEqual([
      { unit: 'hour', value: 1 },
      { unit: 'minute', value: 25 },
    ]);
    expect(splitDuration(10 * 3600 + 5 * 60 + 20)).toEqual([
      { unit: 'hour', value: 10 },
      { unit: 'minute', value: 5 },
    ]);
  });
});

describe('buckets', () => {
  it('lists each mode and duration once: modes in registry order, shorter durations first', () => {
    const entries = [
      entry({ mode: 'quote', durationSec: null }),
      entry({ mode: 'time', durationSec: 60 }),
      entry({ mode: 'time', durationSec: 15 }),
      entry({ mode: 'time', durationSec: 60 }),
    ];
    expect(listBuckets(entries)).toEqual([
      { mode: 'time', durationSec: 15 },
      { mode: 'time', durationSec: 60 },
      { mode: 'quote', durationSec: null },
    ]);
    expect(listBuckets([])).toEqual([]);
  });

  it('splits count-mode tests by sentence count, after the other modes', () => {
    const entries = [
      entry({ mode: 'count', durationSec: null, sentenceCount: 10 }),
      entry({ mode: 'count', durationSec: null, sentenceCount: 3 }),
      entry({ mode: 'count', durationSec: null, sentenceCount: 10 }),
      entry({ mode: 'quote', durationSec: null }),
    ];
    expect(listBuckets(entries)).toEqual([
      { mode: 'quote', durationSec: null },
      { mode: 'count', durationSec: null, sentenceCount: 3 },
      { mode: 'count', durationSec: null, sentenceCount: 10 },
    ]);
    expect(bucketValue({ mode: 'count', durationSec: null, sentenceCount: 5 })).toBe('count:5');
  });

  it('trends only the tests of the chosen sentence count', () => {
    const entries = [
      entry({ mode: 'count', durationSec: null, sentenceCount: 3, wpm: 30 }),
      entry({ mode: 'count', durationSec: null, sentenceCount: 5, wpm: 50 }),
      entry({ mode: 'count', durationSec: null, sentenceCount: 3, wpm: 40 }),
    ];
    const trend = getTrend(entries, { mode: 'count', durationSec: null, sentenceCount: 3 });
    expect(trend.map((point) => point.wpm)).toEqual([30, 40]);
  });

  it('gives each bucket a distinct select value', () => {
    expect(bucketValue({ mode: 'time', durationSec: 60 })).toBe('time:60');
    expect(bucketValue({ mode: 'quote', durationSec: null })).toBe('quote:na');
  });

  it('finds the bucket of the most recent test whatever the array order', () => {
    const entries = [
      entry({ mode: 'time', durationSec: 30, finishedAt: 5000 }),
      entry({ mode: 'quote', durationSec: null, finishedAt: 9000 }),
      entry({ mode: 'time', durationSec: 60, finishedAt: 1000 }),
    ];
    expect(latestBucket(entries)).toEqual({ mode: 'quote', durationSec: null });
    expect(latestBucket([])).toBeNull();
  });
});

describe('stop-on-error buckets', () => {
  it('lists tests with stop-on-error as their own bucket, after the same option without it', () => {
    const entries = [
      entry({ durationSec: 30, stopOnError: true }),
      entry({ durationSec: 30 }),
      entry({ durationSec: 15 }),
    ];
    expect(listBuckets(entries)).toEqual([
      { mode: 'time', durationSec: 15 },
      { mode: 'time', durationSec: 30 },
      { mode: 'time', durationSec: 30, stopOnError: true },
    ]);
    expect(bucketValue({ mode: 'time', durationSec: 30, stopOnError: true })).toBe('time:30:soe');
    expect(bucketValue({ mode: 'time', durationSec: 30 })).toBe('time:30');
  });

  it('keeps the trend and the latest bucket apart', () => {
    const normal = entry({ durationSec: 30, wpm: 50 });
    const stopped = entry({ durationSec: 30, wpm: 35, stopOnError: true });
    expect(getTrend([normal, stopped], { mode: 'time', durationSec: 30 }).map((p) => p.wpm)).toEqual([50]);
    expect(
      getTrend([normal, stopped], { mode: 'time', durationSec: 30, stopOnError: true }).map((p) => p.wpm),
    ).toEqual([35]);
    expect(latestBucket([normal, stopped])).toEqual({ mode: 'time', durationSec: 30, stopOnError: true });
  });

  it('lists personal bests of stop-on-error tests separately', () => {
    expect(
      listPersonalBests({ 'en:time:30': 60, 'en:time:30:soe': 40 }, 'en').map((best) => [
        bestKey(best),
        best.wpm,
      ]),
    ).toEqual([
      ['time:30', 60],
      ['time:30:soe', 40],
    ]);
  });
});

describe('getTrend', () => {
  it('returns the tests of one bucket, oldest first', () => {
    const a = entry({ durationSec: 60, wpm: 30, finishedAt: 1000 });
    const b = entry({ durationSec: 60, wpm: 50, finishedAt: 3000 });
    const c = entry({ durationSec: 60, wpm: 40, finishedAt: 2000 });
    const other = entry({ durationSec: 30, wpm: 99, finishedAt: 4000 });
    const trend = getTrend([b, other, a, c], { mode: 'time', durationSec: 60 });
    expect(trend.map((point) => point.wpm)).toEqual([30, 40, 50]);
    expect(trend[0]).toEqual({ id: a.id, finishedAt: 1000, wpm: 30 });
  });

  it('keeps only the newest tests when there are more than the limit', () => {
    const entries = Array.from({ length: TREND_LIMIT + 5 }, (_, index) =>
      entry({ wpm: index, finishedAt: index + 1 }),
    );
    const trend = getTrend(entries, { mode: 'time', durationSec: 60 });
    expect(trend).toHaveLength(TREND_LIMIT);
    expect(trend[0]?.wpm).toBe(5);
    expect(trend[trend.length - 1]?.wpm).toBe(TREND_LIMIT + 4);
    expect(getTrend(entries, { mode: 'time', durationSec: 60 }, 3)).toHaveLength(3);
  });

  it('is empty for a bucket without tests', () => {
    expect(getTrend([entry()], { mode: 'quote', durationSec: null })).toEqual([]);
  });

  it('does not change the array it is given', () => {
    const entries = [entry({ finishedAt: 5 }), entry({ finishedAt: 1 })];
    const ids = entries.map((e) => e.id);
    getTrend(entries, { mode: 'time', durationSec: 60 });
    expect(entries.map((e) => e.id)).toEqual(ids);
  });
});

describe('summarizeTrend and getTrendMax', () => {
  const points = [
    { id: 'a', finishedAt: 1, wpm: 30 },
    { id: 'b', finishedAt: 2, wpm: 51 },
    { id: 'c', finishedAt: 3, wpm: 42 },
  ];

  it('gives the latest, the average (1 decimal) and the best WPM', () => {
    expect(summarizeTrend(points)).toEqual({ latest: 42, average: 41, best: 51 });
    expect(
      summarizeTrend([
        { id: 'a', finishedAt: 1, wpm: 10 },
        { id: 'b', finishedAt: 2, wpm: 11 },
        { id: 'c', finishedAt: 3, wpm: 11 },
      ]),
    ).toEqual({ latest: 11, average: 10.7, best: 11 });
  });

  it('is null for an empty trend', () => {
    expect(summarizeTrend([])).toBeNull();
  });

  it('rounds the top of the axis up to a multiple of 10, at least 10', () => {
    expect(getTrendMax(points)).toBe(60);
    expect(getTrendMax([{ id: 'a', finishedAt: 1, wpm: 60 }])).toBe(60);
    expect(getTrendMax([{ id: 'a', finishedAt: 1, wpm: 3 }])).toBe(10);
    expect(getTrendMax([])).toBe(10);
  });
});

const FOUR = ['science', 'history', 'technology', 'health'];

describe('computeCategoryAccuracy', () => {
  it('weights the accuracy of each test by its characters in the category', () => {
    const entries = [
      entry({ accuracy: 90, categoryChars: { science: 100 } }),
      entry({ accuracy: 96, categoryChars: { science: 100, history: 100 } }),
      entry({ accuracy: 100, categoryChars: { history: 200 } }),
    ];
    const result = computeCategoryAccuracy(entries, FOUR);
    expect(result.find((row) => row.category === 'science')).toEqual({
      category: 'science',
      accuracy: 93,
      chars: 200,
    });
    // (96 * 100 + 100 * 200) / 300 = 98.666...
    expect(result.find((row) => row.category === 'history')).toEqual({
      category: 'history',
      accuracy: 98.7,
      chars: 300,
    });
  });

  it('has a row for every category, with null accuracy where nothing was typed', () => {
    const result = computeCategoryAccuracy([entry({ categoryChars: { health: 50 } })], FOUR);
    expect(result.map((row) => row.category)).toEqual([
      'science',
      'history',
      'technology',
      'health',
    ]);
    expect(result.find((row) => row.category === 'technology')).toEqual({
      category: 'technology',
      accuracy: null,
      chars: 0,
    });
  });

  it('follows the given categories: their order, a new one, and no row for any other', () => {
    const entries = [entry({ accuracy: 80, categoryChars: { geography: 40, science: 60, retired: 500 } })];
    const result = computeCategoryAccuracy(entries, ['geography', 'science']);
    expect(result).toEqual([
      { category: 'geography', accuracy: 80, chars: 40 },
      { category: 'science', accuracy: 80, chars: 60 },
    ]);
    expect(computeCategoryAccuracy(entries, [])).toEqual([]);
    // The test still counts in the totals even though its characters of "retired" make no row.
    expect(computeTotals(entries).tests).toBe(1);
  });

  it('skips entries without categoryChars', () => {
    const result = computeCategoryAccuracy([entry({ accuracy: 50 })], FOUR);
    expect(result.every((row) => row.accuracy === null && row.chars === 0)).toBe(true);
  });
});

describe('computeCoverage', () => {
  const sentences = [
    { id: 'en-science-001', category: 'science' },
    { id: 'en-science-002', category: 'science' },
    { id: 'en-history-001', category: 'history' },
    { id: 'en-health-001', category: 'health' },
  ];

  it('counts typed sentences per category and in total', () => {
    const coverage = computeCoverage(sentences, ['en-science-001', 'en-health-001'], FOUR);
    expect(coverage.seen).toBe(2);
    expect(coverage.total).toBe(4);
    expect(coverage.byCategory).toEqual([
      { category: 'science', seen: 1, total: 2 },
      { category: 'history', seen: 0, total: 1 },
      { category: 'technology', seen: 0, total: 0 },
      { category: 'health', seen: 1, total: 1 },
    ]);
  });

  it('follows the given categories, including a new one, and ignores sentences of other categories', () => {
    const extra = [...sentences, { id: 'en-geography-001', category: 'geography' }];
    const coverage = computeCoverage(extra, ['en-geography-001'], ['geography', 'science']);
    expect(coverage.byCategory).toEqual([
      { category: 'geography', seen: 1, total: 1 },
      { category: 'science', seen: 0, total: 2 },
    ]);
    expect(coverage.total).toBe(3);
  });

  it('ignores ids that are not in the corpus and repeated ids', () => {
    const coverage = computeCoverage(sentences, [
      'en-science-001',
      'en-science-001',
      'en-science-999',
    ], FOUR);
    expect(coverage.seen).toBe(1);
  });

  it('handles an empty corpus', () => {
    const coverage = computeCoverage([], ['en-science-001'], FOUR);
    expect(coverage.seen).toBe(0);
    expect(coverage.total).toBe(0);
  });
});

describe('listPersonalBests', () => {
  it('keeps one sentence language and sorts by mode, then duration', () => {
    const bests = {
      'en:quote:na': 30,
      'en:time:60': 50,
      'en:time:15': 55,
      'id:time:60': 99,
    };
    expect(listPersonalBests(bests, 'en')).toEqual([
      { mode: 'time', durationSec: 15, wpm: 55 },
      { mode: 'time', durationSec: 60, wpm: 50 },
      { mode: 'quote', durationSec: null, wpm: 30 },
    ]);
    expect(listPersonalBests(bests, 'id')).toEqual([{ mode: 'time', durationSec: 60, wpm: 99 }]);
    expect(listPersonalBests(bests, 'fr')).toEqual([]);
  });

  it('lists count-mode records by sentence count', () => {
    const bests = { 'en:count:10': 35, 'en:count:3': 45, 'en:quote:na': 30 };
    expect(listPersonalBests(bests, 'en')).toEqual([
      { mode: 'quote', durationSec: null, wpm: 30 },
      { mode: 'count', durationSec: null, sentenceCount: 3, wpm: 45 },
      { mode: 'count', durationSec: null, sentenceCount: 10, wpm: 35 },
    ]);
  });
});
