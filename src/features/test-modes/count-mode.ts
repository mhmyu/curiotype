import type { TestMode } from './types';

/** Selectable numbers of sentences per test. */
export const COUNT_OPTIONS = [1, 3, 5, 10] as const;

/** All sentences are shown at once; the test ends when the last character is typed. */
export const countMode: TestMode = {
  id: 'count',
  initialSentences: (next, settings) => Array.from({ length: settings.sentenceCount }, () => next()),
  shouldAppend: () => false,
  isFinished: ({ typedLength, targetLength }) => typedLength >= targetLength,
  effectiveElapsedMs: (elapsedMs) => elapsedMs,
};
