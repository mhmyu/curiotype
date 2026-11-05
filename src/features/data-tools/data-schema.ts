import {
  HISTORY_KEY,
  MAX_HISTORY_ENTRIES,
  PERSONAL_BESTS_KEY,
  parseHistoryEntry,
  parsePersonalBests,
} from '@/features/history/history';
import type { HistoryEntry } from '@/features/history/history';
import {
  FAVORITES_KEY_PREFIX,
  MAX_FAVORITES,
  mergeFavorites,
  parseFavorites,
} from '@/features/favorites/favorites';
import {
  CUSTOM_TEXTS_KEY,
  MAX_CUSTOM_TEXTS,
  mergeCustomTexts,
  parseCustomTexts,
} from '@/features/custom-text/custom-texts';
import { SEEN_KEY_PREFIX } from '@/features/seen/seen';
import { STREAK_KEY, mergeStreaks, parseStreak } from '@/features/streak/streak';
import type { Streak } from '@/features/streak/streak';
import { SETTINGS_KEY, parseSettings } from '@/features/settings/settings';
import {
  KEY_STATS_KEY_PREFIX,
  mergeKeyStats,
  parseKeyStats,
} from '@/features/typing-engine/key-stats';
import { isContentLang } from '@/lib/content-langs';

/**
 * Every kind of data the app stores in the browser. This is the single list used by data
 * export and import and by the privacy page (`privacy.data` in the dictionaries has one text
 * per kind), so a new feature that stores something must add its kind here: TypeScript then
 * asks for the privacy text, and the export and import start handling it.
 */
export const DATA_KINDS = [
  'history',
  'personalBests',
  'settings',
  'seen',
  'keyStats',
  'favorites',
  'streak',
  'customTexts',
] as const;
export type DataKind = (typeof DATA_KINDS)[number];

/** Storage key of each kind as shown to people (`<lang>` stands for a sentence language code). */
export const DATA_KEY_LABELS: Record<DataKind, string> = {
  history: HISTORY_KEY,
  personalBests: PERSONAL_BESTS_KEY,
  settings: SETTINGS_KEY,
  seen: `${SEEN_KEY_PREFIX}<lang>`,
  keyStats: `${KEY_STATS_KEY_PREFIX}<lang>`,
  favorites: `${FAVORITES_KEY_PREFIX}<lang>`,
  streak: STREAK_KEY,
  customTexts: CUSTOM_TEXTS_KEY,
};

/** Which kind a storage key belongs to, or null when the key is not one the app knows. */
export function getDataKind(key: string): DataKind | null {
  if (key === HISTORY_KEY) return 'history';
  if (key === PERSONAL_BESTS_KEY) return 'personalBests';
  if (key === SETTINGS_KEY) return 'settings';
  if (key === STREAK_KEY) return 'streak';
  if (key === CUSTOM_TEXTS_KEY) return 'customTexts';
  if (key.startsWith(SEEN_KEY_PREFIX) && isContentLang(key.slice(SEEN_KEY_PREFIX.length))) {
    return 'seen';
  }
  if (
    key.startsWith(KEY_STATS_KEY_PREFIX) &&
    isContentLang(key.slice(KEY_STATS_KEY_PREFIX.length))
  ) {
    return 'keyStats';
  }
  if (
    key.startsWith(FAVORITES_KEY_PREFIX) &&
    isContentLang(key.slice(FAVORITES_KEY_PREFIX.length))
  ) {
    return 'favorites';
  }
  return null;
}

export type Validation = { valid: true; value: unknown } | { valid: false };

const INVALID: Validation = { valid: false };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateHistory(raw: unknown): Validation {
  if (!Array.isArray(raw) || raw.length > MAX_HISTORY_ENTRIES) return INVALID;
  const entries: HistoryEntry[] = [];
  const ids = new Set<string>();
  for (const item of raw) {
    const entry = parseHistoryEntry(item);
    if (!entry) return INVALID;
    if (ids.has(entry.id)) continue; // a duplicated id is dropped, not an error
    ids.add(entry.id);
    entries.push(entry);
  }
  return { valid: true, value: entries };
}

function validateSeen(raw: unknown): Validation {
  if (!Array.isArray(raw)) return INVALID;
  if (!raw.every((id) => typeof id === 'string' && id.length > 0)) return INVALID;
  return { valid: true, value: [...new Set(raw as string[])] };
}

