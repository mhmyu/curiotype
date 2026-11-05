import { describe, expect, it } from 'vitest';
import { createMemoryStorage } from '@/lib/storage/memory-adapter';
import type { StorageAdapter } from '@/lib/storage/types';
import { DEFAULT_SETTINGS, SETTINGS_KEY } from './settings';
import { createSettingsStore } from './settings.svelte';

function seed(value: unknown) {
  return createMemoryStorage(new Map([[SETTINGS_KEY, JSON.stringify(value)]]));
}

function stored(storage: { data: Map<string, string> }): unknown {
  const raw = storage.data.get(SETTINGS_KEY);
  return raw === undefined ? undefined : JSON.parse(raw);
}

describe('createSettingsStore', () => {
  it('starts with the defaults and is not ready', () => {
    const store = createSettingsStore(() => createMemoryStorage());
    expect(store.current).toEqual(DEFAULT_SETTINGS);
    expect(store.ready).toBe(false);
  });

  it('does not touch storage until init() or update() is called', () => {
    let calls = 0;
    createSettingsStore(() => {
      calls += 1;
      return createMemoryStorage();
    });
    expect(calls).toBe(0);
  });

  it('init() loads saved values and becomes ready', async () => {
    const store = createSettingsStore(() => seed({ theme: 'dark', fontSize: 'lg' }));
    await store.init();
    expect(store.ready).toBe(true);
    expect(store.current).toEqual({ ...DEFAULT_SETTINGS, theme: 'dark', fontSize: 'lg' });
  });

  it('init() loads only once, even when called by several islands', async () => {
    let reads = 0;
    const storage = seed({ theme: 'light' });
    const counting: StorageAdapter = {
      ...storage,
      async get<T>(key: string) {
        reads += 1;
        return storage.get<T>(key);
      },
    };
    const store = createSettingsStore(() => counting);
    await Promise.all([store.init(), store.init(), store.init()]);
    expect(reads).toBe(1);
  });

  it('update() changes the value at once and saves it', async () => {
    const storage = createMemoryStorage();
    const store = createSettingsStore(() => storage);
    await store.init();
    const saved = store.update({ theme: 'dark' });
    expect(store.current.theme).toBe('dark');
    await saved;
    expect(stored(storage)).toEqual({ ...DEFAULT_SETTINGS, theme: 'dark' });
  });

  it('update() keeps the other fields', async () => {
    const storage = seed({ fontSize: 'lg', sound: true });
    const store = createSettingsStore(() => storage);
    await store.init();
    await store.update({ theme: 'light' });
    expect(store.current).toEqual({ ...DEFAULT_SETTINGS, fontSize: 'lg', sound: true, theme: 'light' });
    expect(stored(storage)).toEqual(store.current);
  });

  it('update() before init() does not overwrite saved fields it did not change', async () => {
    const storage = seed({ fontSize: 'lg', caretStyle: 'block' });
    const store = createSettingsStore(() => storage);
    await store.update({ theme: 'dark' });
    expect(store.ready).toBe(true);
    expect(store.current).toEqual({ ...DEFAULT_SETTINGS, fontSize: 'lg', caretStyle: 'block', theme: 'dark' });
    expect(stored(storage)).toEqual(store.current);
  });

  it('a change made before init() wins over the saved value of the same field', async () => {
    const storage = seed({ theme: 'light', fontSize: 'lg' });
    const store = createSettingsStore(() => storage);
    const loading = store.init();
    void store.update({ theme: 'dark' });
    await loading;
    expect(store.current.theme).toBe('dark');
    expect(store.current.fontSize).toBe('lg');
  });

  it('an invalid value falls back to the default and is never saved as invalid', async () => {
    const storage = createMemoryStorage();
    const store = createSettingsStore(() => storage);
    await store.init();
    await store.update({ volume: 7 });
    expect(store.current.volume).toBe(DEFAULT_SETTINGS.volume);
    expect(stored(storage)).toEqual(DEFAULT_SETTINGS);
  });

  it('saves one update after another, so the last one is what ends up stored', async () => {
    const storage = createMemoryStorage();
    const store = createSettingsStore(() => storage);
    await store.init();
    void store.update({ theme: 'dark' });
    void store.update({ theme: 'light' });
    await store.update({ fontSize: 'sm' });
    expect(stored(storage)).toEqual({ ...DEFAULT_SETTINGS, theme: 'light', fontSize: 'sm' });
  });

  it('keeps the defaults and becomes ready when loading throws', async () => {
    const failing: StorageAdapter = {
      ...createMemoryStorage(),
      async get() {
        throw new Error('boom');
      },
    };
    const store = createSettingsStore(() => failing);
    await store.init();
    expect(store.ready).toBe(true);
    expect(store.current).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps the new value in memory when saving throws', async () => {
    const failing: StorageAdapter = {
      ...createMemoryStorage(),
      async set() {
        throw new Error('quota');
      },
    };
    const store = createSettingsStore(() => failing);
    await store.init();
    await expect(store.update({ theme: 'dark' })).resolves.toBeUndefined();
    expect(store.current.theme).toBe('dark');
  });

  it('two stores are independent', async () => {
    const a = createSettingsStore(() => createMemoryStorage());
    const b = createSettingsStore(() => createMemoryStorage());
    await a.update({ theme: 'dark' });
    expect(b.current.theme).toBe('system');
  });

  it('saves and reloads the sentence language', async () => {
    const storage = createMemoryStorage();
    const store = createSettingsStore(() => storage);
    await store.init();
    expect(store.current.contentLang).toBeNull();

    await store.update({ contentLang: 'en' });
    expect(store.current.contentLang).toBe('en');
    expect((stored(storage) as { contentLang: string }).contentLang).toBe('en');

    const reloaded = createSettingsStore(() => storage);
    await reloaded.init();
    expect(reloaded.current.contentLang).toBe('en');
  });
});

describe('settingsStore.reload', () => {
  it('replaces the current values with the stored ones and becomes ready', async () => {
    const storage = seed({ theme: 'dark' });
    const store = createSettingsStore(() => storage);
    await store.init();
    expect(store.current.theme).toBe('dark');

    // The stored data is replaced from outside (data import or "delete all data").
    await storage.set(SETTINGS_KEY, { theme: 'light', fontSize: 'lg' });
    await store.reload();
    expect(store.current).toEqual({ ...DEFAULT_SETTINGS, theme: 'light', fontSize: 'lg' });
  });

  it('goes back to the defaults when the stored data was deleted, without saving anything', async () => {
    const storage = seed({ theme: 'dark' });
    const store = createSettingsStore(() => storage);
    await store.init();

    await storage.clear();
    await store.reload();
    expect(store.current).toEqual(DEFAULT_SETTINGS);
    expect(stored(storage)).toBeUndefined();
  });

  it('waits for a queued save before reading, so it never reads data older than the last update', async () => {
    const storage = createMemoryStorage();
    const store = createSettingsStore(() => storage);
    await store.init();

    void store.update({ theme: 'dark' }); // the save is queued, not awaited
    await store.reload();
    expect(store.current.theme).toBe('dark');
    expect(stored(storage)).toMatchObject({ theme: 'dark' });
  });
});
