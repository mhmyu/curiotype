import type { TestMode } from './types';

/** One complete sentence; the test ends when its last character is typed. */
export const quoteMode: TestMode = {
  id: 'quote',
  initialSentences: (next) => [next()],
  shouldAppend: () => false,
  isFinished: ({ typedLength, targetLength }) => typedLength >= targetLength,
  effectiveElapsedMs: (elapsedMs) => elapsedMs,
};
