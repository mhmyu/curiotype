import { describe, expect, it } from 'vitest';
import { createMemoryStorage } from '@/lib/storage/memory-adapter';
import {
  MAX_FAVORITES,
  favoritesKey,
  loadFavorites,
  mergeFavorites,
  parseFavorites,
  pruneFavorites,
  removeFavorite,
  restoreFavorite,
  toggleFavorite,
} from './favorites';

describe('favoritesKey', () => {
  it('has one versioned key per content language', () => {
    expect(favoritesKey('id')).toBe('favorites:v1:id');
    expect(favoritesKey('pt-br')).toBe('favorites:v1:pt-br');
  });
});

describe('parseFavorites', () => {
  it('returns an empty list for anything that is not an array', () => {
    for (const raw of [null, undefined, 'x', 5, {}, { id: 'a', savedAt: 1 }]) {
      expect(parseFavorites(raw)).toEqual([]);
    }
  });

  it('drops invalid entries, drops extra fields, and sorts newest first', () => {
    const raw = [
      { id: 'a', savedAt: 100, extra: true },
      { id: '', savedAt: 5 },
      { id: 'b', savedAt: 'x' },
      { id: 'c', savedAt: Number.NaN },
      { id: 'd', savedAt: -1 },
      null,
      'e',
      { id: 'f', savedAt: 300 },
    ];
    expect(parseFavorites(raw)).toEqual([
      { id: 'f', savedAt: 300 },
      { id: 'a', savedAt: 100 },
    ]);
  });

  it('keeps one entry per id, with the latest time', () => {
    expect(
      parseFavorites([
        { id: 'a', savedAt: 10 },
        { id: 'a', savedAt: 30 },
        { id: 'a', savedAt: 20 },
      ]),
    ).toEqual([{ id: 'a', savedAt: 30 }]);
  });

  it('keeps only the newest MAX_FAVORITES entries', () => {
    const raw = Array.from({ length: MAX_FAVORITES + 5 }, (_, i) => ({ id: `s${i}`, savedAt: i }));
    const parsed = parseFavorites(raw);
    expect(parsed).toHaveLength(MAX_FAVORITES);
    expect(parsed[0]).toEqual({ id: `s${MAX_FAVORITES + 4}`, savedAt: MAX_FAVORITES + 4 });
    expect(parsed.some((f) => f.id === 's0')).toBe(false);
  });
});

describe('mergeFavorites', () => {
  it('unions by id, the later time wins, newest first', () => {
    const merged = mergeFavorites(
      [
        { id: 'a', savedAt: 10 },
        { id: 'b', savedAt: 50 },
      ],
      [
        { id: 'a', savedAt: 40 },
        { id: 'c', savedAt: 20 },
      ],
    );
    expect(merged).toEqual([
      { id: 'b', savedAt: 50 },
      { id: 'a', savedAt: 40 },
      { id: 'c', savedAt: 20 },
    ]);
  });

  it('trims to the limit, dropping the oldest', () => {
    const current = Array.from({ length: MAX_FAVORITES }, (_, i) => ({ id: `s${i}`, savedAt: 1000 + i }));
    const merged = mergeFavorites(current, [{ id: 'old', savedAt: 1 }, { id: 'new', savedAt: 5000 }]);
    expect(merged).toHaveLength(MAX_FAVORITES);
    expect(merged[0]?.id).toBe('new');
    expect(merged.some((f) => f.id === 'old')).toBe(false);
    // 502 entries went in: the two oldest (`old` and `s0`) are dropped, `s1` is the oldest kept.
    expect(merged.some((f) => f.id === 's0')).toBe(false);
    expect(merged.some((f) => f.id === 's1')).toBe(true);
  });
});

describe('loadFavorites', () => {
  it('is empty when nothing is stored or the stored value is damaged', async () => {
    const storage = createMemoryStorage();
    expect(await loadFavorites(storage, 'en')).toEqual([]);
    await storage.set('favorites:v1:en', 'broken');
    expect(await loadFavorites(storage, 'en')).toEqual([]);
  });
});

