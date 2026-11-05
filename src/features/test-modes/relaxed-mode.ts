import type { TestMode } from './types';

/**
 * Relaxed mode: sentences come one at a time, with no clock and no score. A sentence is done when
 * its last character is typed (mistakes stay marked but never block); the session itself (card
 * after each sentence, "Continue" / "Finish") lives in `features/relaxed/`.
 */
export const relaxedMode: TestMode = {
  id: 'relaxed',
  initialSentences: (next) => [next()],
  shouldAppend: () => false,
  isFinished: ({ typedLength, targetLength }) => typedLength >= targetLength,
  effectiveElapsedMs: (elapsedMs) => elapsedMs,
  scored: false,
  showsClock: false,
};
