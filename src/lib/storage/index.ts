import { createLocalStorageAdapter } from './local-storage-adapter';
import type { StorageAdapter } from './types';

export type { StorageAdapter } from './types';

let instance: StorageAdapter | null = null;

/**
 * Returns the app-wide storage adapter. This is the single place to swap the
 * implementation (e.g. an API-backed adapter once accounts are added).
 */
export function getStorage(): StorageAdapter {
  instance ??= createLocalStorageAdapter();
  return instance;
}
