import { RECORD_MODE_IDS, SCORED_MODE_IDS } from '@/features/test-modes';
import type { ContentLang } from '@/i18n/config';
import type { StorageAdapter } from '@/lib/storage/types';
import { CATEGORIES, DIFFICULTIES } from '@/lib/taxonomy';
import type { Category, Difficulty } from '@/lib/taxonomy';
import type { CategoryChars, RecordModeId, ScoredModeId } from '@/lib/types';

// Keys are versioned so the stored shape can be migrated later.
export const HISTORY_KEY = 'history:v1';
export const PERSONAL_BESTS_KEY = 'personal-bests:v1';
export const MAX_HISTORY_ENTRIES = 200;

export interface HistoryEntry {
  id: string;
  finishedAt: number;
  /** Language of the sentences typed (not the interface language). */
  contentLang: ContentLang;
  mode: ScoredModeId;
  /** null for modes without a fixed duration. */
  durationSec: number | null;
  /**
   * Number of sentences of a count-mode test; null (or absent) for other modes. Optional because
   * entries saved before typing-v36 do not have it.
   */
  sentenceCount?: number | null;
  /**
   * True when the test ran with stop-on-error (a wrong character stops the cursor). Such tests
   * have their own records. Optional: absent means off, and entries saved before typing-v39
   * do not have it.
   */
  stopOnError?: boolean;
  category: Category | 'all';
  difficulty: Difficulty | 'all';
  wpm: number;
  rawWpm: number;
  accuracy: number;
  consistency: number;
  errors: number;
  /**
   * Ids of the sentences the user started typing, in order. Optional because
   * entries saved before typing-v13 do not have it; readers must tolerate its absence.
   */
  sentenceIds?: string[];
  /** Typed characters per category (same offset logic as `learned.ts`). Optional like `sentenceIds`. */
  categoryChars?: CategoryChars;
}

export type NewHistoryEntry = Omit<HistoryEntry, 'id' | 'finishedAt'>;

/** Best WPM per bucket (content language + mode + duration or sentence count + stop-on-error). Stored apart from history so trimming never loses a record. */
export type PersonalBests = Record<string, number>;

export interface BucketInfo {
  contentLang: ContentLang;
  /** Only modes with records: custom text never has a bucket. */
  mode: RecordModeId;
  /** Only time mode has a duration. */
  durationSec: number | null;
  /** Only count mode has a sentence count. */
  sentenceCount?: number | null;
  /** Stop-on-error tests are a bucket of their own; absent or false = off. */
  stopOnError?: boolean;
}

/** The mode option a bucket is split by: seconds (time), sentences (count) or null (other modes). */
export function getBucketOption({
  mode,
  durationSec,
  sentenceCount,
}: {
  mode: ScoredModeId;
  durationSec: number | null;
  sentenceCount?: number | null;
}): number | null {
  if (mode === 'time') return durationSec;
  if (mode === 'count') return sentenceCount ?? null;
  return null;
}

/** Last segment of the key of a stop-on-error bucket. Ordinary keys have only three segments. */
export const STOP_ON_ERROR_SEGMENT = 'soe';

/** Key shape: `<contentLang>:<mode>:<seconds | sentence count | na>`, plus `:soe` with stop-on-error. */
export function getBucketKey(info: BucketInfo): string {
  const key = `${info.contentLang}:${info.mode}:${getBucketOption(info) ?? 'na'}`;
  return info.stopOnError ? `${key}:${STOP_ON_ERROR_SEGMENT}` : key;
}

export function parseBucketKey(key: string): BucketInfo {
  const [contentLang, mode, option, flag] = key.split(':');
  const value = option === 'na' ? null : Number(option);
  const base = {
    contentLang: contentLang as ContentLang,
    mode: mode as RecordModeId,
    ...(flag === STOP_ON_ERROR_SEGMENT ? { stopOnError: true } : {}),
  };
  // Only a count-mode key carries a sentence count; other keys keep their original shape.
  return mode === 'count'
    ? { ...base, durationSec: null, sentenceCount: value }
    : { ...base, durationSec: value };
}

/** Works without crypto.randomUUID, which needs a secure context (not plain-HTTP LAN testing). */
function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== 'object') return false;
  const { contentLang } = value as Record<string, unknown>;
  return typeof contentLang === 'string' && contentLang.length > 0;
}

/**
 * Entries without `contentLang` (saved before typing-v20, when the field was
 * called `lang`) are dropped instead of migrated: there are no real users yet,
 * and the history list would otherwise fail on them.
 */
export async function loadHistory(storage: StorageAdapter): Promise<HistoryEntry[]> {
  const stored = await storage.get<unknown>(HISTORY_KEY);
  return Array.isArray(stored) ? stored.filter(isHistoryEntry) : [];
}

/** True for a key shaped like `getBucketKey` output: `<contentLang>:<mode>:<number | na>[:soe]`. */
export function isBucketKey(key: string): boolean {
  const parts = key.split(':');
  if (parts.length !== 3 && parts.length !== 4) return false;
  const [contentLang, mode, duration, flag] = parts;
  if (parts.length === 4 && flag !== STOP_ON_ERROR_SEGMENT) return false;
  return (
    contentLang.length > 0 &&
    RECORD_MODE_IDS.includes(mode as RecordModeId) &&
    (duration === 'na' || /^[1-9]\d*$/.test(duration))
  );
}

