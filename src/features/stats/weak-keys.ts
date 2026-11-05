import type { KeyStat, KeyStats } from '@/features/typing-engine/key-stats';

/**
 * Pure helpers behind the weak-keys part of the statistics page (`StatsPage.svelte`):
 * the QWERTY heat map and the list of the weakest keys. They read the per-key counts saved
 * by `typing-engine/key-stats.ts` (one sentence language at a time); nothing here touches
 * the DOM or the storage.
 */

/** A key needs this many attempts before its error rate is shown or it can be called weak. */
export const MIN_KEY_ATTEMPTS = 30;

/** Weak keys listed on the page. */
export const WEAK_KEYS_LIMIT = 5;

/**
 * Rows of the heat map for the default layout. The keys are the letters of the target text,
 * whatever the language of the interface; the layout follows the language of the *sentences*
 * (see `KEYBOARD_ROWS`).
 */
export const QWERTY_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'] as const;

/** French keyboards are AZERTY: the second row has ten letters, the third six. */
export const AZERTY_ROWS = ['azertyuiop', 'qsdfghjklm', 'wxcvbn'] as const;

/** German keyboards are QWERTZ: Y and Z swap places. */
export const QWERTZ_ROWS = ['qwertzuiop', 'asdfghjkl', 'yxcvbnm'] as const;

/**
 * Heat map rows per sentence language (spec 21.4). A language without an entry uses
 * `QWERTY_ROWS` (`id`, `en`, `es`, `pt-br`). Only plain letters are drawn; accented letters
 * are still counted in the key statistics and listed as weak keys and in weak-key practice,
 * they just have no cell on the map. Adding a language with another layout is one line here.
 */
export const KEYBOARD_ROWS: Readonly<Record<string, readonly string[]>> = {
  fr: AZERTY_ROWS,
  de: QWERTZ_ROWS,
};

/** Heat map rows of a sentence language (lowercase code); QWERTY when it has no own layout. */
export function getKeyboardRows(contentLang: string): readonly string[] {
  return Object.hasOwn(KEYBOARD_ROWS, contentLang) ? KEYBOARD_ROWS[contentLang]! : QWERTY_ROWS;
}

/** Error rate (0-1) from which a key moves to the next heat level (levels 1, 2 and 3). */
export const HEAT_THRESHOLDS = [0.02, 0.05, 0.1] as const;

/** 0 = fewer than 2% errors, 3 = 10% or more. */
export type HeatLevel = 0 | 1 | 2 | 3;

/** Share of attempts that were mistakes (0-1), or `null` when there are no attempts. */
export function rawErrorRate(stat: KeyStat): number | null {
  return stat.attempts > 0 ? stat.errors / stat.attempts : null;
}

/** Error rate of a key, or `null` while it has fewer than `MIN_KEY_ATTEMPTS` attempts. */
export function getErrorRate(stat: KeyStat | undefined): number | null {
  if (!stat || stat.attempts < MIN_KEY_ATTEMPTS) return null;
  return rawErrorRate(stat);
}

export function getHeatLevel(rate: number): HeatLevel {
  let level: HeatLevel = 0;
  if (rate >= HEAT_THRESHOLDS[0]) level = 1;
  if (rate >= HEAT_THRESHOLDS[1]) level = 2;
  if (rate >= HEAT_THRESHOLDS[2]) level = 3;
  return level;
}

export interface HeatmapKey {
  /** Lowercase key, as stored. */
  key: string;
  attempts: number;
  errors: number;
  /** Error rate as a whole percentage; `null` with too few attempts. */
  percent: number | null;
  /** `null` with too few attempts (the key is drawn as "not enough data"). */
  level: HeatLevel | null;
}

/** One list of cells per keyboard row; keys never typed have 0 attempts and no level. */
export function buildHeatmap(
  stats: KeyStats,
  rows: readonly string[] = QWERTY_ROWS,
): HeatmapKey[][] {
  return rows.map((row) =>
    [...row].map((key) => {
      const stat = stats[key];
      const rate = getErrorRate(stat);
      return {
        key,
        attempts: stat?.attempts ?? 0,
        errors: stat?.errors ?? 0,
        percent: rate === null ? null : Math.round(rate * 100),
        level: rate === null ? null : getHeatLevel(rate),
      };
    }),
  );
}

export interface WeakKey {
  key: string;
  attempts: number;
  errors: number;
  /** Error rate, 0-1. */
  rate: number;
}

/**
 * The weakest keys: at least `MIN_KEY_ATTEMPTS` attempts and at least one mistake, highest
 * error rate first (ties: more errors, then more attempts, then the key itself, so the order
 * is stable). The space bar is left out: it is in nearly every sentence, so listing it would
 * not tell the user which letters to practice. Digits, punctuation and letters of other
 * languages are included.
 */
export function listWeakKeys(stats: KeyStats, limit: number = WEAK_KEYS_LIMIT): WeakKey[] {
  const weak: WeakKey[] = [];
  for (const [key, stat] of Object.entries(stats)) {
    if (key.trim() === '') continue;
    const rate = getErrorRate(stat);
    if (rate === null || stat.errors === 0) continue;
    weak.push({ key, attempts: stat.attempts, errors: stat.errors, rate });
  }
  weak.sort(
    (a, b) =>
      b.rate - a.rate ||
      b.errors - a.errors ||
      b.attempts - a.attempts ||
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  );
  return weak.slice(0, Math.max(0, limit));
}

/** True when any key has been attempted (the page then shows the weak-keys section). */
export function hasKeyData(stats: KeyStats): boolean {
  return Object.values(stats).some((stat) => stat.attempts > 0);
}

/** Key as shown on a keycap: uppercase when that stays one character ("ß" stays as is). */
export function formatKey(key: string): string {
  const upper = key.toUpperCase();
  return [...upper].length === 1 ? upper : key;
}
