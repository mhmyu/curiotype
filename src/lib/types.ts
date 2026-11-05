import type { ContentLang } from '@/i18n/config';
import type { Category, Difficulty } from './taxonomy';

/** Identifier of a test mode. Add a new id here when introducing a mode. */
export type ModeId = 'time' | 'quote' | 'count' | 'relaxed' | 'custom';

/**
 * Modes whose results are scored: they reach the history. Relaxed mode has no clock and no score,
 * so it is never stored there.
 */
export type ScoredModeId = Exclude<ModeId, 'relaxed'>;

/**
 * Scored modes that also keep personal bests and are grouped into buckets. Custom text is scored
 * (it enters the history) but the WPM of different texts is not comparable, so it has no record.
 */
export type RecordModeId = Exclude<ScoredModeId, 'custom'>;

export interface SentenceSource {
  title: string;
  /** Always present: the content schema requires a public https:// link. */
  url: string;
}

/** A sentence as served to the client (see src/pages/data/[lang]/sentences.json.ts). */
export interface Sentence {
  id: string;
  lang: ContentLang;
  category: Category;
  difficulty: Difficulty;
  text: string;
  explanation: string;
  source: SentenceSource;
}

/** Number of typed characters per category in one test (categories with zero characters are omitted). */
export type CategoryChars = Partial<Record<Category, number>>;

/** Which sentences a test draws from: all of the filtered pool, or the ones heavy in the user's weak keys. */
export type FocusMode = 'none' | 'weak-keys';

/** User-selected options for a single test run. */
export interface TestSettings {
  mode: ModeId;
  /** Only used by time-based modes. */
  durationSec: number;
  /** Only used by count mode: how many sentences make up one test. */
  sentenceCount: number;
  category: Category | 'all';
  difficulty: Difficulty | 'all';
  /** `weak-keys` practices the keys the user mistypes most (see `sentence-picker/weak-key-picker.ts`). */
  focus: FocusMode;
}
