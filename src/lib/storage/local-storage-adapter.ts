import type { StorageAdapter } from './types';

/** Prefix of every key the app writes to localStorage (`history:v1` becomes `typing:history:v1`). */
export const STORAGE_PREFIX = 'typing:';

/**
 * Browser localStorage adapter. Falls back to an in-memory map when localStorage
 * is unavailable (private mode, blocked storage, quota exceeded, server render).
 *
 * Every operation touches both places, so a key written to the fallback map
 * (for example after a quota error) is still listed by `keys` and is still
 * removed by `remove` and `clear`.
 */
export function createLocalStorageAdapter(prefix = STORAGE_PREFIX): StorageAdapter {
  const memory = new Map<string, string>();

  function readRaw(key: string): string | null {
    try {
      return window.localStorage.getItem(prefix + key);
    } catch {
      return memory.get(key) ?? null;
    }
  }

  function writeRaw(key: string, value: string): void {
    try {
      window.localStorage.setItem(prefix + key, value);
    } catch {
      memory.set(key, value);
    }
  }

  function removeRaw(key: string): void {
    memory.delete(key);
    try {
      window.localStorage.removeItem(prefix + key);
    } catch {
      // Nothing else to remove: the fallback map was already cleaned above.
    }
  }

  /** Relative keys (adapter prefix stripped) found in localStorage; empty if it is unavailable. */
  function listStoredKeys(): string[] {
    const found: string[] = [];
    try {
      const storage = window.localStorage;
      for (let i = 0; i < storage.length; i += 1) {
        const fullKey = storage.key(i);
        if (fullKey !== null && fullKey.startsWith(prefix)) {
          found.push(fullKey.slice(prefix.length));
        }
      }
    } catch {
      // localStorage unavailable: only the fallback map can hold data.
    }
    return found;
  }

  function listKeys(keyPrefix: string): string[] {
    const all = new Set([...listStoredKeys(), ...memory.keys()]);
    return [...all].filter((key) => key.startsWith(keyPrefix)).sort();
  }

  return {
    async get<T>(key: string): Promise<T | null> {
      const raw = readRaw(key);
      if (raw === null) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },
    async set<T>(key: string, value: T): Promise<void> {
      writeRaw(key, JSON.stringify(value));
    },
    async remove(key: string): Promise<void> {
      removeRaw(key);
    },
    async keys(keyPrefix = ''): Promise<string[]> {
      return listKeys(keyPrefix);
    },
    async clear(keyPrefix = ''): Promise<void> {
      // Collect first: removing while iterating localStorage shifts its indexes.
      for (const key of listKeys(keyPrefix)) removeRaw(key);
    },
  };
}
