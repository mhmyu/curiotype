import type { CategoryChars, Sentence } from '@/lib/types';

interface TypedSpan {
  sentence: Sentence;
  /** Characters typed inside this sentence (never counts the separating space). */
  typedChars: number;
}

/**
 * Splits the typed length over the target sentences. Sentences are joined with
 * a single space in the target text, which is what the offset math assumes.
 */
function getTypedSpans(sentences: readonly Sentence[], typedLength: number): TypedSpan[] {
  const spans: TypedSpan[] = [];
  let offset = 0;

  for (const sentence of sentences) {
    if (typedLength <= offset) break;
    spans.push({ sentence, typedChars: Math.min(typedLength - offset, sentence.text.length) });
    offset += sentence.text.length + 1;
  }

  return spans;
}

/** Returns the sentences the user actually started typing. */
export function getTypedSentences(sentences: readonly Sentence[], typedLength: number): Sentence[] {
  return getTypedSpans(sentences, typedLength).map((span) => span.sentence);
}

/** Returns the sentences the user typed to the last character (errors do not matter). */
export function getCompletedSentences(
  sentences: readonly Sentence[],
  typedLength: number,
): Sentence[] {
  return getTypedSpans(sentences, typedLength)
    .filter((span) => span.typedChars === span.sentence.text.length)
    .map((span) => span.sentence);
}

/** Typed characters per category; categories with no typed characters are left out. */
export function getCategoryChars(sentences: readonly Sentence[], typedLength: number): CategoryChars {
  const chars: CategoryChars = {};
  for (const { sentence, typedChars } of getTypedSpans(sentences, typedLength)) {
    chars[sentence.category] = (chars[sentence.category] ?? 0) + typedChars;
  }
  return chars;
}