describe('toggleFavorite', () => {
  it('saves a sentence at the top of the list, then removes it on the second call', async () => {
    const storage = createMemoryStorage();
    expect(await toggleFavorite(storage, 'en', 'en-science-001', 100)).toEqual([
      { id: 'en-science-001', savedAt: 100 },
    ]);
    expect(await toggleFavorite(storage, 'en', 'en-history-002', 200)).toEqual([
      { id: 'en-history-002', savedAt: 200 },
      { id: 'en-science-001', savedAt: 100 },
    ]);
    expect(await toggleFavorite(storage, 'en', 'en-science-001', 300)).toEqual([
      { id: 'en-history-002', savedAt: 200 },
    ]);
    expect(await storage.get('favorites:v1:en')).toEqual([{ id: 'en-history-002', savedAt: 200 }]);
  });

  it('removes the key when the last sentence is removed', async () => {
    const storage = createMemoryStorage();
    await toggleFavorite(storage, 'en', 'en-science-001', 1);
    await toggleFavorite(storage, 'en', 'en-science-001', 2);
    expect(await storage.keys()).toEqual([]);
  });

  it('keeps each content language separate', async () => {
    const storage = createMemoryStorage();
    await toggleFavorite(storage, 'en', 'en-science-001', 1);
    await toggleFavorite(storage, 'id', 'id-science-001', 2);
    expect(await loadFavorites(storage, 'en')).toEqual([{ id: 'en-science-001', savedAt: 1 }]);
    expect(await loadFavorites(storage, 'id')).toEqual([{ id: 'id-science-001', savedAt: 2 }]);
  });

  it('drops the oldest sentence when the list is full', async () => {
    const storage = createMemoryStorage();
    const full = Array.from({ length: MAX_FAVORITES }, (_, i) => ({ id: `s${i}`, savedAt: 1000 + i }));
    await storage.set('favorites:v1:en', full);
    const next = await toggleFavorite(storage, 'en', 'fresh', 9999);
    expect(next).toHaveLength(MAX_FAVORITES);
    expect(next[0]).toEqual({ id: 'fresh', savedAt: 9999 });
    expect(next.some((f) => f.id === 's0')).toBe(false);
    expect(next.some((f) => f.id === 's1')).toBe(true);
  });
});

describe('removeFavorite', () => {
  it('removes a saved sentence and never re-adds a missing one', async () => {
    const storage = createMemoryStorage();
    await toggleFavorite(storage, 'en', 'a', 1);
    await toggleFavorite(storage, 'en', 'b', 2);
    expect(await removeFavorite(storage, 'en', 'a')).toEqual([{ id: 'b', savedAt: 2 }]);
    expect(await removeFavorite(storage, 'en', 'a')).toEqual([{ id: 'b', savedAt: 2 }]);
    expect(await removeFavorite(storage, 'en', 'b')).toEqual([]);
    expect(await storage.keys()).toEqual([]);
  });
});

describe('pruneFavorites', () => {
  it('drops ids that are not in the corpus and writes the cleaned list', async () => {
    const storage = createMemoryStorage();
    await storage.set('favorites:v1:en', [
      { id: 'gone', savedAt: 3 },
      { id: 'kept', savedAt: 2 },
      { id: 'also-gone', savedAt: 1 },
    ]);
    expect(await pruneFavorites(storage, 'en', new Set(['kept', 'other']))).toEqual([{ id: 'kept', savedAt: 2 }]);
    expect(await storage.get('favorites:v1:en')).toEqual([{ id: 'kept', savedAt: 2 }]);
  });

  it('does not write when nothing is dropped', async () => {
    const storage = createMemoryStorage();
    const raw = [{ id: 'kept', savedAt: 2, extra: 'unchanged' }];
    await storage.set('favorites:v1:en', raw);
    await pruneFavorites(storage, 'en', new Set(['kept']));
    expect(await storage.get('favorites:v1:en')).toEqual(raw);
  });

  it('removes the key when every saved id is gone', async () => {
    const storage = createMemoryStorage();
    await storage.set('favorites:v1:en', [{ id: 'gone', savedAt: 1 }]);
    expect(await pruneFavorites(storage, 'en', new Set())).toEqual([]);
    expect(await storage.keys()).toEqual([]);
  });
});

