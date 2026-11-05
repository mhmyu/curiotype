import type { ContentLang } from '@/i18n/config';
import type { StorageAdapter } from '@/lib/storage/types';

// Versioned key, one per content language ("seen:v1:id"); the stored value is a plain array of sentence ids.
export const SEEN_KEY_PREFIX = 'seen:v1:';

export function seenKey(contentLang: ContentLang): string {
  return `${SEEN_KEY_PREFIX}${contentLang}`;
}

/** Ids of sentences the user has typed to the end at least once in this content language (insertion order, no duplicates). */
export async function loadSeen(
  storage: StorageAdapter,
  contentLang: ContentLang,
): Promise<string[]> {
  const stored = await storage.get<unknown>(seenKey(contentLang));
  if (!Array.isArray(stored)) return [];
  const ids = stored.filter((id): id is string => typeof id === 'string' && id.length > 0);
  return [...new Set(ids)];
}

/** Adds ids to the seen list. Writes only when something new was added; returns the full list. */
export async function markSeen(
  storage: StorageAdapter,
  contentLang: ContentLang,
  ids: readonly string[],
): Promise<string[]> {
  const seen = await loadSeen(storage, contentLang);
  const known = new Set(seen);
  const added = [...new Set(ids)].filter((id) => id.length > 0 && !known.has(id));
  if (added.length === 0) return seen;

  const next = [...seen, ...added];
  await storage.set(seenKey(contentLang), next);
  return next;
}
