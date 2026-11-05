import { describe, expect, it } from 'vitest';
import { createMemoryStorage } from '@/lib/storage/memory-adapter';
import { loadSeen, markSeen } from './seen';

const SEEN_KEY = 'seen:v1:en';

describe('loadSeen', () => {
  it('returns an empty list when nothing is stored', async () => {
    expect(await loadSeen(createMemoryStorage(), 'en')).toEqual([]);
  });

  it('ignores stored data that is not an array', async () => {
    const storage = createMemoryStorage();
    await storage.set(SEEN_KEY, { id: 'en-science-001' });
    expect(await loadSeen(storage, 'en')).toEqual([]);
  });

  it('drops non-string and empty entries and duplicates', async () => {
    const storage = createMemoryStorage();
    await storage.set(SEEN_KEY, ['a', 1, null, '', 'b', 'a']);
    expect(await loadSeen(storage, 'en')).toEqual(['a', 'b']);
  });
});

describe('markSeen', () => {
  it('stores new ids under the versioned key of the content language', async () => {
    const storage = createMemoryStorage();
    expect(await markSeen(storage, 'en', ['a', 'b'])).toEqual(['a', 'b']);
    expect(storage.data.get(SEEN_KEY)).toBe('["a","b"]');
  });

  it('keeps existing ids in order and appends only new ones', async () => {
    const storage = createMemoryStorage();
    await markSeen(storage, 'en', ['a', 'b']);
    expect(await markSeen(storage, 'en', ['b', 'c', 'c'])).toEqual(['a', 'b', 'c']);
    expect(await loadSeen(storage, 'en')).toEqual(['a', 'b', 'c']);
  });

  it('does not write when nothing is new', async () => {
    const storage = createMemoryStorage();
    expect(await markSeen(storage, 'en', [])).toEqual([]);
    expect(storage.data.has(SEEN_KEY)).toBe(false);

    await markSeen(storage, 'en', ['a']);
    const before = storage.data.get(SEEN_KEY);
    await markSeen(storage, 'en', ['a']);
    expect(storage.data.get(SEEN_KEY)).toBe(before);
  });
});

describe('content languages', () => {
  it('keeps a separate list per content language', async () => {
    const storage = createMemoryStorage();
    await markSeen(storage, 'en', ['en-science-001']);
    await markSeen(storage, 'id', ['id-science-001', 'id-health-001']);

    expect(await loadSeen(storage, 'en')).toEqual(['en-science-001']);
    expect(await loadSeen(storage, 'id')).toEqual(['id-science-001', 'id-health-001']);
    expect(await storage.keys('seen:')).toEqual(['seen:v1:en', 'seen:v1:id']);
  });

  it('does not treat an id seen in one language as new or known in the other', async () => {
    const storage = createMemoryStorage();
    await markSeen(storage, 'en', ['shared']);
    expect(await markSeen(storage, 'id', ['shared'])).toEqual(['shared']);
  });
});
