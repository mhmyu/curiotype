import type { ContentLang } from '@/i18n/config';
import { withStorageLock } from '@/lib/storage/lock';
import type { StorageAdapter } from '@/lib/storage/types';

// Versioned key, one per content language ("favorites:v1:id"), like `seen` and `key-stats`.
// The stored value is an array of `Favorite`, newest first.
export const FAVORITES_KEY_PREFIX = 'favorites:v1:';

/** Most sentences kept per content language; when the list is full the oldest one is dropped. */
export const MAX_FAVORITES = 500;

export interface Favorite {
  /** Sentence id (`<lang>-<category>-NNN`). */
  id: string;
  /** Time the sentence was saved (ms since the epoch). */
  savedAt: number;
}

export function favoritesKey(contentLang: ContentLang): string {
  return `${FAVORITES_KEY_PREFIX}${contentLang}`;
}

function isFavorite(value: unknown): value is Favorite {
  if (typeof value !== 'object' || value === null) return false;
  const { id, savedAt } = value as Record<string, unknown>;
  return (
    typeof id === 'string' && id.length > 0 && typeof savedAt === 'number' && Number.isFinite(savedAt) && savedAt >= 0
  );
}

/** Newest first, one entry per id (the latest `savedAt` wins), at most `MAX_FAVORITES`. */
function normalize(items: readonly Favorite[]): Favorite[] {
  const latest = new Map<string, number>();
  for (const { id, savedAt } of items) {
    const known = latest.get(id);
    if (known === undefined || savedAt > known) latest.set(id, savedAt);
  }
  return [...latest.entries()]
    .map(([id, savedAt]) => ({ id, savedAt }))
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, MAX_FAVORITES);
}

/** Tolerant reader: anything that is not a valid entry is dropped; never throws. */
export function parseFavorites(raw: unknown): Favorite[] {
  if (!Array.isArray(raw)) return [];
  return normalize(raw.filter(isFavorite).map(({ id, savedAt }) => ({ id, savedAt })));
}

/** Union of two lists by id (the later `savedAt` wins), newest first, trimmed to the limit. Used by data import. */
export function mergeFavorites(current: readonly Favorite[], incoming: readonly Favorite[]): Favorite[] {
  return normalize([...current, ...incoming]);
}

async function saveFavorites(
  storage: StorageAdapter,
  contentLang: ContentLang,
  favorites: readonly Favorite[],
): Promise<void> {
  // An empty list removes the key, so exports and the stored data stay free of empty lists.
  if (favorites.length === 0) await storage.remove(favoritesKey(contentLang));
  else await storage.set(favoritesKey(contentLang), favorites);
}

/**
 * Applies `change` to the list read inside the lock and saves the result when it differs (same
 * length and same entries means nothing is written). Returns the list after the change.
 */
function updateFavorites(
  storage: StorageAdapter,
  contentLang: ContentLang,
  change: (current: Favorite[]) => Favorite[],
): Promise<Favorite[]> {
  return withStorageLock(favoritesKey(contentLang), async () => {
    const current = await loadFavorites(storage, contentLang);
    const next = change(current);
    if (next !== current && !sameFavorites(current, next)) {
      await saveFavorites(storage, contentLang, next);
    }
    return next;
  });
}

function sameFavorites(a: readonly Favorite[], b: readonly Favorite[]): boolean {
  return a.length === b.length && a.every((item, i) => item.id === b[i].id && item.savedAt === b[i].savedAt);
}

/** Saved sentences of one content language, newest first. */
export async function loadFavorites(
  storage: StorageAdapter,
  contentLang: ContentLang,
): Promise<Favorite[]> {
  return parseFavorites(await storage.get<unknown>(favoritesKey(contentLang)));
}

/** Saves the sentence when it is not saved yet, removes it when it is. Returns the new list. */
export function toggleFavorite(
  storage: StorageAdapter,
  contentLang: ContentLang,
  sentenceId: string,
  now: number = Date.now(),
): Promise<Favorite[]> {
  return updateFavorites(storage, contentLang, (current) =>
    current.some((favorite) => favorite.id === sentenceId)
      ? current.filter((favorite) => favorite.id !== sentenceId)
      : normalize([{ id: sentenceId, savedAt: now }, ...current]),
  );
}

/** Removes one sentence (nothing happens when it is not saved). Returns the new list. */
export function removeFavorite(
  storage: StorageAdapter,
  contentLang: ContentLang,
  sentenceId: string,
): Promise<Favorite[]> {
  return updateFavorites(storage, contentLang, (current) =>
    current.filter((favorite) => favorite.id !== sentenceId),
  );
}

/**
 * Puts a removed sentence back with its original `savedAt`, so it returns to its old place in the
 * newest-first list (the "Undo" of the collection page). Nothing changes when the id is saved
 * again in the meantime (no duplicate); the limit of `MAX_FAVORITES` still holds. Returns the list.
 */
export function restoreFavorite(
  storage: StorageAdapter,
  contentLang: ContentLang,
  entry: Favorite,
): Promise<Favorite[]> {
  return updateFavorites(storage, contentLang, (current) =>
    !isFavorite(entry) || current.some((favorite) => favorite.id === entry.id)
      ? current
      : normalize([{ id: entry.id, savedAt: entry.savedAt }, ...current]),
  );
}

/**
 * Drops saved ids that no longer exist in the sentence corpus (a sentence that was removed from
 * the content files). Writes only when something was dropped. Returns the cleaned list.
 */
export function pruneFavorites(
  storage: StorageAdapter,
  contentLang: ContentLang,
  existingIds: ReadonlySet<string>,
): Promise<Favorite[]> {
  return updateFavorites(storage, contentLang, (current) =>
    current.filter((favorite) => existingIds.has(favorite.id)),
  );
}