function validateFavorites(raw: unknown): Validation {
  if (!Array.isArray(raw) || raw.length > MAX_FAVORITES) return INVALID;
  const favorites = parseFavorites(raw);
  // The tolerant reader drops bad entries and repeated ids; a strict check accepts neither, so
  // the list must come out as long as it went in.
  return favorites.length === raw.length ? { valid: true, value: favorites } : INVALID;
}

function validateCustomTexts(raw: unknown): Validation {
  if (!Array.isArray(raw) || raw.length > MAX_CUSTOM_TEXTS) return INVALID;
  const texts = parseCustomTexts(raw);
  // Like the favorites: the tolerant reader drops bad entries and repeats, so the list must come
  // out as long as it went in.
  return texts.length === raw.length ? { valid: true, value: texts } : INVALID;
}

/**
 * Strict check of one stored value, used when importing. Unlike the tolerant readers the app
 * uses at runtime (which quietly drop bad entries), any wrong part makes the value invalid,
 * so a damaged file is rejected as a whole instead of being half imported.
 */
export function validateValue(kind: DataKind, raw: unknown): Validation {
  switch (kind) {
    case 'history':
      return validateHistory(raw);
    case 'personalBests': {
      if (!isPlainObject(raw)) return INVALID;
      const bests = parsePersonalBests(raw);
      return Object.keys(bests).length === Object.keys(raw).length
        ? { valid: true, value: bests }
        : INVALID;
    }
    case 'settings':
      // Settings are tolerant by design (each field falls back to its default).
      return isPlainObject(raw) ? { valid: true, value: parseSettings(raw) } : INVALID;
    case 'seen':
      return validateSeen(raw);
    case 'keyStats': {
      if (!isPlainObject(raw)) return INVALID;
      const stats = parseKeyStats(raw);
      return Object.keys(stats).length === Object.keys(raw).length
        ? { valid: true, value: stats }
        : INVALID;
    }
    case 'favorites':
      return validateFavorites(raw);
    case 'streak': {
      const streak = parseStreak(raw);
      return streak ? { valid: true, value: streak } : INVALID;
    }
    case 'customTexts':
      return validateCustomTexts(raw);
  }
}

/**
 * Merges an imported value into the value already stored ("merge" import). `existing` is the
 * raw stored value (null when nothing is stored); `incoming` has passed `validateValue`.
 *
 * - history: union by entry id, newest first, trimmed to the history limit.
 * - personal bests: the higher WPM of each bucket.
 * - settings: the current settings win; the imported ones are used only when none are stored.
 * - seen: union (current ids first).
 * - key stats: attempts and errors are added, then the usual decay applies.
 * - favorites: union by id (the later save time wins), newest first, trimmed to the limit.
 * - streak: the one with the later day (the higher counts on the same day); best = the higher best.
 * - custom texts: union by text (the later save wins), newest first, trimmed to the limit.
 */
export function mergeValue(kind: DataKind, existing: unknown, incoming: unknown): unknown {
  switch (kind) {
    case 'history': {
      const current = Array.isArray(existing)
        ? existing.filter((e): e is HistoryEntry => isPlainObject(e) && typeof e.id === 'string')
        : [];
      const known = new Set(current.map((entry) => entry.id));
      const added = (incoming as HistoryEntry[]).filter((entry) => !known.has(entry.id));
      return [...current, ...added]
        .sort((a, b) => (Number(b.finishedAt) || 0) - (Number(a.finishedAt) || 0))
        .slice(0, MAX_HISTORY_ENTRIES);
    }
    case 'personalBests': {
      const merged = parsePersonalBests(existing);
      for (const [key, wpm] of Object.entries(incoming as Record<string, number>)) {
        if (wpm > (merged[key] ?? 0)) merged[key] = wpm;
      }
      return merged;
    }
    case 'settings':
      return isPlainObject(existing) ? parseSettings(existing) : incoming;
    case 'seen': {
      const current = Array.isArray(existing)
        ? existing.filter((id): id is string => typeof id === 'string' && id.length > 0)
        : [];
      return [...new Set([...current, ...(incoming as string[])])];
    }
    case 'keyStats':
      return mergeKeyStats(parseKeyStats(existing), incoming as ReturnType<typeof parseKeyStats>);
    case 'favorites':
      return mergeFavorites(parseFavorites(existing), incoming as ReturnType<typeof parseFavorites>);
    case 'streak':
      return mergeStreaks(parseStreak(existing) ?? { lastDay: null, current: 0, best: 0, todayCount: 0 }, incoming as Streak);
    case 'customTexts':
      return mergeCustomTexts(parseCustomTexts(existing), incoming as ReturnType<typeof parseCustomTexts>);
  }
}
