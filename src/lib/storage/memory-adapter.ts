import type { StorageAdapter } from './types';

/**
 * In-memory StorageAdapter, mainly for unit tests. Values are stored as JSON
 * strings, exactly like the localStorage adapter, so tests see the same
 * serialization behavior (no shared object references, no non-JSON values).
 * `data` is exposed so a test can seed or inspect the raw stored strings.
 */
export function createMemoryStorage(
  data: Map<string, string> = new Map(),
): StorageAdapter & { readonly data: Map<string, string> } {
  return {
    data,
    async get<T>(key: string): Promise<T | null> {
      const raw = data.get(key);
      if (raw === undefined) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },
    async set<T>(key: string, value: T): Promise<void> {
      data.set(key, JSON.stringify(value));
    },
    async remove(key: string): Promise<void> {
      data.delete(key);
    },
    async keys(prefix = ''): Promise<string[]> {
      return [...data.keys()].filter((key) => key.startsWith(prefix)).sort();
    },
    async clear(prefix = ''): Promise<void> {
      for (const key of [...data.keys()]) {
        if (key.startsWith(prefix)) data.delete(key);
      }
    },
  };
}
