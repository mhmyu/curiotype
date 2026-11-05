import type { TestMode } from './types';

export const TIME_DURATIONS = [15, 30, 60, 120] as const;

const INITIAL_SENTENCE_COUNT = 3;
/** Append another sentence when fewer than this many characters remain. */
const REFILL_THRESHOLD_CHARS = 80;

/** Fixed duration; sentences keep flowing until time runs out. */
export const timeMode: TestMode = {
  id: 'time',
  initialSentences: (next) => Array.from({ length: INITIAL_SENTENCE_COUNT }, () => next()),
  shouldAppend: ({ typedLength, targetLength }) =>
    targetLength - typedLength < REFILL_THRESHOLD_CHARS,
  isFinished: ({ elapsedMs }, settings) => elapsedMs >= settings.durationSec * 1000,
  effectiveElapsedMs: (elapsedMs, settings) => Math.min(elapsedMs, settings.durationSec * 1000),
};