describe('restoreFavorite', () => {
  it('puts a removed sentence back at its old place with its original time', async () => {
    const storage = createMemoryStorage();
    await toggleFavorite(storage, 'en', 'a', 1);
    await toggleFavorite(storage, 'en', 'b', 2);
    await toggleFavorite(storage, 'en', 'c', 3);
    await removeFavorite(storage, 'en', 'b');

    expect(await restoreFavorite(storage, 'en', { id: 'b', savedAt: 2 })).toEqual([
      { id: 'c', savedAt: 3 },
      { id: 'b', savedAt: 2 },
      { id: 'a', savedAt: 1 },
    ]);
    expect(await loadFavorites(storage, 'en')).toEqual([
      { id: 'c', savedAt: 3 },
      { id: 'b', savedAt: 2 },
      { id: 'a', savedAt: 1 },
    ]);
  });

  it('writes the key again when the removed sentence was the last one', async () => {
    const storage = createMemoryStorage();
    await toggleFavorite(storage, 'en', 'a', 7);
    await removeFavorite(storage, 'en', 'a');
    expect(await storage.keys()).toEqual([]);

    expect(await restoreFavorite(storage, 'en', { id: 'a', savedAt: 7 })).toEqual([{ id: 'a', savedAt: 7 }]);
    expect(await storage.get('favorites:v1:en')).toEqual([{ id: 'a', savedAt: 7 }]);
  });

  it('does not add a second copy when the id is already saved again', async () => {
    const storage = createMemoryStorage();
    await toggleFavorite(storage, 'en', 'a', 9);
    expect(await restoreFavorite(storage, 'en', { id: 'a', savedAt: 1 })).toEqual([{ id: 'a', savedAt: 9 }]);
    expect(await loadFavorites(storage, 'en')).toEqual([{ id: 'a', savedAt: 9 }]);
  });

  it('keeps the limit: the oldest entry is dropped when the list is full', async () => {
    const storage = createMemoryStorage();
    const full = Array.from({ length: MAX_FAVORITES }, (_, i) => ({ id: `s${i}`, savedAt: 1000 + i }));
    await storage.set('favorites:v1:en', full);

    const next = await restoreFavorite(storage, 'en', { id: 'old', savedAt: 5 });
    // The restored sentence is the oldest, so it is the one that does not fit.
    expect(next).toHaveLength(MAX_FAVORITES);
    expect(next.some((favorite) => favorite.id === 'old')).toBe(false);

    const newer = await restoreFavorite(storage, 'en', { id: 'newer', savedAt: 5000 });
    expect(newer).toHaveLength(MAX_FAVORITES);
    expect(newer[0]).toEqual({ id: 'newer', savedAt: 5000 });
  });

  it('ignores an invalid entry and only touches its own language', async () => {
    const storage = createMemoryStorage();
    await toggleFavorite(storage, 'en', 'a', 1);
    expect(await restoreFavorite(storage, 'en', { id: '', savedAt: 3 })).toEqual([{ id: 'a', savedAt: 1 }]);

    await restoreFavorite(storage, 'id', { id: 'x', savedAt: 2 });
    expect(await loadFavorites(storage, 'en')).toEqual([{ id: 'a', savedAt: 1 }]);
    expect(await loadFavorites(storage, 'id')).toEqual([{ id: 'x', savedAt: 2 }]);
  });
});
