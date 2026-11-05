import type { TestMode } from './types';

/**
 * Custom text: the user's own text is the target, so the mode draws no sentence from the corpus
 * (`initialSentences` is empty; `TypingTest` builds the target from the chosen text). It ends when
 * the last character is typed, like Sentence mode. The result enters the history but never the
 * personal bests (`hasRecords: false`), because the WPM of different texts is not comparable.
 */
export const customMode: TestMode = {
  id: 'custom',
  initialSentences: () => [],
  shouldAppend: () => false,
  isFinished: ({ typedLength, targetLength }) => typedLength >= targetLength,
  effectiveElapsedMs: (elapsedMs) => elapsedMs,
  hasRecords: false,
};