/**
 * Tolerant reader for stored personal bests: keeps only entries whose key is a bucket key and
 * whose value is a finite, non-negative number. Anything else (a string, an array, a broken
 * entry) is dropped instead of leaking into the UI.
 */
export function parsePersonalBests(raw: unknown): PersonalBests {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const bests: PersonalBests = {};
  for (const [key, value] of Object.entries(raw)) {
    if (isBucketKey(key) && typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      bests[key] = value;
    }
  }
  return bests;
}

export async function loadPersonalBests(storage: StorageAdapter): Promise<PersonalBests> {
  return parsePersonalBests(await storage.get<unknown>(PERSONAL_BESTS_KEY));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Strict check of one history entry, used when importing a file: every field must have its
 * exact type. (`loadHistory` stays tolerant so a slightly odd entry never breaks the list.)
 * Returns a clean copy without unknown fields, or null when the entry is not valid.
 */
export function parseHistoryEntry(raw: unknown): HistoryEntry | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const e = raw as Record<string, unknown>;

  if (typeof e.id !== 'string' || e.id.length === 0) return null;
  if (!isFiniteNumber(e.finishedAt)) return null;
  if (typeof e.contentLang !== 'string' || e.contentLang.length === 0) return null;
  if (!SCORED_MODE_IDS.includes(e.mode as ScoredModeId)) return null;
  if (e.durationSec !== null && !(isFiniteNumber(e.durationSec) && e.durationSec > 0)) return null;
  if (
    e.sentenceCount !== undefined &&
    e.sentenceCount !== null &&
    !(Number.isInteger(e.sentenceCount) && (e.sentenceCount as number) > 0)
  ) {
    return null;
  }
  if (e.stopOnError !== undefined && typeof e.stopOnError !== 'boolean') return null;
  if (e.category !== 'all' && !CATEGORIES.includes(e.category as Category)) return null;
  if (e.difficulty !== 'all' && !DIFFICULTIES.includes(e.difficulty as Difficulty)) return null;
  for (const field of ['wpm', 'rawWpm', 'accuracy', 'consistency', 'errors'] as const) {
    if (!isFiniteNumber(e[field]) || (e[field] as number) < 0) return null;
  }

  const entry: HistoryEntry = {
    id: e.id,
    finishedAt: e.finishedAt,
    contentLang: e.contentLang,
    mode: e.mode as ScoredModeId,
    durationSec: e.durationSec as number | null,
    category: e.category as Category | 'all',
    difficulty: e.difficulty as Difficulty | 'all',
    wpm: e.wpm as number,
    rawWpm: e.rawWpm as number,
    accuracy: e.accuracy as number,
    consistency: e.consistency as number,
    errors: e.errors as number,
  };

  if (typeof e.sentenceCount === 'number') entry.sentenceCount = e.sentenceCount;
  // Stored only when on, like the bucket key: absent always means off.
  if (e.stopOnError === true) entry.stopOnError = true;

  if (e.sentenceIds !== undefined) {
    if (!Array.isArray(e.sentenceIds) || !e.sentenceIds.every((id) => typeof id === 'string')) {
      return null;
    }
    entry.sentenceIds = e.sentenceIds as string[];
  }
  if (e.categoryChars !== undefined) {
    if (!e.categoryChars || typeof e.categoryChars !== 'object' || Array.isArray(e.categoryChars)) {
      return null;
    }
    const chars: CategoryChars = {};
    for (const [category, count] of Object.entries(e.categoryChars)) {
      if (!CATEGORIES.includes(category as Category)) return null;
      if (!isFiniteNumber(count) || count < 0) return null;
      chars[category as Category] = count;
    }
    entry.categoryChars = chars;
  }
  return entry;
}

export interface RecordOutcome {
  history: HistoryEntry[];
  personalBests: PersonalBests;
  isPersonalBest: boolean;
}

/** True for an entry of a mode that keeps records (everything except custom text). */
function hasRecordMode(entry: HistoryEntry): entry is HistoryEntry & { mode: RecordModeId } {
  return RECORD_MODE_IDS.includes(entry.mode as RecordModeId);
}

/**
 * Saves a finished test and updates the personal best of its bucket. A test of a mode without
 * records (custom text) only enters the history: it is never a personal best.
 */
export async function recordResult(
  storage: StorageAdapter,
  input: NewHistoryEntry,
): Promise<RecordOutcome> {
  const entry: HistoryEntry = { ...input, id: createId(), finishedAt: Date.now() };
  const [history, personalBests] = await Promise.all([
    loadHistory(storage),
    loadPersonalBests(storage),
  ]);

  if (!hasRecordMode(entry)) {
    const nextHistory = [entry, ...history].slice(0, MAX_HISTORY_ENTRIES);
    await storage.set(HISTORY_KEY, nextHistory);
    return { history: nextHistory, personalBests, isPersonalBest: false };
  }

  const key = getBucketKey(entry);
  const isPersonalBest = entry.wpm > (personalBests[key] ?? 0);
  const nextHistory = [entry, ...history].slice(0, MAX_HISTORY_ENTRIES);
  const nextBests = isPersonalBest ? { ...personalBests, [key]: entry.wpm } : personalBests;

  await storage.set(HISTORY_KEY, nextHistory);
  if (isPersonalBest) await storage.set(PERSONAL_BESTS_KEY, nextBests);

  return { history: nextHistory, personalBests: nextBests, isPersonalBest };
}
