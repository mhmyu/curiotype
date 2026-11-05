import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLocalStorageAdapter } from './local-storage-adapter';
import { createMemoryStorage } from './memory-adapter';
import type { StorageAdapter } from './types';

/** Minimal localStorage stand-in; `failWrites` simulates a full quota, `broken` a blocked storage. */
class FakeLocalStorage {
  readonly map = new Map<string, string>();
  failWrites = false;
  broken = false;

  private guard(): void {
    if (this.broken) throw new Error('SecurityError');
  }
  get length(): number {
    this.guard();
    return this.map.size;
  }
  key(index: number): string | null {
    this.guard();
    return [...this.map.keys()][index] ?? null;
  }
  getItem(key: string): string | null {
    this.guard();
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.guard();
    if (this.failWrites) throw new Error('QuotaExceededError');
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.guard();
    this.map.delete(key);
  }
}

let fake: FakeLocalStorage;

beforeEach(() => {
  fake = new FakeLocalStorage();
  (globalThis as { window?: unknown }).window = { localStorage: fake };
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

const adapters: Array<[string, () => StorageAdapter]> = [
  ['memory adapter', () => createMemoryStorage()],
  ['localStorage adapter', () => createLocalStorageAdapter()],
];

describe.each(adapters)('StorageAdapter contract: %s', (_name, create) => {
  async function seeded(): Promise<StorageAdapter> {
    const storage = create();
    await storage.set('history:v1', [1]);
    await storage.set('settings:v1', { a: 1 });
    await storage.set('personal-bests:v1', {});
    return storage;
  }

  it('lists no keys when empty', async () => {
    expect(await create().keys()).toEqual([]);
  });

  it('lists all keys sorted, without any adapter prefix', async () => {
    expect(await (await seeded()).keys()).toEqual(['history:v1', 'personal-bests:v1', 'settings:v1']);
  });

  it('filters keys by prefix', async () => {
    const storage = await seeded();
    expect(await storage.keys('s')).toEqual(['settings:v1']);
    expect(await storage.keys('history:')).toEqual(['history:v1']);
    expect(await storage.keys('nothing')).toEqual([]);
  });

  it('does not list a removed key', async () => {
    const storage = await seeded();
    await storage.remove('history:v1');
    expect(await storage.keys()).toEqual(['personal-bests:v1', 'settings:v1']);
  });

  it('clear() removes every key', async () => {
    const storage = await seeded();
    await storage.clear();
    expect(await storage.keys()).toEqual([]);
    expect(await storage.get('history:v1')).toBeNull();
  });

  it('clear(prefix) removes only matching keys', async () => {
    const storage = await seeded();
    await storage.clear('history:');
    expect(await storage.keys()).toEqual(['personal-bests:v1', 'settings:v1']);
    expect(await storage.get('settings:v1')).toEqual({ a: 1 });
  });

  it('clear on an empty store does nothing', async () => {
    const storage = create();
    await expect(storage.clear()).resolves.toBeUndefined();
    expect(await storage.keys()).toEqual([]);
  });
});

describe('createLocalStorageAdapter namespace', () => {
  it('stores under the "typing:" prefix and ignores keys of other apps', async () => {
    fake.map.set('other-app:key', '1');
    fake.map.set('typing:history:v1', '[]');
    const storage = createLocalStorageAdapter();
    expect(await storage.keys()).toEqual(['history:v1']);
    await storage.clear();
    expect(fake.map.has('other-app:key')).toBe(true);
    expect(fake.map.has('typing:history:v1')).toBe(false);
  });

  it('honors a custom prefix', async () => {
    const storage = createLocalStorageAdapter('x:');
    await storage.set('a', 1);
    expect(fake.map.has('x:a')).toBe(true);
    expect(await storage.keys()).toEqual(['a']);
  });
});

describe('createLocalStorageAdapter fallback', () => {
  it('lists, reads and clears keys held in the fallback map when writes fail', async () => {
    const storage = createLocalStorageAdapter();
    await storage.set('stored', 1);
    fake.failWrites = true;
    await storage.set('fallback', 2);
    expect(fake.map.has('typing:fallback')).toBe(false);

    // keys() merges localStorage and the fallback map.
    expect(await storage.keys()).toEqual(['fallback', 'stored']);
    expect(await storage.keys('f')).toEqual(['fallback']);

    await storage.clear();
    expect(await storage.keys()).toEqual([]);
    expect(fake.map.size).toBe(0);
  });

  it('remove also drops a copy held in the fallback map', async () => {
    const storage = createLocalStorageAdapter();
    fake.failWrites = true;
    await storage.set('k', 1);
    fake.failWrites = false;
    await storage.remove('k');
    expect(await storage.keys()).toEqual([]);
  });

  it('works entirely from memory when localStorage throws on every access', async () => {
    fake.broken = true;
    const storage = createLocalStorageAdapter();
    await storage.set('a', 1);
    await storage.set('b', 2);
    expect(await storage.keys()).toEqual(['a', 'b']);
    expect(await storage.get('a')).toBe(1);
    await storage.clear('a');
    expect(await storage.keys()).toEqual(['b']);
  });

  it('works when there is no window at all (server render)', async () => {
    delete (globalThis as { window?: unknown }).window;
    const storage = createLocalStorageAdapter();
    await storage.set('a', 1);
    expect(await storage.keys()).toEqual(['a']);
    await storage.clear();
    expect(await storage.keys()).toEqual([]);
  });
});
