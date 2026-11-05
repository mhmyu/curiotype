/**
 * Storage contract used by every feature that persists data.
 * It is async on purpose: a remote (API) adapter can replace the local one later
 * without changing any caller.
 *
 * Keys are always relative to the adapter's own namespace: the localStorage
 * adapter stores "history:v1" as "typing:history:v1", but callers (and the
 * values returned by `keys`) never see the "typing:" part.
 */
export interface StorageAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  /** Lists stored keys (sorted), optionally only those starting with `prefix`. */
  keys(prefix?: string): Promise<string[]>;
  /** Removes every stored key, optionally only those starting with `prefix`. */
  clear(prefix?: string): Promise<void>;
}
