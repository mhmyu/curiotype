import { describe, expect, it } from 'vitest';
import { createMemoryStorage } from '@/lib/storage/memory-adapter';
import { applyInput, createState } from './engine';
import {
  decayKeyStats,
  KEY_STATS_DECAY_THRESHOLD,
  loadKeyStats,
  mergeKeyStats,
  parseKeyStats,
  recordKeyStats,
  tallyKeystrokes,
} from './key-stats';

const KEY_STATS_KEY = 'key-stats:v1:en';

describe('tallyKeystrokes', () => {
  it('counts an attempt per new character and an error per mismatch', () => {
    expect(tallyKeystrokes({}, 'abc', 0, 'axc')).toEqual({
      a: { attempts: 1, errors: 0 },
      b: { attempts: 1, errors: 1 },
      c: { attempts: 1, errors: 0 },
    });
  });

  it('counts only characters added after the previous length', () => {
    expect(tallyKeystrokes({}, 'abc', 2, 'abc')).toEqual({ c: { attempts: 1, errors: 0 } });
  });

  it('returns the same object when no character was added', () => {
    const tally = { a: { attempts: 1, errors: 0 } };
    expect(tallyKeystrokes(tally, 'abc', 2, 'ab')).toBe(tally);
    expect(tallyKeystrokes(tally, 'abc', 2, 'a')).toBe(tally);
  });

  it('does not mutate the previous tally', () => {
    const tally = { a: { attempts: 1, errors: 0 } };
    tallyKeystrokes(tally, 'aa', 1, 'aa');
    expect(tally).toEqual({ a: { attempts: 1, errors: 0 } });
  });

  it('stores keys in lowercase but compares case-sensitively', () => {
    expect(tallyKeystrokes({}, 'Ab', 0, 'ab')).toEqual({
      a: { attempts: 1, errors: 1 },
      b: { attempts: 1, errors: 0 },
    });
  });

  it('records spaces and punctuation too', () => {
    expect(tallyKeystrokes({}, 'a b.', 0, 'a b.')).toEqual({
      a: { attempts: 1, errors: 0 },
      ' ': { attempts: 1, errors: 0 },
      b: { attempts: 1, errors: 0 },
      '.': { attempts: 1, errors: 0 },
    });
  });

  it('keeps errors that were erased, like the accuracy metric does', () => {
    let state = createState('ab');
    let tally = {};
    for (const value of ['x', '', 'a', 'ab']) {
      const previous = state;
      state = applyInput(state, value);
      tally = tallyKeystrokes(tally, previous.target, previous.typed.length, state.typed);
    }
    expect(tally).toEqual({
      a: { attempts: 2, errors: 1 },
      b: { attempts: 1, errors: 0 },
    });
  });
});

describe('decayKeyStats', () => {
  it('leaves keys at or below the threshold untouched', () => {
    const stats = { a: { attempts: KEY_STATS_DECAY_THRESHOLD, errors: 10 } };
    expect(decayKeyStats(stats)).toEqual(stats);
  });

  it('halves attempts and errors once a key passes the threshold', () => {
    const stats = {
      a: { attempts: 600, errors: 40 },
      b: { attempts: 100, errors: 5 },
    };
    expect(decayKeyStats(stats)).toEqual({
      a: { attempts: 300, errors: 20 },
      b: { attempts: 100, errors: 5 },
    });
  });

  it('halves repeatedly until the key is back under the threshold', () => {
    expect(decayKeyStats({ a: { attempts: 2100, errors: 100 } })).toEqual({
      a: { attempts: 263, errors: 13 },
    });
  });

  it('never makes errors exceed attempts', () => {
    const decayed = decayKeyStats({ a: { attempts: 501, errors: 501 } });
    expect(decayed.a.errors).toBeLessThanOrEqual(decayed.a.attempts);
  });
});

describe('mergeKeyStats', () => {
  it('adds the session counts to the stored counts', () => {
    expect(
      mergeKeyStats(
        { a: { attempts: 10, errors: 1 } },
        { a: { attempts: 5, errors: 2 }, b: { attempts: 3, errors: 0 } },
      ),
    ).toEqual({
      a: { attempts: 15, errors: 3 },
      b: { attempts: 3, errors: 0 },
    });
  });

  it('applies the decay after merging', () => {
    expect(
      mergeKeyStats({ a: { attempts: 498, errors: 20 } }, { a: { attempts: 4, errors: 2 } }),
    ).toEqual({ a: { attempts: 251, errors: 11 } });
  });
});

describe('parseKeyStats', () => {
  it('returns an empty object for anything that is not a plain object', () => {
    for (const raw of [null, undefined, 5, 'text', [], true]) {
      expect(parseKeyStats(raw)).toEqual({});
    }
  });

  it('keeps valid entries and drops invalid ones', () => {
    expect(
      parseKeyStats({
        a: { attempts: 10, errors: 2 },
        ab: { attempts: 1, errors: 0 },
        b: { attempts: -1, errors: 0 },
        c: { attempts: 5, errors: 6 },
        d: { attempts: 1.5, errors: 0 },
        e: 'x',
        f: { attempts: 0, errors: 0 },
        g: { attempts: '3', errors: 0 },
        h: null,
      }),
    ).toEqual({ a: { attempts: 10, errors: 2 } });
  });
});

describe('storage', () => {
  it('returns empty stats when nothing is stored', async () => {
    expect(await loadKeyStats(createMemoryStorage(), 'en')).toEqual({});
  });

  it('merges a session into the stored stats under the versioned key of the content language', async () => {
    const storage = createMemoryStorage();
    await recordKeyStats(storage, 'en', { a: { attempts: 3, errors: 1 } });
    const next = await recordKeyStats(storage, 'en', { a: { attempts: 2, errors: 0 } });

    expect(next).toEqual({ a: { attempts: 5, errors: 1 } });
    expect(JSON.parse(storage.data.get(KEY_STATS_KEY) ?? 'null')).toEqual(next);
  });

  it('writes nothing for an empty session', async () => {
    const storage = createMemoryStorage();
    await recordKeyStats(storage, 'en', {});
    expect(storage.data.has(KEY_STATS_KEY)).toBe(false);
  });

  it('survives corrupted stored data', async () => {
    const storage = createMemoryStorage();
    await storage.set(KEY_STATS_KEY, { a: 'broken', b: { attempts: 2, errors: 1 } });
    expect(await recordKeyStats(storage, 'en', { b: { attempts: 1, errors: 0 } })).toEqual({
      b: { attempts: 3, errors: 1 },
    });
  });

  it('keeps separate stats per content language', async () => {
    const storage = createMemoryStorage();
    await recordKeyStats(storage, 'en', { a: { attempts: 3, errors: 1 } });
    await recordKeyStats(storage, 'id', {
      a: { attempts: 4, errors: 0 },
      n: { attempts: 2, errors: 2 },
    });

    expect(await loadKeyStats(storage, 'en')).toEqual({ a: { attempts: 3, errors: 1 } });
    expect(await loadKeyStats(storage, 'id')).toEqual({
      a: { attempts: 4, errors: 0 },
      n: { attempts: 2, errors: 2 },
    });
    expect(await storage.keys('key-stats:')).toEqual(['key-stats:v1:en', 'key-stats:v1:id']);
  });
});
