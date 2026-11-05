import type { ContentLang } from '@/i18n/config';
import type { Sentence } from '@/lib/types';

/*
 * Fact of the day: one sentence per local day and sentence language, the same for everyone.
 * Pure functions; the day is always an argument (`toDayKey` in `features/streak/streak.ts`
 * makes it), so tests inject dates and nothing here reads the clock.
 */

/** 32-bit FNV-1a hash of a string (UTF-16 code units; the inputs are ASCII). Unsigned. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Position of the fact of the day in a corpus of `count` sentences:
 * `hash(YYYY-MM-DD + contentLang) mod count`. Null when the corpus is empty.
 */
export function getDailyFactIndex(day: string, contentLang: ContentLang, count: number): number | null {
  if (!Number.isInteger(count) || count < 1) return null;
  return hashString(`${day}${contentLang}`) % count;
}

/** Plain code-unit order, so the result never depends on the locale. */
function compareById(a: Sentence, b: Sentence): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * The fact of the day, or null for an empty corpus. The corpus is put in id order first, so the
 * pick does not depend on the order of the list (the input is not modified). Adding or removing
 * a sentence changes the pick, since the position counts the whole corpus.
 */
export function pickDailyFact(
  sentences: readonly Sentence[],
  day: string,
  contentLang: ContentLang,
): Sentence | null {
  const index = getDailyFactIndex(day, contentLang, sentences.length);
  if (index === null) return null;
  return [...sentences].sort(compareById)[index] ?? null;
}
