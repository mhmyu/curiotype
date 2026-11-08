import type { ContentLang } from '@/i18n/config';
import { withStorageLock } from '@/lib/storage/lock';
import type { StorageAdapter } from '@/lib/storage/types';
import { isAccentMerge } from './accents';

// Versioned key, one per content language ("key-stats:v1:id"); one entry per (lowercased) target character.
export const KEY_STATS_KEY_PREFIX = 'key-stats:v1:';

export function keyStatsKey(contentLang: ContentLang): string {
  return `${KEY_STATS_KEY_PREFIX}${contentLang}`;
}

/** When a key's attempts pass this value, attempts and errors are halved so recent skill weighs more. */
export const KEY_STATS_DECAY_THRESHOLD = 500;

export interface KeyStat {
  attempts: number;
  errors: number;
}

/** Keyed by the lowercased target character (the key the user was supposed to press). */
export type KeyStats = Record<string, KeyStat>;

/** The key a character is counted under: its lowercase form when that stays one character. */
export function toKey(char: string): string {
  const lower = char.toLowerCase();
  return lower.length === 1 ? lower : char;
}

/**
 * Counts the characters added between two engine states. A new character is an
 * attempt at `target[i]`; it is an error if it differs from that character.
 * Erased mistakes were already counted when typed, matching how accuracy works.
 * Returns the same object when nothing new was typed.
 *
 * `previousTyped` (optional, NFC) lets it see an accent merge: a combining mark added to the last
 * letter (`e`, then `e` + U+0301) adds no attempt, but it can turn that attempt's error into a hit
 * (or the other way round), exactly as `applyInput` does for the error count.
 */
export function tallyKeystrokes(
  tally: KeyStats,
  target: string,
  previousLength: number,
  typed: string,
  previousTyped?: string,
): KeyStats {
  if (previousTyped !== undefined && isAccentMerge(previousTyped, typed)) {
    const last = typed.length - 1;
    const wasError = previousTyped[last] !== target[last];
    const isError = typed[last] !== target[last];
    if (wasError === isError || last >= target.length) return tally;
    const key = toKey(target[last]);
    const stat = tally[key];
    if (!stat) return tally;
    return { ...tally, [key]: { ...stat, errors: Math.max(0, stat.errors + (isError ? 1 : -1)) } };
  }
  if (typed.length <= previousLength) return tally;

  const next: KeyStats = { ...tally };
  for (let i = previousLength; i < typed.length && i < target.length; i++) {
    const key = toKey(target[i]);
    const stat = next[key] ?? { attempts: 0, errors: 0 };
    next[key] = {
      attempts: stat.attempts + 1,
      errors: stat.errors + (typed[i] === target[i] ? 0 : 1),
    };
  }
  return next;
}

/** Halves (repeatedly, if needed) every key whose attempts are above the threshold. */
export function decayKeyStats(stats: KeyStats): KeyStats {
  const result: KeyStats = {};
  for (const [key, stat] of Object.entries(stats)) {
    let { attempts, errors } = stat;
    while (attempts > KEY_STATS_DECAY_THRESHOLD) {
      attempts = Math.round(attempts / 2);
      errors = Math.round(errors / 2);
    }
    result[key] = { attempts, errors };
  }
  return result;
}

/** Adds the stats of one test to the stored stats, then applies the decay. */
export function mergeKeyStats(stored: KeyStats, session: KeyStats): KeyStats {
  const merged: KeyStats = { ...stored };
  for (const [key, stat] of Object.entries(session)) {
    const current = merged[key] ?? { attempts: 0, errors: 0 };
    merged[key] = {
      attempts: current.attempts + stat.attempts,
      errors: current.errors + stat.errors,
    };
  }
  return decayKeyStats(merged);
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/** Tolerant reader: drops every entry that is not a single character with valid counts. */
export function parseKeyStats(raw: unknown): KeyStats {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

  const stats: KeyStats = {};
  for (const [key, value] of Object.entries(raw)) {
    if ([...key].length !== 1 || !value || typeof value !== 'object') continue;
    const { attempts, errors } = value as Record<string, unknown>;
    if (!isCount(attempts) || !isCount(errors) || attempts === 0 || errors > attempts) continue;
    stats[key] = { attempts, errors };
  }
  return stats;
}

export async function loadKeyStats(
  storage: StorageAdapter,
  contentLang: ContentLang,
): Promise<KeyStats> {
  return parseKeyStats(await storage.get<unknown>(keyStatsKey(contentLang)));
}

/** Merges the stats of a finished test into storage. Writes nothing for an empty session. */
export async function recordKeyStats(
  storage: StorageAdapter,
  contentLang: ContentLang,
  session: KeyStats,
): Promise<KeyStats> {
  if (Object.keys(session).length === 0) return loadKeyStats(storage, contentLang);

  // Read inside the lock: the counts of a test finished in another tab are added, not replaced.
  return withStorageLock(keyStatsKey(contentLang), async () => {
    const next = mergeKeyStats(await loadKeyStats(storage, contentLang), session);
    await storage.set(keyStatsKey(contentLang), next);
    return next;
  });
}
