import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStorage } from './memory-adapter';
import type { StorageAdapter } from './types';

/**
 * Two tabs share one origin storage but not their JavaScript memory. A tab is simulated by
 * loading the modules afresh (own in-page queue) over the same raw data; a fake Web Locks API
 * shared by both tabs stands in for `navigator.locks`. Reads are slow (a real macrotask), so
 * writers overlap unless the lock keeps them apart.
 */
function createSharedLocks() {
  const tails = new Map<string, Promise<unknown>>();
  return {
    request: async (name: string, callback: () => Promise<unknown>) => {
      const previous = tails.get(name) ?? Promise.resolve();
      const run = previous.then(callback, callback);
      tails.set(
        name,
        run.catch(() => undefined),
      );
      return run;
    },
  };
}

function slow(storage: StorageAdapter): StorageAdapter {
  return {
    ...storage,
    async get<T>(key: string) {
      const value = await storage.get<T>(key);
      await new Promise((resolve) => setTimeout(resolve, 2));
      return value;
    },
  };
}

async function openTab(data: Map<string, string>) {
  vi.resetModules();
  const [history, streak, keyStats, seen, favorites, customTexts] = await Promise.all([
    import('@/features/history/history'),
    import('@/features/streak/streak'),
    import('@/features/typing-engine/key-stats'),
    import('@/features/seen/seen'),
    import('@/features/favorites/favorites'),
    import('@/features/custom-text/custom-texts'),
  ]);
  return { storage: slow(createMemoryStorage(data)), history, streak, keyStats, seen, favorites, customTexts };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('two tabs writing at the same time', () => {
  async function twoTabs() {
    vi.stubGlobal('navigator', { locks: createSharedLocks() });
    const data = new Map<string, string>();
    const a = await openTab(data);
    const b = await openTab(data);
    return { data, a, b };
  }

  it('keeps the results of both tabs in the history', async () => {
    const { a, b } = await twoTabs();
    const base = {
      contentLang: 'en',
      mode: 'time',
      durationSec: 30,
      category: 'all',
      difficulty: 'all',
      rawWpm: 45,
      accuracy: 95,
      consistency: 80,
      errors: 2,
    } as const;

    await Promise.all([
      a.history.recordResult(a.storage, { ...base, wpm: 40 }),
      b.history.recordResult(b.storage, { ...base, wpm: 55 }),
    ]);

    const history = await a.history.loadHistory(a.storage);
    expect(history.map((entry) => entry.wpm).sort()).toEqual([40, 55]);
    // The personal best is the higher result, whichever tab finished last.
    const bests = await a.history.loadPersonalBests(a.storage);
    expect(bests['en:time:30']).toBe(55);
  });

  it('counts the tests of both tabs in the streak', async () => {
    const { a, b } = await twoTabs();
    const now = new Date(2026, 10, 8, 12);

    await Promise.all([a.streak.recordActivity(a.storage, now), b.streak.recordActivity(b.storage, now)]);

    const streak = await a.streak.loadStreak(a.storage);
    expect(streak.current).toBe(1);
    expect(streak.todayCount).toBe(2);
  });

  it('adds the key stats of both tabs', async () => {
    const { a, b } = await twoTabs();
    await Promise.all([
      a.keyStats.recordKeyStats(a.storage, 'en', { e: { attempts: 10, errors: 1 } }),
      b.keyStats.recordKeyStats(b.storage, 'en', { e: { attempts: 20, errors: 2 } }),
    ]);
    expect((await a.keyStats.loadKeyStats(a.storage, 'en')).e).toEqual({ attempts: 30, errors: 3 });
  });

  it('keeps the seen ids of both tabs', async () => {
    const { a, b } = await twoTabs();
    await Promise.all([
      a.seen.markSeen(a.storage, 'en', ['en-science-001']),
      b.seen.markSeen(b.storage, 'en', ['en-history-001']),
    ]);
    expect((await a.seen.loadSeen(a.storage, 'en')).sort()).toEqual(['en-history-001', 'en-science-001']);
  });

  it('keeps the favorites of both tabs', async () => {
    const { a, b } = await twoTabs();
    await Promise.all([
      a.favorites.toggleFavorite(a.storage, 'en', 'en-science-001', 1000),
      b.favorites.toggleFavorite(b.storage, 'en', 'en-history-001', 2000),
    ]);
    const ids = (await a.favorites.loadFavorites(a.storage, 'en')).map((favorite) => favorite.id);
    expect(ids.sort()).toEqual(['en-history-001', 'en-science-001']);
  });

  it('keeps the custom texts of both tabs', async () => {
    const { a, b } = await twoTabs();
    await Promise.all([
      a.customTexts.saveCustomText(a.storage, 'First text.', 1000),
      b.customTexts.saveCustomText(b.storage, 'Second text.', 2000),
    ]);
    const texts = (await a.customTexts.loadCustomTexts(a.storage)).map((entry) => entry.text);
    expect(texts.sort()).toEqual(['First text.', 'Second text.']);
  });
});

describe('overlapping writers in one tab (no Web Locks API)', () => {
  it('does not lose a streak count or a result', async () => {
    vi.stubGlobal('navigator', {});
    const tab = await openTab(new Map());
    const now = new Date(2026, 10, 8, 12);

    await Promise.all([
      tab.streak.recordActivity(tab.storage, now),
      tab.streak.recordActivity(tab.storage, now),
      tab.streak.recordActivity(tab.storage, now),
    ]);

    expect((await tab.streak.loadStreak(tab.storage)).todayCount).toBe(3);
  });
});
