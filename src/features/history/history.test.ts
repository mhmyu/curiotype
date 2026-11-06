import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStorage } from '@/lib/storage/memory-adapter';
import {
  getBucketKey,
  isBucketKey,
  loadHistory,
  loadPersonalBests,
  MAX_HISTORY_ENTRIES,
  parseBucketKey,
  parseHistoryEntry,
  parsePersonalBests,
  recordResult,
} from './history';
import type { NewHistoryEntry } from './history';

const HISTORY_KEY = 'history:v1';
const PERSONAL_BESTS_KEY = 'personal-bests:v1';

function result(overrides: Partial<NewHistoryEntry> = {}): NewHistoryEntry {
  return {
    contentLang: 'en',
    mode: 'time',
    durationSec: 30,
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

describe('bucket keys', () => {
  it('builds "<contentLang>:<mode>:<duration>" and uses "na" without a duration', () => {
    expect(getBucketKey({ contentLang: 'id', mode: 'time', durationSec: 60 })).toBe('id:time:60');
    expect(getBucketKey({ contentLang: 'en', mode: 'quote', durationSec: null })).toBe('en:quote:na');
  });

  it('uses the sentence count as the option of a count bucket', () => {
    const info = { contentLang: 'id', mode: 'count', durationSec: null, sentenceCount: 5 } as const;
    expect(getBucketKey(info)).toBe('id:count:5');
    expect(parseBucketKey('id:count:5')).toEqual(info);
  });

  it('ignores a stray duration in a count bucket and a stray count in other buckets', () => {
    expect(getBucketKey({ contentLang: 'en', mode: 'count', durationSec: 30, sentenceCount: 3 })).toBe('en:count:3');
    expect(getBucketKey({ contentLang: 'en', mode: 'time', durationSec: 30, sentenceCount: 3 })).toBe('en:time:30');
    expect(getBucketKey({ contentLang: 'en', mode: 'quote', durationSec: null, sentenceCount: 3 })).toBe('en:quote:na');
  });

  it('round-trips through parseBucketKey', () => {
    for (const info of [
      { contentLang: 'id', mode: 'time', durationSec: 15 },
      { contentLang: 'en', mode: 'quote', durationSec: null },
      { contentLang: 'en', mode: 'count', durationSec: null, sentenceCount: 10 },
    ] as const) {
      expect(parseBucketKey(getBucketKey(info))).toEqual(info);
    }
  });
});

describe('stop-on-error buckets', () => {
  it('adds a "soe" segment only to a stop-on-error key', () => {
    expect(getBucketKey({ contentLang: 'en', mode: 'time', durationSec: 30, stopOnError: true })).toBe('en:time:30:soe');
    expect(getBucketKey({ contentLang: 'en', mode: 'quote', durationSec: null, stopOnError: true })).toBe('en:quote:na:soe');
    expect(getBucketKey({ contentLang: 'en', mode: 'count', durationSec: null, sentenceCount: 5, stopOnError: true })).toBe('en:count:5:soe');
    // Off or absent: the key keeps its original three-segment shape.
    expect(getBucketKey({ contentLang: 'en', mode: 'time', durationSec: 30, stopOnError: false })).toBe('en:time:30');
  });

  it('round-trips through parseBucketKey', () => {
    for (const info of [
      { contentLang: 'id', mode: 'time', durationSec: 15, stopOnError: true },
      { contentLang: 'en', mode: 'quote', durationSec: null, stopOnError: true },
      { contentLang: 'en', mode: 'count', durationSec: null, sentenceCount: 3, stopOnError: true },
    ] as const) {
      expect(parseBucketKey(getBucketKey(info))).toEqual(info);
    }
    expect(parseBucketKey('en:time:30')).not.toHaveProperty('stopOnError');
  });

  it('recognizes the key shapes and rejects other fourth segments', () => {
    expect(isBucketKey('en:time:30:soe')).toBe(true);
    expect(isBucketKey('en:quote:na:soe')).toBe(true);
    expect(isBucketKey('en:time:30:strict')).toBe(false);
    // Relaxed sessions are not scored, so they have no record bucket.
    expect(isBucketKey('en:relaxed:na')).toBe(false);
    expect(parsePersonalBests({ 'en:relaxed:na': 50, 'en:quote:na': 40 })).toEqual({ 'en:quote:na': 40 });
    expect(isBucketKey('en:time:30:soe:x')).toBe(false);
  });

  it('keeps tests with and without stop-on-error in separate records', async () => {
    const storage = createMemoryStorage();
    await recordResult(storage, result({ wpm: 60 }));
    const stopped = await recordResult(storage, result({ wpm: 40, stopOnError: true }));
    // 40 is below the normal record (60) but is the first one of its own bucket.
    expect(stopped.isPersonalBest).toBe(true);
    expect(stopped.personalBests).toEqual({ 'en:time:30': 60, 'en:time:30:soe': 40 });

    const normal = await recordResult(storage, result({ wpm: 50 }));
    expect(normal.isPersonalBest).toBe(false);
    const betterStopped = await recordResult(storage, result({ wpm: 45, stopOnError: true }));
    expect(betterStopped.isPersonalBest).toBe(true);
    expect(betterStopped.personalBests['en:time:30:soe']).toBe(45);
    expect(betterStopped.personalBests['en:time:30']).toBe(60);
  });

  it('keeps stop-on-error records when stored personal bests are read back', () => {
    expect(parsePersonalBests({ 'en:time:30:soe': 42, 'en:time:30:bad': 10 })).toEqual({
      'en:time:30:soe': 42,
    });
  });
});

describe('count mode records', () => {
  it('keeps a separate personal best per sentence count', async () => {
    const storage = createMemoryStorage();
    const count = (sentenceCount: number, wpm: number) =>
      result({ mode: 'count', durationSec: null, sentenceCount, wpm });

    await recordResult(storage, count(3, 50));
    const five = await recordResult(storage, count(5, 40));
    expect(five.isPersonalBest).toBe(true);
    const slower = await recordResult(storage, count(3, 45));
    expect(slower.isPersonalBest).toBe(false);
    const faster = await recordResult(storage, count(3, 55));
    expect(faster.isPersonalBest).toBe(true);
    expect(faster.personalBests).toEqual({ 'en:count:3': 55, 'en:count:5': 40 });
    expect(faster.history[0].sentenceCount).toBe(3);
  });
});

describe('loading stored data', () => {
  it('returns an empty history when nothing is stored', async () => {
    expect(await loadHistory(createMemoryStorage())).toEqual([]);
  });

  it('ignores a stored history that is not an array', async () => {
    const storage = createMemoryStorage();
    await storage.set(HISTORY_KEY, { not: 'an array' });
    expect(await loadHistory(storage)).toEqual([]);
  });

  it('drops entries without a contentLang (the old "lang" field) and keeps valid ones', async () => {
    const storage = createMemoryStorage();
    const valid = { id: 'new', finishedAt: 2, ...result({ contentLang: 'id' }) };
    await storage.set(HISTORY_KEY, [
      { id: 'old', finishedAt: 1, ...result(), contentLang: undefined, lang: 'en' },
      null,
      'text',
      { ...valid, contentLang: '' },
      valid,
    ]);
    expect(await loadHistory(storage)).toEqual([valid]);
  });

  it('returns empty personal bests when nothing is stored', async () => {
    expect(await loadPersonalBests(createMemoryStorage())).toEqual({});
  });

  it('ignores stored personal bests that are not an object', async () => {
    const storage = createMemoryStorage();
    await storage.set(PERSONAL_BESTS_KEY, 'oops');
    expect(await loadPersonalBests(storage)).toEqual({});
  });

  it('survives corrupt stored text', async () => {
    const storage = createMemoryStorage(
      new Map([
        [HISTORY_KEY, '{broken'],
        [PERSONAL_BESTS_KEY, '{broken'],
      ]),
    );
    expect(await loadHistory(storage)).toEqual([]);
    expect(await loadPersonalBests(storage)).toEqual({});
  });
});

describe('recordResult', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('saves the first result with an id and timestamp, and marks it a personal best', async () => {
    const storage = createMemoryStorage();
    const outcome = await recordResult(storage, result());

    expect(outcome.isPersonalBest).toBe(true);
    expect(outcome.history).toHaveLength(1);
    expect(outcome.history[0].id).toBeTruthy();
    expect(outcome.history[0].finishedAt).toBe(Date.parse('2026-01-01T00:00:00Z'));
    expect(outcome.personalBests).toEqual({ 'en:time:30': 40 });
    expect(await loadHistory(storage)).toEqual(outcome.history);
    expect(await loadPersonalBests(storage)).toEqual(outcome.personalBests);
  });

  it('puts the newest result first', async () => {
    const storage = createMemoryStorage();
    await recordResult(storage, result({ wpm: 30 }));
    vi.setSystemTime(new Date('2026-01-01T00:05:00Z'));
    const outcome = await recordResult(storage, result({ wpm: 35 }));
    expect(outcome.history.map((entry) => entry.wpm)).toEqual([35, 30]);
  });

  it('gives every entry a different id', async () => {
    const storage = createMemoryStorage();
    let outcome = await recordResult(storage, result());
    for (let i = 0; i < 20; i++) outcome = await recordResult(storage, result());
    expect(new Set(outcome.history.map((entry) => entry.id)).size).toBe(21);
  });

  it('raises the personal best only when WPM is strictly higher in the same bucket', async () => {
    const storage = createMemoryStorage();
    await recordResult(storage, result({ wpm: 40 }));

    const lower = await recordResult(storage, result({ wpm: 39 }));
    expect(lower.isPersonalBest).toBe(false);
    expect(lower.personalBests['en:time:30']).toBe(40);

    const equal = await recordResult(storage, result({ wpm: 40 }));
    expect(equal.isPersonalBest).toBe(false);

    const higher = await recordResult(storage, result({ wpm: 41.5 }));
    expect(higher.isPersonalBest).toBe(true);
    expect(higher.personalBests['en:time:30']).toBe(41.5);
  });

  it('keeps separate personal bests per content language, mode and duration', async () => {
    const storage = createMemoryStorage();
    await recordResult(storage, result({ wpm: 50 }));

    const otherLang = await recordResult(storage, result({ contentLang: 'id', wpm: 20 }));
    const otherDuration = await recordResult(storage, result({ durationSec: 60, wpm: 20 }));
    const otherMode = await recordResult(
      storage,
      result({ mode: 'quote', durationSec: null, wpm: 20 }),
    );

    expect(otherLang.isPersonalBest).toBe(true);
    expect(otherDuration.isPersonalBest).toBe(true);
    expect(otherMode.isPersonalBest).toBe(true);
    expect(otherMode.personalBests).toEqual({
      'en:time:30': 50,
      'id:time:30': 20,
      'en:time:60': 20,
      'en:quote:na': 20,
    });
  });

  it('does not rewrite personal bests when the result is not a record', async () => {
    const storage = createMemoryStorage();
    await recordResult(storage, result({ wpm: 40 }));
    const before = storage.data.get(PERSONAL_BESTS_KEY);
    await recordResult(storage, result({ wpm: 10 }));
    expect(storage.data.get(PERSONAL_BESTS_KEY)).toBe(before);
  });

  it(`trims the history to the newest ${MAX_HISTORY_ENTRIES} entries`, async () => {
    expect(MAX_HISTORY_ENTRIES).toBe(200);
    const storage = createMemoryStorage();
    let outcome = await recordResult(storage, result({ wpm: 1 }));
    for (let i = 0; i < MAX_HISTORY_ENTRIES + 5; i++) {
      outcome = await recordResult(storage, result({ wpm: 1 })); // never a new record
    }
    expect(outcome.history).toHaveLength(MAX_HISTORY_ENTRIES);
    expect((await loadHistory(storage)).length).toBe(MAX_HISTORY_ENTRIES);
  });

  it('drops the oldest entries first when trimming', async () => {
    const storage = createMemoryStorage();
    // Start with the best result, then fill the history with lower ones.
    await recordResult(storage, result({ wpm: 99 }));
    for (let i = 0; i < MAX_HISTORY_ENTRIES; i++) {
      await recordResult(storage, result({ wpm: 10 + (i % 50) }));
    }
    const history = await loadHistory(storage);
    expect(history).toHaveLength(MAX_HISTORY_ENTRIES);
    expect(history.some((entry) => entry.wpm === 99)).toBe(false);
  });

  it('keeps the personal best after the record entry is trimmed from the history', async () => {
    const storage = createMemoryStorage();
    await recordResult(storage, result({ wpm: 99 }));
    for (let i = 0; i < MAX_HISTORY_ENTRIES; i++) {
      await recordResult(storage, result({ wpm: 10 }));
    }
    expect((await loadHistory(storage)).some((entry) => entry.wpm === 99)).toBe(false);
    expect((await loadPersonalBests(storage))['en:time:30']).toBe(99);
  });
});

describe('content language', () => {
  it('stores the content language with the entry', async () => {
    const storage = createMemoryStorage();
    const { history } = await recordResult(storage, result({ contentLang: 'id' }));
    expect(history[0].contentLang).toBe('id');
    expect((await loadHistory(storage))[0].contentLang).toBe('id');
  });

  it('keeps the history of both languages in one list', async () => {
    const storage = createMemoryStorage();
    await recordResult(storage, result({ contentLang: 'en', wpm: 30 }));
    const { history } = await recordResult(storage, result({ contentLang: 'id', wpm: 20 }));
    expect(history.map((entry) => entry.contentLang)).toEqual(['id', 'en']);
  });
});

describe('captured sentence data', () => {
  it('stores sentenceIds and categoryChars with the entry', async () => {
    const storage = createMemoryStorage();
    const { history } = await recordResult(
      storage,
      result({ sentenceIds: ['en-science-001', 'en-health-002'], categoryChars: { science: 60, health: 12 } }),
    );

    expect(history[0].sentenceIds).toEqual(['en-science-001', 'en-health-002']);
    expect(history[0].categoryChars).toEqual({ science: 60, health: 12 });
    expect((await loadHistory(storage))[0]).toEqual(history[0]);
  });

  it('loads and keeps entries saved before the fields existed', async () => {
    const storage = createMemoryStorage();
    await storage.set(HISTORY_KEY, [
      { id: 'old', finishedAt: 1, ...result() },
    ]);

    const { history } = await recordResult(storage, result({ sentenceIds: ['en-science-001'] }));
    expect(history).toHaveLength(2);
    expect(history[1].sentenceIds).toBeUndefined();
    expect(history[1].categoryChars).toBeUndefined();
  });
});

describe('personal best parsing', () => {
  it('isBucketKey accepts "<contentLang>:<mode>:<seconds | na>" only', () => {
    for (const key of ['en:time:30', 'id:quote:na', 'pt-br:time:120', 'en:count:5']) expect(isBucketKey(key), key).toBe(true);
    for (const key of ['', 'en', 'en:time', 'en:time:0', 'en:time:3.5', 'en:zen:30', ':time:30', 'en:time:30:x']) {
      expect(isBucketKey(key), key).toBe(false);
    }
  });

  it('parsePersonalBests keeps valid buckets and drops everything else', () => {
    expect(
      parsePersonalBests({ 'en:time:30': 50, 'id:quote:na': 0, broken: 5, 'en:time:60': '70', 'en:time:15': -1, 'en:time:120': Number.NaN }),
    ).toEqual({ 'en:time:30': 50, 'id:quote:na': 0 });
    expect(parsePersonalBests(null)).toEqual({});
    expect(parsePersonalBests([1, 2])).toEqual({});
    expect(parsePersonalBests('x')).toEqual({});
  });

  it('loadPersonalBests drops damaged entries from stored data', async () => {
    const storage = createMemoryStorage();
    await storage.set(PERSONAL_BESTS_KEY, { 'en:time:30': 55, junk: 'x' });
    expect(await loadPersonalBests(storage)).toEqual({ 'en:time:30': 55 });
  });
});

describe('parseHistoryEntry', () => {
  const valid = { id: 'a', finishedAt: 1, ...result() };

  it('returns a clean copy of a valid entry', () => {
    expect(parseHistoryEntry({ ...valid, extra: 1 })).toEqual(valid);
  });

  it('returns null for an entry with a wrong or missing field', () => {
    expect(parseHistoryEntry(null)).toBeNull();
    expect(parseHistoryEntry({ ...valid, wpm: undefined })).toBeNull();
    expect(parseHistoryEntry({ ...valid, mode: 'zen' })).toBeNull();
  });

  it('accepts any well-formed category id, also one that is not in the category list', () => {
    expect(parseHistoryEntry({ ...valid, category: 'geography' })?.category).toBe('geography');
    expect(parseHistoryEntry({ ...valid, category: 'earth-science' })?.category).toBe('earth-science');
    expect(
      parseHistoryEntry({ ...valid, categoryChars: { geography: 40, science: 20 } })?.categoryChars,
    ).toEqual({ geography: 40, science: 20 });
  });

  it('rejects a category id or a categoryChars key that is not well formed', () => {
    for (const category of ['Science', '1x', 'a_b', '', 'a'.repeat(31), 5]) {
      expect(parseHistoryEntry({ ...valid, category }), String(category)).toBeNull();
    }
    expect(parseHistoryEntry({ ...valid, categoryChars: { 'Bad Name': 10 } })).toBeNull();
    expect(parseHistoryEntry({ ...valid, categoryChars: { science: -1 } })).toBeNull();
  });

  it('accepts the two difficulty levels and "all", and rejects the retired "medium" (no migration)', () => {
    for (const difficulty of ['easy', 'hard', 'all']) {
      expect(parseHistoryEntry({ ...valid, difficulty }), difficulty).toEqual({ ...valid, difficulty });
    }
    expect(parseHistoryEntry({ ...valid, difficulty: 'medium' })).toBeNull();
  });

  it('keeps stopOnError only when it is true and rejects other types', () => {
    expect(parseHistoryEntry({ ...valid, stopOnError: true })).toEqual({ ...valid, stopOnError: true });
    // False is the same as absent, so it is not stored.
    expect(parseHistoryEntry({ ...valid, stopOnError: false })).toEqual(valid);
    for (const bad of ['yes', 1, null]) {
      expect(parseHistoryEntry({ ...valid, stopOnError: bad }), String(bad)).toBeNull();
    }
  });

  it('accepts a sentence count and rejects an invalid one', () => {
    const count = { ...valid, mode: 'count', durationSec: null };
    expect(parseHistoryEntry({ ...count, sentenceCount: 5 })).toEqual({ ...count, sentenceCount: 5 });
    expect(parseHistoryEntry({ ...count, sentenceCount: null })).toEqual(count);
    for (const bad of [0, -1, 2.5, '5']) {
      expect(parseHistoryEntry({ ...count, sentenceCount: bad }), String(bad)).toBeNull();
    }
  });
});

describe('custom text results', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('enters the history but is never a personal best', async () => {
    const storage = createMemoryStorage();
    const outcome = await recordResult(storage, result({ mode: 'custom', durationSec: null, wpm: 90 }));

    expect(outcome.isPersonalBest).toBe(false);
    expect(outcome.history).toHaveLength(1);
    expect(outcome.history[0].mode).toBe('custom');
    expect(outcome.personalBests).toEqual({});
    expect(await loadHistory(storage)).toEqual(outcome.history);
    expect(await storage.get(PERSONAL_BESTS_KEY)).toBeNull();
  });

  it('leaves the records of other modes untouched and still trims the history', async () => {
    const storage = createMemoryStorage();
    await recordResult(storage, result({ wpm: 50 }));
    const outcome = await recordResult(storage, result({ mode: 'custom', durationSec: null, wpm: 200 }));

    expect(outcome.personalBests).toEqual({ 'en:time:30': 50 });
    expect(outcome.history.map((entry) => entry.mode)).toEqual(['custom', 'time']);

    for (let i = 0; i < MAX_HISTORY_ENTRIES + 5; i += 1) {
      await recordResult(storage, result({ mode: 'custom', durationSec: null }));
    }
    expect(await loadHistory(storage)).toHaveLength(MAX_HISTORY_ENTRIES);
  });

  it('has no bucket key: a record key for custom text is not valid', () => {
    expect(isBucketKey('en:custom:na')).toBe(false);
    expect(parsePersonalBests({ 'en:custom:na': 80, 'en:time:30': 40 })).toEqual({ 'en:time:30': 40 });
  });

  it('is accepted as a history entry when importing', () => {
    const entry = parseHistoryEntry({
      id: 'c1',
      finishedAt: 1000,
      contentLang: 'en',
      mode: 'custom',
      durationSec: null,
      category: 'all',
      difficulty: 'all',
      wpm: 60,
      rawWpm: 62,
      accuracy: 97,
      consistency: 90,
      errors: 2,
    });
    expect(entry?.mode).toBe('custom');
    expect(entry?.sentenceIds).toBeUndefined();
    expect(entry?.categoryChars).toBeUndefined();
  });
});
