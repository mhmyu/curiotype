import { toKey } from '@/features/typing-engine/key-stats';
import type { Sentence } from '@/lib/types';

/**
 * Picks the sentences for weak-key practice. It never writes new text: it only ranks the
 * sentences that already exist and keeps the ones richest in the keys the user mistypes most.
 * Pure functions, no DOM and no storage; the weak keys come from `stats/weak-keys.ts`.
 */

/** Share of the pool (rounded up) that practice keeps, best sentences first. */
export const PRACTICE_POOL_SHARE = 0.3;

/**
 * Smallest practice pool. A pool of one or two sentences would repeat all the time, so when
 * fewer sentences contain a weak key the pool is filled up with the next best ones.
 */
export const MIN_PRACTICE_POOL = 5;

/**
 * Share of a sentence's characters that are weak keys (0-1). Characters are compared the way
 * `key-stats` counts them (lowercased), so "Q" in the text matches the weak key "q".
 * An empty sentence or an empty key list scores 0.
 */
export function scoreSentence(text: string, weakKeys: ReadonlySet<string>): number {
  const chars = [...text];
  if (chars.length === 0 || weakKeys.size === 0) return 0;
  let hits = 0;
  for (const char of chars) {
    if (weakKeys.has(toKey(char))) hits += 1;
  }
  return hits / chars.length;
}

/**
 * The practice pool: sentences ranked by `scoreSentence` (best first; ties by id so the order
 * is stable), the top `PRACTICE_POOL_SHARE` of them (at least `MIN_PRACTICE_POOL`), and only
 * those that contain a weak key unless that would leave fewer than `MIN_PRACTICE_POOL`.
 *
 * Returns the pool unchanged when there are no weak keys, so practice without data behaves like
 * a normal test. The result is not shuffled: `createSentenceQueue` shuffles whatever pool it gets,
 * and the pool is a set, so the order only needs to be deterministic. The input is not modified.
 */
export function pickWeakKeySentences(
  pool: readonly Sentence[],
  weakKeys: readonly string[],
): Sentence[] {
  const keys = new Set(weakKeys.map(toKey));
  if (keys.size === 0 || pool.length === 0) return [...pool];

  const ranked = pool
    .map((sentence) => ({ sentence, score: scoreSentence(sentence.text, keys) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.sentence.id < b.sentence.id ? -1 : a.sentence.id > b.sentence.id ? 1 : 0),
    );

  const size = Math.min(
    ranked.length,
    Math.max(MIN_PRACTICE_POOL, Math.ceil(ranked.length * PRACTICE_POOL_SHARE)),
  );
  const top = ranked.slice(0, size);
  const withKey = top.filter((entry) => entry.score > 0);
  const chosen =
    withKey.length >= Math.min(MIN_PRACTICE_POOL, ranked.length) ? withKey : top;
  return chosen.map((entry) => entry.sentence);
}
