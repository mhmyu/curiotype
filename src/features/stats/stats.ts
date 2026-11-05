import { SCORED_MODE_IDS } from '@/features/test-modes';
import { getBucketOption, parseBucketKey } from '@/features/history/history';
import type { HistoryEntry, PersonalBests } from '@/features/history/history';
import type { ContentLang } from '@/i18n/config';
import { CATEGORIES } from '@/lib/taxonomy';
import type { Category } from '@/lib/taxonomy';
import type { CategoryChars, ScoredModeId, Sentence } from '@/lib/types';

/**
 * Pure helpers behind the statistics page (`StatsPage.svelte`). Nothing here touches the
 * DOM, the storage or the clock, so every function is covered by unit tests. All of them work
 * on the data of ONE sentence language: the page filters the history with
 * `filterByContentLang` first.
 */

/** Tests shown in the WPM trend (the most recent ones of the chosen mode). */
export const TREND_LIMIT = 30;

const CHARS_PER_WORD = 5;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;

const round1 = (value: number): number => Math.round(value * 10) / 10;

/** Share of `part` in `total` as a whole percentage (0 when `total` is 0). */
export function percentOf(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

/** Entries typed in one sentence language (the interface language does not matter). */
export function filterByContentLang(
  history: readonly HistoryEntry[],
  contentLang: ContentLang,
): HistoryEntry[] {
  return history.filter((entry) => entry.contentLang === contentLang);
}

function sumChars(chars: CategoryChars | undefined): number {
  if (!chars) return 0;
  let total = 0;
  for (const count of Object.values(chars)) total += count ?? 0;
  return total;
}

/**
 * Seconds spent typing in one test. The history does not store the elapsed time, so it is
 * derived: a test with a fixed duration (time mode) lasted exactly that long; any other test
 * lasted `typed characters / 5 / raw WPM` minutes (raw WPM is computed from the typed length
 * and the elapsed time, so this inverts it; the typed length is the sum of `categoryChars`).
 * Entries without `categoryChars` (saved before typing-v13) and tests without typed
 * characters count as 0.
 */
export function estimateTypingSeconds(entry: HistoryEntry): number {
  if (entry.durationSec !== null && entry.durationSec > 0) return entry.durationSec;
  const chars = sumChars(entry.categoryChars);
  if (chars <= 0 || entry.rawWpm <= 0) return 0;
  return (chars / CHARS_PER_WORD / entry.rawWpm) * SECONDS_PER_MINUTE;
}

export interface Totals {
  tests: number;
  /** Estimated typing time, see `estimateTypingSeconds`. */
  typingSeconds: number;
}

export function computeTotals(entries: readonly HistoryEntry[]): Totals {
  let typingSeconds = 0;
  for (const entry of entries) typingSeconds += estimateTypingSeconds(entry);
  return { tests: entries.length, typingSeconds };
}

export type DurationUnit = 'hour' | 'minute' | 'second';

export interface DurationPart {
  unit: DurationUnit;
  value: number;
}

/**
 * Splits a duration for display: under a minute it is whole seconds, under an hour whole
 * minutes, otherwise hours and minutes (rounded to the nearest minute; a zero part is left
 * out). The page formats each part with `Intl.NumberFormat` (`style: 'unit'`).
 */
export function splitDuration(totalSeconds: number): DurationPart[] {
  const total = Math.max(0, Math.round(totalSeconds));
  if (total < SECONDS_PER_MINUTE) return [{ unit: 'second', value: total }];

  const totalMinutes = Math.round(total / SECONDS_PER_MINUTE);
  const hours = Math.floor(totalMinutes / (SECONDS_PER_HOUR / SECONDS_PER_MINUTE));
  const minutes = totalMinutes % (SECONDS_PER_HOUR / SECONDS_PER_MINUTE);
  const parts: DurationPart[] = [];
  if (hours > 0) parts.push({ unit: 'hour', value: hours });
  if (minutes > 0 || hours === 0) parts.push({ unit: 'minute', value: minutes });
  return parts;
}

/** A mode with its duration: what the WPM trend and the personal bests are grouped by. */
export interface Bucket {
  mode: ScoredModeId;
  /** null for modes without a fixed duration. */
  durationSec: number | null;
  /** Only count mode; null or absent otherwise. */
  sentenceCount?: number | null;
  /** Stop-on-error tests are a bucket of their own; absent means off. */
  stopOnError?: boolean;
}

/** Builds a bucket; `sentenceCount` is only present for count mode, `stopOnError` only when on. */
function toBucket({ mode, durationSec, sentenceCount, stopOnError }: Bucket): Bucket {
  const bucket: Bucket =
    mode === 'count' && sentenceCount ? { mode, durationSec, sentenceCount } : { mode, durationSec };
  return stopOnError ? { ...bucket, stopOnError: true } : bucket;
}

/** Value for a `<select>` option; unique per bucket. */
export function bucketValue(bucket: Bucket): string {
  const value = `${bucket.mode}:${getBucketOption(bucket) ?? 'na'}`;
  return bucket.stopOnError ? `${value}:soe` : value;
}

/** Modes in registry order, then shorter durations first, then tests without stop-on-error. */
export function compareBuckets(a: Bucket, b: Bucket): number {
  const byMode = SCORED_MODE_IDS.indexOf(a.mode) - SCORED_MODE_IDS.indexOf(b.mode);
  if (byMode !== 0) return byMode;
  const byOption = (getBucketOption(a) ?? 0) - (getBucketOption(b) ?? 0);
  if (byOption !== 0) return byOption;
  return Number(Boolean(a.stopOnError)) - Number(Boolean(b.stopOnError));
}

/** The buckets that have at least one test, sorted with `compareBuckets`. */
export function listBuckets(entries: readonly HistoryEntry[]): Bucket[] {
  const byValue = new Map<string, Bucket>();
  for (const entry of entries) {
    const bucket = toBucket(entry);
    byValue.set(bucketValue(bucket), bucket);
  }
  return [...byValue.values()].sort(compareBuckets);
}

/** Bucket of the most recent test, or null without tests. */
export function latestBucket(entries: readonly HistoryEntry[]): Bucket | null {
  let latest: HistoryEntry | undefined;
  for (const entry of entries) {
    if (!latest || entry.finishedAt > latest.finishedAt) latest = entry;
  }
  return latest ? toBucket(latest) : null;
}

export interface TrendPoint {
  id: string;
  finishedAt: number;
  wpm: number;
}

/** WPM of the last `limit` tests of one bucket, oldest first (the order of a chart). */
export function getTrend(
  entries: readonly HistoryEntry[],
  bucket: Bucket,
  limit: number = TREND_LIMIT,
): TrendPoint[] {
  const key = bucketValue(bucket);
  return entries
    .filter((entry) => bucketValue(entry) === key)
    .sort((a, b) => b.finishedAt - a.finishedAt)
    .slice(0, limit)
    .reverse()
    .map(({ id, finishedAt, wpm }) => ({ id, finishedAt, wpm }));
}

export interface TrendSummary {
  /** WPM of the newest test. */
  latest: number;
  average: number;
  best: number;
}

/** Latest, average (1 decimal) and best WPM of a trend; null when it is empty. */
export function summarizeTrend(points: readonly TrendPoint[]): TrendSummary | null {
  const last = points[points.length - 1];
  if (!last) return null;
  let sum = 0;
  let best = 0;
  for (const { wpm } of points) {
    sum += wpm;
    best = Math.max(best, wpm);
  }
  return { latest: last.wpm, average: round1(sum / points.length), best };
}

/** Top of the chart's WPM axis: the best WPM rounded up to a multiple of 10 (at least 10). */
export function getTrendMax(points: readonly TrendPoint[]): number {
  const best = points.reduce((max, { wpm }) => Math.max(max, wpm), 0);
  return Math.max(10, Math.ceil(best / 10) * 10);
}

export interface CategoryAccuracy {
  category: Category;
  /** Percentage (1 decimal), or null when no character of this category was typed. */
  accuracy: number | null;
  /** Typed characters of this category the accuracy is based on. */
  chars: number;
}

/**
 * Accuracy per category. A test stores one accuracy and the typed characters per category,
 * not the errors per category, so the accuracy of a test is credited to each category in
 * proportion to its characters: the result is the character-weighted mean of the accuracies of
 * the tests that touched the category. It is exact for a test of a single category and an
 * estimate for a mixed one ("All categories"). Entries without `categoryChars` are skipped.
 */
export function computeCategoryAccuracy(entries: readonly HistoryEntry[]): CategoryAccuracy[] {
  return CATEGORIES.map((category) => {
    let chars = 0;
    let weighted = 0;
    for (const entry of entries) {
      const count = entry.categoryChars?.[category] ?? 0;
      if (count <= 0) continue;
      chars += count;
      weighted += entry.accuracy * count;
    }
    return { category, accuracy: chars > 0 ? round1(weighted / chars) : null, chars };
  });
}

export interface CategoryCoverage {
  category: Category;
  /** Sentences of this category typed to the end at least once. */
  seen: number;
  /** Sentences of this category in the corpus. */
  total: number;
}

export interface Coverage {
  seen: number;
  total: number;
  byCategory: CategoryCoverage[];
}

/**
 * How much of the corpus was typed to the end. Ids in `seenIds` that are not in the corpus
 * (a sentence removed from the content files) are ignored, so the numbers never exceed the total.
 */
export function computeCoverage(
  sentences: readonly Pick<Sentence, 'id' | 'category'>[],
  seenIds: readonly string[],
): Coverage {
  const seenSet = new Set(seenIds);
  const byCategory: CategoryCoverage[] = CATEGORIES.map((category) => ({
    category,
    seen: 0,
    total: 0,
  }));
  const rows = new Map(byCategory.map((row) => [row.category, row]));

  for (const sentence of sentences) {
    const row = rows.get(sentence.category);
    if (!row) continue;
    row.total += 1;
    if (seenSet.has(sentence.id)) row.seen += 1;
  }

  return {
    seen: byCategory.reduce((sum, row) => sum + row.seen, 0),
    total: byCategory.reduce((sum, row) => sum + row.total, 0),
    byCategory,
  };
}

export interface PersonalBest extends Bucket {
  wpm: number;
}

/** Personal bests of one sentence language, sorted with `compareBuckets`. */
export function listPersonalBests(bests: PersonalBests, contentLang: ContentLang): PersonalBest[] {
  return Object.entries(bests)
    .map(([key, wpm]) => ({ ...parseBucketKey(key), wpm }))
    .filter((best) => best.contentLang === contentLang)
    .map((best) => ({ ...toBucket(best), wpm: best.wpm }))
    .sort(compareBuckets);
}
